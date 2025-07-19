/**
 * Procurement routes - Flow 2
 * Handles procurement calculations and EMD processing
 */

const express = require('express');
const Joi = require('joi');
const axios = require('axios');
const { supabase } = require('../config/supabase');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { validateBody } = require('../middleware/validation');

const router = express.Router();

// Utility function to calculate EMD due date excluding weekends and holidays
function calculateEMDDueDate(allocationDate, emdDueDays = 5) {
  const startDate = new Date(allocationDate);
  let currentDate = new Date(startDate);
  let businessDaysAdded = 0;
  
  while (businessDaysAdded < emdDueDays) {
    currentDate.setDate(currentDate.getDate() + 1);
    
    // Skip weekends (Saturday = 6, Sunday = 0)
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      // TODO: Add holiday check here when holiday calendar is available
      // For now, we'll assume no holidays
      businessDaysAdded++;
    }
  }
  
  return currentDate.toISOString().split('T')[0];
}

// Utility function to fetch trading configuration
async function fetchTradingConfiguration() {
  const { data: configs, error: configError } = await supabase
    .from('trading_configuration')
    .select('config_key, config_value')
    .in('config_key', ['EMD_PERCENTAGE_LOW', 'EMD_PERCENTAGE_HIGH', 'GST_RATES', 'CANDY_RATE', 'BALE_WEIGHT', 'EMD_DUE_DAYS']);

  if (configError) {
    throw new Error(`Failed to fetch trading configuration: ${configError.message}`);
  }

  // Create config map
  const configMap = {};
  configs.forEach(config => {
    configMap[config.config_key] = config.config_value;
  });

  // Default values if config is missing
  const defaults = {
    EMD_PERCENTAGE_LOW: { percentage: 15 },
    EMD_PERCENTAGE_HIGH: { percentage: 25 },
    GST_RATES: { cgst: 2.5, sgst: 2.5, igst: 5 },
    CANDY_RATE: { base_rate: 356 },
    BALE_WEIGHT: 170,
    EMD_DUE_DAYS: 5
  };

  return {
    emdLow: configMap.EMD_PERCENTAGE_LOW?.percentage || defaults.EMD_PERCENTAGE_LOW.percentage,
    emdHigh: configMap.EMD_PERCENTAGE_HIGH?.percentage || defaults.EMD_PERCENTAGE_HIGH.percentage,
    emdThreshold: 3000,
    baleWeight: configMap.BALE_WEIGHT || defaults.BALE_WEIGHT,
    emdDueDays: configMap.EMD_DUE_DAYS || defaults.EMD_DUE_DAYS,
    gstRates: configMap.GST_RATES || defaults.GST_RATES,
    candyRate: configMap.CANDY_RATE?.base_rate || defaults.CANDY_RATE.base_rate
  };
}

// Utility function to fetch allocation with related data
async function fetchAllocationWithData(indentNumber = null, allocationId = null) {
  let query = supabase
    .from('allocation')
    .select(`
      *,
      branch_information:branch_id (
        branch_name,
        state,
        zone
      ),
      parsed_data:parsed_data_id (
        firm_name,
        seller_type,
        buyer_type,
        firm_state
      )
    `);

  if (indentNumber) {
    query = query.eq('indent_number', indentNumber);
  }
  if (allocationId) {
    query = query.eq('id', allocationId);
  }

  const { data: allocation, error: allocationError } = await query.single();

  if (allocationError || !allocation) {
    throw new Error('Allocation not found');
  }

  return allocation;
}

// Utility function to perform procurement calculations
function calculateProcurement(allocation, config) {
  const baleQty = Number(allocation.bale_quantity);
  const otrPrice = Number(allocation.otr_price);
  
  // Calculate EMD Percentage based on threshold
  const emdPercentage = baleQty <= config.emdThreshold ? config.emdLow : config.emdHigh;

  // Calculate zone-specific candy rate
  const zone = allocation.branch_information?.zone || 'West Zone';
  const isSouthZone = zone.toLowerCase().includes('south');
  const candyRateForZone = isSouthZone ? 48 : 47;
  
  // Calculate Cotton Value
  const cottonValue = candyRateForZone * (baleQty / 100) * otrPrice;

  // Calculate EMD Amount
  const emdAmount = (cottonValue * emdPercentage) / 100;

  // GST calculation based on state comparison
  const firmState = allocation.parsed_data?.firm_state || 'Unknown';
  const branchState = allocation.branch_information?.state || 'Unknown';
  const isSameState = firmState.toLowerCase() === branchState.toLowerCase();
  
  let igstAmount = 0;
  let cgstAmount = 0;
  let sgstAmount = 0;
  
  if (isSameState) {
    // Same state: Apply CGST@2.5% & SGST@2.5%
    cgstAmount = (cottonValue * config.gstRates.cgst) / 100;
    sgstAmount = (cottonValue * config.gstRates.sgst) / 100;
  } else {
    // Different state: Apply IGST@5%
    igstAmount = (cottonValue * config.gstRates.igst) / 100;
  }
  
  const gstAmount = igstAmount + cgstAmount + sgstAmount;

  // Calculate total amount
  const totalAmount = cottonValue + gstAmount;

  // Calculate due date
  const dueDate = calculateEMDDueDate(allocation.created_at || new Date().toISOString(), config.emdDueDays);

  return {
    baleQty,
    otrPrice,
    emdPercentage,
    candyRateForZone,
    cottonValue,
    emdAmount,
    igstAmount,
    cgstAmount,
    sgstAmount,
    gstAmount,
    totalAmount,
    dueDate,
    zone: allocation.branch_information?.zone || 'Unknown'
  };
}

// Utility function to create procurement data object
function createProcurementData(allocation, calculations, createdBy) {
  return {
    indent_number: allocation.indent_number,
    allocation_id: allocation.id,
    firm_name: allocation.parsed_data?.firm_name || 'Unknown',
    bale_quantity: calculations.baleQty,
    candy_rate: calculations.candyRateForZone,
    otr_price: calculations.otrPrice,
    cotton_value: calculations.cottonValue,
    emd_amount: calculations.emdAmount,
    emd_percentage: calculations.emdPercentage,
    gst_amount: calculations.gstAmount,
    igst_amount: calculations.igstAmount,
    cgst_amount: calculations.cgstAmount,
    sgst_amount: calculations.sgstAmount,
    total_amount: calculations.totalAmount,
    transaction_type: 'EMD',
    due_date: calculations.dueDate,
    created_by: createdBy,
    zone: calculations.zone
  };
}

// Validation schemas
const calculateSchema = Joi.object({
  indent_number: Joi.string().required()
});

/**
 * @route   POST /api/procurement/process-all-allocations
 * @desc    Process all allocations and populate procurement_dump table
 * @access  Private (Admin only)
 */
router.post('/process-all-allocations', 
  authenticateToken,
  authorizeRoles('admin'),
  asyncHandler(async (req, res) => {
    // Get all allocations that don't have procurement records
    const { data: allocations, error: allocationError } = await supabase
      .from('allocation')
      .select(`
        *,
        branch_information:branch_id (
          branch_name,
          state,
          zone
        ),
        parsed_data:parsed_data_id (
          firm_name,
          seller_type,
          buyer_type,
          firm_state
        )
      `)
      .not('allocation_status', 'eq', 'cancelled');

    if (allocationError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch allocations',
        error: allocationError.message
      });
    }

    // Get existing procurement records to avoid duplicates
    const { data: existingProcurements } = await supabase
      .from('procurement_dump')
      .select('indent_number');

    const existingIndents = new Set(existingProcurements?.map(p => p.indent_number) || []);

    // Filter allocations that don't have procurement records
    const allocationsToProcess = allocations.filter(alloc => !existingIndents.has(alloc.indent_number));

    if (allocationsToProcess.length === 0) {
      return res.json({
        success: true,
        message: 'All allocations already have procurement records',
        data: { processed: 0, total: allocations.length }
      });
    }

    // Fetch trading configuration
    let config;
    try {
      config = await fetchTradingConfiguration();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch trading configuration',
        error: error.message
      });
    }

    const processedRecords = [];
    const errors = [];

    // Process each allocation
    for (const allocation of allocationsToProcess) {
      try {
        // Perform calculations using utility function
        const calculations = calculateProcurement(allocation, config);
        
        // Create procurement data using utility function
        const procurementData = createProcurementData(allocation, calculations, req.user.id);

        const { data: procurement, error: procurementError } = await supabase
          .from('procurement_dump')
          .insert(procurementData)
          .select()
          .single();

        if (procurementError) {
          errors.push({
            indent_number: allocation.indent_number,
            error: procurementError.message
          });
        } else {
          processedRecords.push(procurement);
        }

      } catch (error) {
        errors.push({
          indent_number: allocation.indent_number,
          error: error.message
        });
      }
    }

    // Log the bulk processing
    await supabase
      .from('audit_log')
      .insert({
        table_name: 'procurement_dump',
        action: 'BULK_PROCUREMENT_PROCESSED',
        user_id: req.user.id,
        new_values: {
          total_processed: processedRecords.length,
          total_errors: errors.length,
          processed_indents: processedRecords.map(p => p.indent_number)
        }
      });

    res.json({
      success: true,
      message: `Processed ${processedRecords.length} allocations successfully`,
      data: {
        processed: processedRecords.length,
        total: allocations.length,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  })
);

/**
 * @route   POST /api/procurement/calculate
 * @desc    Calculate procurement costs (EMD, GST, Cotton Value)
 * @access  Private
 */
router.post('/calculate', 
  authenticateToken,
  validateBody(calculateSchema),
  asyncHandler(async (req, res) => {
    const { indent_number } = req.body;

    // Fetch allocation data using utility function
    let allocation;
    try {
      allocation = await fetchAllocationWithData(indent_number);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'Allocation not found for the given indent number'
      });
    }

    // Check if procurement record already exists
    const { data: existingProcurement } = await supabase
      .from('procurement_dump')
      .select('*')
      .eq('indent_number', indent_number)
      .single();

    if (existingProcurement) {
      return res.status(400).json({
        success: false,
        message: 'Procurement record already exists for this indent number'
      });
    }

    // Fetch trading configuration using utility function
    let config;
    try {
      config = await fetchTradingConfiguration();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch trading configuration',
        error: error.message
      });
    }

    // Perform calculations using utility function
    const calculations = calculateProcurement(allocation, config);
    
    // Create procurement data using utility function
    const procurementData = createProcurementData(allocation, calculations, req.user.id);

    const { data: procurement, error: procurementError } = await supabase
      .from('procurement_dump')
      .insert(procurementData)
      .select()
      .single();

    if (procurementError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to save procurement calculation',
        error: procurementError.message
      });
    }

    // Log the calculation
    await supabase
      .from('audit_log')
      .insert({
        table_name: 'procurement_dump',
        record_id: procurement.id,
        action: 'PROCUREMENT_CALCULATED',
        user_id: req.user.id,
        new_values: procurementData
      });

    res.json({
      success: true,
      message: 'Procurement calculation completed successfully',
      data: {
        procurement: {
          ...procurement,
          breakdown: {
            cotton_value: calculations.cottonValue,
            emd_amount: calculations.emdAmount,
            emd_percentage: calculations.emdPercentage,
            gst_breakdown: {
              total_gst: calculations.gstAmount,
              igst: calculations.igstAmount,
              cgst: calculations.cgstAmount,
              sgst: calculations.sgstAmount
            },
            total_amount: calculations.totalAmount
          }
        }
      }
    });
  })
);

/**
 * @route   GET /api/procurement/:indent_number
 * @desc    Get procurement details by indent number
 * @access  Private
 */
router.get('/:indent_number', 
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { indent_number } = req.params;

    const { data: procurement, error } = await supabase
      .from('procurement_dump')
      .select(`
        *,
        allocation:allocation_id (
          *,
          branch_information:branch_id (
            branch_name,
            branch_code,
            zone,
            state
          )
        )
      `)
      .eq('indent_number', indent_number)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !procurement) {
      return res.status(404).json({
        success: false,
        message: 'Procurement record not found'
      });
    }

    res.json({
      success: true,
      data: {
        procurement
      }
    });
  })
);

/**
 * @route   GET /api/procurement
 * @desc    Get all procurement records with pagination
 * @access  Private
 */
router.get('/', 
  authenticateToken,
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('procurement_dump')
      .select(`
        *,
        allocation:allocation_id (
          indent_number,
          branch_information:branch_id (
            branch_name,
            zone
          )
        )
      `, { count: 'exact' });

    // Role-based filtering
    if (req.user.role === 'trader') {
      query = query.eq('created_by', req.user.id);
    }

    const { data: procurements, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch procurement records',
        error: error.message
      });
    }

    const totalPages = Math.ceil(count / limit);

    res.json({
      success: true,
      data: {
        procurements,
        pagination: {
          current_page: page,
          total_pages: totalPages,
          total_records: count,
          has_next: page < totalPages,
          has_previous: page > 1,
          per_page: limit
        }
      }
    });
  })
);

/**
 * @route   POST /api/procurement/webhook/new-allocation
 * @desc    Webhook to automatically process new allocations
 * @access  Private (called by n8n or other automation)
 */
router.post('/webhook/new-allocation', 
  asyncHandler(async (req, res) => {
    const { allocation_id, indent_number } = req.body;

    if (!allocation_id || !indent_number) {
      return res.status(400).json({
        success: false,
        message: 'allocation_id and indent_number are required'
      });
    }

    // Check if procurement record already exists
    const { data: existingProcurement } = await supabase
      .from('procurement_dump')
      .select('id')
      .eq('indent_number', indent_number)
      .single();

    if (existingProcurement) {
      return res.json({
        success: true,
        message: 'Procurement record already exists for this indent number'
      });
    }

    // Fetch allocation data using utility function
    let allocation;
    try {
      allocation = await fetchAllocationWithData(null, allocation_id);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'Allocation not found'
      });
    }

    // Fetch trading configuration using utility function
    let config;
    try {
      config = await fetchTradingConfiguration();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch trading configuration',
        error: error.message
      });
    }

    // Perform calculations using utility function
    const calculations = calculateProcurement(allocation, config);

    // Handle created_by field - use default admin user if not a valid UUID
    let createdBy = '550e8400-e29b-41d4-a716-446655440000'; // Default admin user
    if (allocation.created_by && typeof allocation.created_by === 'string') {
      // Check if it's a valid UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(allocation.created_by)) {
        createdBy = allocation.created_by;
      }
    }

    // Create procurement data using utility function
    const procurementData = createProcurementData(allocation, calculations, createdBy);

    const { data: procurement, error: procurementError } = await supabase
      .from('procurement_dump')
      .insert(procurementData)
      .select()
      .single();

    if (procurementError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create procurement record',
        error: procurementError.message
      });
    }

    // Log the automatic processing
    await supabase
      .from('audit_log')
      .insert({
        table_name: 'procurement_dump',
        record_id: procurement.id,
        action: 'AUTO_PROCUREMENT_CREATED',
        user_id: createdBy,
        new_values: procurementData
      });

    res.json({
      success: true,
      message: 'Procurement record created automatically',
      data: {
        procurement
      }
    });
  })
);

module.exports = router;