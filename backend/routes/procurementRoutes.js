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

// Validation schemas
const calculateSchema = Joi.object({
  indent_number: Joi.string().required()
});

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

    // Fetch allocation data
    const { data: allocation, error: allocationError } = await supabase
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
          buyer_type
        )
      `)
      .eq('indent_number', indent_number)
      .single();

    if (allocationError || !allocation) {
      return res.status(404).json({
        success: false,
        message: 'Allocation not found for the given indent number'
      });
    }

    // Fetch trading configuration from DB
    let configMap = {};
    let configError = null;
    try {
      const { data: configs, error } = await supabase
        .from('trading_configuration')
        .select('config_key, config_value')
        .in('config_key', ['EMD_PERCENTAGE_LOW', 'EMD_PERCENTAGE_HIGH', 'GST_RATES', 'CANDY_RATE', 'BALE_WEIGHT', 'EMD_DUE_DAYS']);
      if (error) configError = error;
      if (configs && configs.length > 0) {
        configs.forEach(config => {
          configMap[config.config_key] = config.config_value;
        });
      }
    } catch (e) {
      configError = e;
    }

    // Fallback to /dashboard/procurement/config if config missing or incomplete
    if (!configMap.BALE_WEIGHT || !configMap.EMD_DUE_DAYS) {
      try {
        const resp = await axios.get(`${process.env.BACKEND_URL || 'http://localhost:3001'}/api/dashboard/procurement/config`, {
          headers: { Authorization: req.headers.authorization }
        });
        const fallback = resp.data.data;
        configMap.BALE_WEIGHT = fallback.bale_weight;
        configMap.EMD_DUE_DAYS = fallback.emd_due_days;
        configMap.EMD_PERCENTAGE_THRESHOLD = fallback.emd_percentage_threshold;
        configMap.EMD_PERCENTAGE_LOW = fallback.emd_percentage_low;
        configMap.EMD_PERCENTAGE_HIGH = fallback.emd_percentage_high;
        configMap.GST_SAME_STATE = fallback.gst_same_state;
        configMap.GST_DIFF_STATE = fallback.gst_diff_state;
        configMap.COTTON_VALUE_MULTIPLIER = fallback.cotton_value_multiplier;
      } catch (e) {
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch procurement config',
          error: e.message
        });
      }
    }

    // Use config values (prefer DB, fallback to hardcoded)
    const baleWeight = Number(configMap.BALE_WEIGHT) || 170;
    const emdDueDays = Number(configMap.EMD_DUE_DAYS) || 3;
    const emdThreshold = Number(configMap.EMD_PERCENTAGE_THRESHOLD) || 2000;
    const emdLow = Number(configMap.EMD_PERCENTAGE_LOW) || 10;
    const emdHigh = Number(configMap.EMD_PERCENTAGE_HIGH) || 20;
    const cottonValueMultiplier = Number(configMap.COTTON_VALUE_MULTIPLIER) || 1;
    const gstSameState = configMap.GST_SAME_STATE || { cgst: 9, sgst: 9 };
    const gstDiffState = configMap.GST_DIFF_STATE || { igst: 18 };

    // Calculate EMD Percentage (threshold 2000)
    const baleQty = Number(allocation.bale_quantity);
    const emdPercentage = baleQty <= emdThreshold ? emdLow : emdHigh;

    // Calculate Cotton Value
    const otrPrice = Number(allocation.otr_price);
    const cottonValue = otrPrice * baleQty * baleWeight * cottonValueMultiplier;

    // Calculate EMD Amount
    const emdAmount = (cottonValue * emdPercentage) / 100;

    // Calculate GST
    const sellerState = allocation.parsed_data?.seller_type || 'CCI';
    const buyerState = allocation.branch_information.state;
    let gstAmount = 0, igstAmount = 0, cgstAmount = 0, sgstAmount = 0;
    if (sellerState === buyerState && sellerState !== 'CCI') {
      // Same state - CGST + SGST
      cgstAmount = (cottonValue * gstSameState.cgst) / 100;
      sgstAmount = (cottonValue * gstSameState.sgst) / 100;
      gstAmount = cgstAmount + sgstAmount;
    } else {
      // Different state - IGST
      igstAmount = (cottonValue * gstDiffState.igst) / 100;
      gstAmount = igstAmount;
    }

    // Calculate total amount
    const totalAmount = cottonValue + gstAmount + emdAmount;

    // Calculate due date (EMD due days from config)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + emdDueDays);

    // Save to procurement_dump
    const procurementData = {
      indent_number,
      allocation_id: allocation.id,
      firm_name: allocation.parsed_data?.firm_name || 'Unknown',
      bale_quantity: baleQty,
      bale_weight: baleWeight,
      otr_price: otrPrice,
      cotton_value: cottonValue,
      emd_amount: emdAmount,
      emd_percentage: emdPercentage,
      gst_amount: gstAmount,
      igst_amount: igstAmount,
      cgst_amount: cgstAmount,
      sgst_amount: sgstAmount,
      total_amount: totalAmount,
      transaction_type: 'EMD',
      due_date: dueDate.toISOString().split('T')[0],
      created_by: req.user.id,
      zone: allocation.branch_information.zone
    };

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
            cotton_value: cottonValue,
            emd_amount: emdAmount,
            emd_percentage: emdPercentage,
            gst_breakdown: {
              total_gst: gstAmount,
              igst: igstAmount,
              cgst: cgstAmount,
              sgst: sgstAmount
            },
            total_amount: totalAmount
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

module.exports = router;