/**
 * Sales routes - Flow 5 & 6
 * Handles sales order processing, lot allocation, and confirmations
 */

const express = require('express');
const Joi = require('joi');
const axios = require('axios');
const { supabase } = require('../config/supabase');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { validateBody, validateQuery } = require('../middleware/validation');

const router = express.Router();

// Validation schemas
const autoSelectSchema = Joi.object({
  sales_config_id: Joi.string().uuid().required(),
  requested_qty: Joi.number().integer().min(1).required()
});

const manualSelectSchema = Joi.object({
  sales_config_id: Joi.string().uuid().required(),
  selected_lots: Joi.array().items(Joi.string().uuid()).min(1).required()
});

const saveDraftSchema = Joi.object({
  sales_config_id: Joi.string().uuid().required(),
  selected_lots: Joi.array().items(Joi.string().uuid()).min(1).required(),
  notes: Joi.string().max(500).optional()
});

const confirmSaleSchema = Joi.object({
  sales_config_id: Joi.string().uuid().required(),
  selected_lots: Joi.array().items(Joi.string().uuid()).min(1).required(),
  notes: Joi.string().max(500).optional()
});

// Validation schema for new sales order
const newOrderSchema = Joi.object({
  customer_id: Joi.string().uuid().required(),
  broker_id: Joi.string().uuid().required(),
  order_date: Joi.date().default(() => new Date()),
  requested_quantity: Joi.number().integer().min(1).required(),
  lifting_period: Joi.string().required(),
  priority_branch: Joi.string().optional(),
  line_items: Joi.array().items(
    Joi.object({
      indent_number: Joi.string().required(),
      quantity: Joi.number().integer().min(1).required(),
      commission_rate: Joi.number().min(0).required()
    })
  ).min(1).required()
});

// Add safety check for n8n env variables at the top (we have to add the draft webhook later is used !process.env.N8N_DRAFT_WEBHOOK )
if (!process.env.N8N_BASE_URL || !process.env.N8N_SALES_CONFIRMATION_WEBHOOK) {
  throw new Error('n8n webhook URLs are not configured in environment variables');
}

/**
 * @route   GET /api/sales/pending-orders
 * @desc    Get all pending sales orders
 * @access  Private
 */
router.get('/pending-orders', 
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { data: pendingOrders, error } = await supabase
      .from('sales_configuration')
      .select(`
        *,
        customer_info:customer_id (
          customer_name,
          customer_code,
          email,
          state
        ),
        broker_info:broker_id (
          broker_name,
          broker_code,
          commission_rate
        ),
        created_user:created_by (
          first_name,
          last_name
        )
      `)
      .neq('status', 'completed')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch pending orders',
        error: error.message
      });
    }

    res.json({
      success: true,
      data: {
        orders: pendingOrders,
        count: pendingOrders.length
      }
    });
  })
);

/**
 * @route   POST /api/sales/auto-select-lots
 * @desc    Auto-select lots based on sales configuration
 * @access  Private
 */
router.post('/auto-select-lots', 
  authenticateToken,
  validateBody(autoSelectSchema),
  asyncHandler(async (req, res) => {
    const { sales_config_id, requested_qty } = req.body;

    // Fetch sales configuration
    const { data: salesConfig, error: configError } = await supabase
      .from('sales_configuration')
      .select(`
        *,
        customer_info:customer_id (
          customer_name,
          state
        )
      `)
      .eq('id', sales_config_id)
      .single();

    if (configError || !salesConfig) {
      return res.status(404).json({
        success: false,
        message: 'Sales configuration not found'
      });
    }

        // Calculate selection limits based on industry standard (6.12 bales per ton)
    const balesPerTon = 1; // CHANGED FROM 6.12 to 1 for testing
    const base = Math.ceil(requested_qty * balesPerTon);
    const extra = Math.floor(base * 0.2); // 20% extra for flexibility
    const maxLimit = base + extra;

    // Build query for available lots with enhanced selection
    let lotsQuery = supabase
      .from('inventory_table')
      .select(`
        *,
        branch_information:branch_id (
          branch_name,
          zone
        )
      `)
      .eq('status', 'AVAILABLE');

    // Apply filters based on line specs
    if (salesConfig.line_specs) {
      const specs = salesConfig.line_specs;
      
      if (specs.fibre_length) {
        lotsQuery = lotsQuery.eq('fibre_length', specs.fibre_length);
      }
      
      if (specs.variety) {
        lotsQuery = lotsQuery.eq('variety', specs.variety);
      }
    }

    // Priority: same branch first (enhanced logic)
    if (salesConfig.priority_branch) {
      // First try to get lots from priority branch
      const { data: priorityLots, error: priorityError } = await lotsQuery
        .eq('branch', salesConfig.priority_branch)
        .order('created_at', { ascending: true })
        .limit(maxLimit);
      
      if (!priorityError && priorityLots && priorityLots.length >= base) {
        // If we have enough lots from priority branch, return them
        const autoSelected = priorityLots.slice(0, Math.min(maxLimit, priorityLots.length));
        const totalValue = autoSelected.reduce((sum, lot) => sum + (lot.bid_price || 0), 0);

        return res.json({
          success: true,
          data: {
            sales_config: salesConfig,
            available_lots: priorityLots,
            auto_selected: autoSelected,
            selection_limits: {
              requested: requested_qty,
              required_bales: base,
              max_allowed: maxLimit,
              auto_selected_count: autoSelected.length
            },
            total_value: totalValue,
            out_of_stock: false,
            priority_branch_used: true
          }
        });
      }
    }

    // Order by FIFO (first in, first out) and get all available lots
    lotsQuery = lotsQuery
      .order('created_at', { ascending: true });

    const { data: availableLots, error: lotsError } = await lotsQuery;

    if (lotsError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch available lots',
        error: lotsError.message
      });
    }

    if (!availableLots || availableLots.length === 0) {
      return res.json({
        success: true,
        message: 'No available lots found matching the criteria',
        data: {
          available_lots: [],
          auto_selected: [],
          out_of_stock: true
        }
      });
    }

    // Auto-select lots with enhanced logic
    let autoSelected = [];
    
    // If priority branch didn't have enough lots, try to get remaining from other branches
    if (salesConfig.priority_branch && availableLots.length > 0) {
      // Get priority branch lots first
      const priorityLots = availableLots.filter(lot => lot.branch === salesConfig.priority_branch);
      autoSelected = [...priorityLots];
      
      // Add remaining lots from other branches if needed
      const remainingLots = availableLots.filter(lot => lot.branch !== salesConfig.priority_branch);
      const needed = Math.max(0, base - autoSelected.length);
      autoSelected = [...autoSelected, ...remainingLots.slice(0, needed)];
    } else {
      // No priority branch or no priority branch lots, select from all available
      autoSelected = availableLots.slice(0, Math.min(maxLimit, availableLots.length));
    }

    // Fetch allocation details for each unique indent_number
    const indentNumbers = [...new Set(availableLots.map(lot => lot.indent_number))];
    let allocationDetailsMap = {};
    if (indentNumbers.length > 0) {
      const { data: allocations, error: allocationError } = await supabase
        .from('allocation')
        .select('*')
        .in('indent_number', indentNumbers);
      if (!allocationError && allocations) {
        allocationDetailsMap = allocations.reduce((acc, alloc) => {
          acc[alloc.indent_number] = alloc;
          return acc;
        }, {});
      }
    }
    // Attach allocation details to each lot
    const lotsWithAlloc = availableLots.map(lot => ({
      ...lot,
      allocation_details: allocationDetailsMap[lot.indent_number] || null
    }));
    const autoSelectedWithAlloc = autoSelected.map(lot => ({
      ...lot,
      allocation_details: allocationDetailsMap[lot.indent_number] || null
    }));
    // Calculate total value
    const totalValue = autoSelectedWithAlloc.reduce((sum, lot) => sum + (lot.bid_price || 0), 0);

    res.json({
      success: true,
      data: {
        sales_config: salesConfig,
        available_lots: lotsWithAlloc,
        auto_selected: autoSelectedWithAlloc,
        selection_limits: {
          requested: requested_qty,
          required_bales: base,
          max_allowed: maxLimit,
          auto_selected_count: autoSelectedWithAlloc.length
        },
        total_value: totalValue,
        out_of_stock: false,
        priority_branch_used: false
      }
    });
  })
);

/**
 * @route   POST /api/sales/manual-lot-selection
 * @desc    Validate manual lot selection
 * @access  Private
 */
router.post('/manual-lot-selection', 
  authenticateToken,
  validateBody(manualSelectSchema),
  asyncHandler(async (req, res) => {
    const { sales_config_id, selected_lots } = req.body;

    // Fetch sales configuration
    const { data: salesConfig, error: configError } = await supabase
      .from('sales_configuration')
      .select('*')
      .eq('id', sales_config_id)
      .single();

    if (configError || !salesConfig) {
      return res.status(404).json({
        success: false,
        message: 'Sales configuration not found'
      });
    }

    // Fetch selected lots details
    const { data: lots, error: lotsError } = await supabase
      .from('inventory_table')
      .select('*')
      .in('id', selected_lots)
      .eq('status', 'AVAILABLE');

    if (lotsError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch selected lots',
        error: lotsError.message
      });
    }

    // Validate selection
    const requestedQty = salesConfig.requested_quantity;
    const selectedCount = lots.length;

    if (selectedCount < requestedQty) {
      return res.status(400).json({
        success: false,
        message: `Please select at least ${requestedQty} lots. Currently selected: ${selectedCount}`
      });
    }

    // Calculate total value
    const totalValue = lots.reduce((sum, lot) => sum + (lot.bid_price || 0), 0);

    res.json({
      success: true,
      message: 'Lot selection validated successfully',
      data: {
        selected_lots: lots,
        total_selected: selectedCount,
        required_minimum: requestedQty,
        total_value: totalValue,
        validation_passed: true
      }
    });
  })
);

/**
 * @route   POST /api/sales/save-draft
 * @desc    Save sales draft
 * @access  Private
 */
router.post('/save-draft', 
  authenticateToken,
  validateBody(saveDraftSchema),
  asyncHandler(async (req, res) => {
    const { sales_config_id, selected_lots, notes } = req.body;

    try {
      // Fetch sales configuration
      const { data: salesConfig, error: configError } = await supabase
        .from('sales_configuration')
        .select(`
          *,
          customer_info:customer_id (*),
          broker_info:broker_id (*)
        `)
        .eq('id', sales_config_id)
        .single();

      if (configError || !salesConfig) {
        return res.status(404).json({
          success: false,
          message: 'Sales configuration not found'
        });
      }

      // Fetch selected lots
      const { data: lots, error: lotsError } = await supabase
        .from('inventory_table')
        .select('*')
        .in('id', selected_lots);

      if (lotsError) {
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch selected lots',
          error: lotsError.message
        });
      }

      // Calculate totals
      const totalBales = lots.length;
      const totalValue = lots.reduce((sum, lot) => sum + (lot.bid_price || 0), 0);
      const brokerCommission = (totalValue * (salesConfig.broker_info.commission_rate || 0)) / 100;

      // Create sales record
      const salesData = {
        sales_config_id,
        indent_numbers: [...new Set(lots.map(lot => lot.indent_number))],
        total_bales: totalBales,
        total_value: totalValue,
        broker_commission: brokerCommission,
        status: 'DRAFT',
        created_by: req.user.id
      };

      const { data: salesRecord, error: salesError } = await supabase
        .from('sales_table')
        .insert(salesData)
        .select()
        .single();

      if (salesError) {
        throw new Error(`Failed to create sales record: ${salesError.message}`);
      }

      // Create lot selections
      const lotSelections = lots.map(lot => ({
        sales_id: salesRecord.id,
        inventory_id: lot.id,
        lot_number: lot.lot_number,
        indent_number: lot.indent_number,
        quantity: 1, // Assuming 1 bale per lot
        price: lot.bid_price || 0,
        status: 'SELECTED'
      }));

      const { error: selectionsError } = await supabase
        .from('lot_selected_contract')
        .insert(lotSelections);

      if (selectionsError) {
        throw new Error(`Failed to save lot selections: ${selectionsError.message}`);
      }

      // Block the selected lots
      const { error: blockError } = await supabase
        .from('inventory_table')
        .update({ status: 'BLOCKED', updated_at: new Date().toISOString() })
        .in('id', selected_lots);

      if (blockError) {
        throw new Error(`Failed to block lots: ${blockError.message}`);
      }

      // Update sales configuration status
      await supabase
        .from('sales_configuration')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', sales_config_id);

      // Log the draft creation
      await supabase
        .from('audit_log')
        .insert({
          table_name: 'sales_table',
          record_id: salesRecord.id,
          action: 'SALES_DRAFT_CREATED',
          user_id: req.user.id,
          new_values: { ...salesData, lots_count: totalBales, notes }
        });

      // Trigger n8n webhook for draft notification (commented out as per latest requirements)
      /*
      try {
        const draftWebhookUrl = `${process.env.N8N_BASE_URL}${process.env.N8N_SALES_DRAFT_WEBHOOK}`;
        await axios.post(draftWebhookUrl, {
          sales_id: salesRecord.id,
          customer: salesConfig.customer_info,
          broker: salesConfig.broker_info,
          total_bales: totalBales,
          total_value: totalValue,
          created_by: req.user,
          notes
        });
      } catch (webhookError) {
        console.error('n8n draft webhook failed:', webhookError);
      }
      */

      res.status(201).json({
        success: true,
        message: 'Sales draft saved successfully',
        data: {
          sales_record: salesRecord,
          blocked_lots: lots.length,
          total_value: totalValue,
          broker_commission: brokerCommission
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  })
);

/**
 * @route   POST /api/sales/confirm
 * @desc    Confirm sales order
 * @access  Private
 */
router.post('/confirm', 
  authenticateToken,
  validateBody(confirmSaleSchema),
  asyncHandler(async (req, res) => {
    const { sales_config_id, selected_lots, notes } = req.body;

    try {
      // First create/update as draft, then confirm
      const draftResult = await createOrUpdateSalesDraft(sales_config_id, selected_lots, req.user.id);
      
      if (!draftResult.success) {
        return res.status(400).json(draftResult);
      }

      const salesRecord = draftResult.data;

      // Confirm the sales record
      const { data: confirmedSales, error: confirmError } = await supabase
        .from('sales_table')
        .update({
          status: 'CONFIRMED',
          confirmed_by: req.user.id,
          confirmed_at: new Date().toISOString()
        })
        .eq('id', salesRecord.id)
        .select()
        .single();

      if (confirmError) {
        throw new Error(`Failed to confirm sales: ${confirmError.message}`);
      }

      // Mark sales configuration as completed
      await supabase
        .from('sales_configuration')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', sales_config_id);

      // Log the confirmation
      await supabase
        .from('audit_log')
        .insert({
          table_name: 'sales_table',
          record_id: salesRecord.id,
          action: 'SALES_CONFIRMED',
          user_id: req.user.id,
          new_values: { status: 'CONFIRMED', notes }
        });

      // Fetch complete data for webhook
      const { data: completeData } = await supabase
        .from('sales_table')
        .select(`
          *,
          sales_configuration:sales_config_id (
            customer_info:customer_id (*),
            broker_info:broker_id (*)
          )
        `)
        .eq('id', salesRecord.id)
        .single();

      // Trigger n8n webhook for confirmation
      try {
        const confirmWebhookUrl = `${process.env.N8N_BASE_URL}${process.env.N8N_SALES_CONFIRMATION_WEBHOOK}`;
        await axios.post(confirmWebhookUrl, {
          sales_id: salesRecord.id,
          customer: completeData.sales_configuration.customer_info,
          broker: completeData.sales_configuration.broker_info,
          total_bales: confirmedSales.total_bales,
          total_value: confirmedSales.total_value,
          broker_commission: confirmedSales.broker_commission,
          confirmed_by: req.user,
          confirmed_at: confirmedSales.confirmed_at,
          notes
        });
      } catch (webhookError) {
        console.error('n8n confirmation webhook failed:', webhookError);
      }

      res.json({
        success: true,
        message: 'Sales order confirmed successfully',
        data: {
          sales_record: confirmedSales,
          status: 'CONFIRMED'
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  })
);

/**
 * Helper function to create or update sales draft
 */
async function createOrUpdateSalesDraft(sales_config_id, selected_lots, user_id) {
  try {
    // Check if draft already exists
    const { data: existingDraft, error: draftError } = await supabase
      .from('sales_table')
      .select('*')
      .eq('sales_config_id', sales_config_id)
      .eq('status', 'DRAFT')
      .single();

    if (draftError && draftError.code !== 'PGRST116') {
      throw new Error(`Failed to check existing draft: ${draftError.message}`);
    }

    // If a draft exists, update it; otherwise create new
    if (existingDraft) {
      // Update existing draft logic here (optional: update lots, etc.)
      return { success: true, data: existingDraft };
    } else {
      // --- Begin: Create new draft logic (copied from /save-draft route) ---
      // Fetch sales configuration
      const { data: salesConfig, error: configError } = await supabase
        .from('sales_configuration')
        .select(`*, customer_info:customer_id (*), broker_info:broker_id (*)`)
        .eq('id', sales_config_id)
        .single();
      if (configError || !salesConfig) {
        return { success: false, message: 'Sales configuration not found' };
      }
      // Fetch selected lots
      const { data: lots, error: lotsError } = await supabase
        .from('inventory_table')
        .select('*')
        .in('id', selected_lots);
      if (lotsError) {
        return { success: false, message: 'Failed to fetch selected lots', error: lotsError.message };
      }
      // Calculate totals
      const totalBales = lots.length;
      const totalValue = lots.reduce((sum, lot) => sum + (lot.bid_price || 0), 0);
      const brokerCommission = (totalValue * (salesConfig.broker_info.commission_rate || 0)) / 100;
      // Create sales record
      const salesData = {
        sales_config_id,
        indent_numbers: [...new Set(lots.map(lot => lot.indent_number))],
        total_bales: totalBales,
        total_value: totalValue,
        broker_commission: brokerCommission,
        status: 'DRAFT',
        created_by: user_id
      };
      const { data: salesRecord, error: salesError } = await supabase
        .from('sales_table')
        .insert(salesData)
        .select()
        .single();
      if (salesError) {
        return { success: false, message: `Failed to create sales record: ${salesError.message}` };
      }
      // Create lot selections
      const lotSelections = lots.map(lot => ({
        sales_id: salesRecord.id,
        inventory_id: lot.id,
        lot_number: lot.lot_number,
        indent_number: lot.indent_number,
        quantity: 1, // Assuming 1 bale per lot
        price: lot.bid_price || 0,
        status: 'SELECTED'
      }));
      const { error: selectionsError } = await supabase
        .from('lot_selected_contract')
        .insert(lotSelections);
      if (selectionsError) {
        return { success: false, message: `Failed to save lot selections: ${selectionsError.message}` };
      }
      // Block the selected lots
      const { error: blockError } = await supabase
        .from('inventory_table')
        .update({ status: 'BLOCKED', updated_at: new Date().toISOString() })
        .in('id', selected_lots);
      if (blockError) {
        return { success: false, message: `Failed to block lots: ${blockError.message}` };
      }
      // Update sales configuration status
      await supabase
        .from('sales_configuration')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', sales_config_id);
      // Log the draft creation
      await supabase
        .from('audit_log')
        .insert({
          table_name: 'sales_table',
          record_id: salesRecord.id,
          action: 'SALES_DRAFT_CREATED',
          user_id: user_id,
          new_values: { ...salesData, lots_count: totalBales }
        });
      // --- End: Create new draft logic ---
      return { success: true, data: salesRecord };
    }
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * @route   GET /api/sales/:id
 * @desc    Get sales record details
 * @access  Private
 */
router.get('/:id', 
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const { data: salesRecord, error } = await supabase
      .from('sales_table')
      .select(`
        *,
        sales_configuration:sales_config_id (
          *,
          customer_info:customer_id (*),
          broker_info:broker_id (*)
        ),
        lot_selected_contract (
          *,
          inventory_table:inventory_id (*)
        ),
        created_user:created_by (
          first_name,
          last_name,
          email
        ),
        confirmed_user:confirmed_by (
          first_name,
          last_name,
          email
        )
      `)
      .eq('id', id)
      .single();

    if (error || !salesRecord) {
      return res.status(404).json({
        success: false,
        message: 'Sales record not found'
      });
    }

    res.json({
      success: true,
      data: {
        sales_record: salesRecord
      }
    });
  })
);

/**
 * @route   POST /api/sales/new
 * @desc    Create a new sales order (sales configuration)
 * @access  Private (Admin/Trader)
 */
router.post('/new', 
  authenticateToken,
  authorizeRoles('admin', 'trader'),
  validateBody(newOrderSchema),
  asyncHandler(async (req, res) => {
    const { customer_id, broker_id, order_date, requested_quantity, lifting_period, priority_branch, line_items } = req.body;

    // Validate customer
    const { data: customer, error: customerError } = await supabase
      .from('customer_info')
      .select('*')
      .eq('id', customer_id)
      .single();
    if (customerError || !customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    // Validate broker
    const { data: broker, error: brokerError } = await supabase
      .from('broker_info')
      .select('*')
      .eq('id', broker_id)
      .single();
    if (brokerError || !broker) {
      return res.status(404).json({ success: false, message: 'Broker not found' });
    }

    // Validate and fetch indents for each line item
    const indentNumbers = line_items.map(item => item.indent_number);
    const { data: indents, error: indentError } = await supabase
      .from('procurement_dump')
      .select('*')
      .in('indent_number', indentNumbers);
    if (indentError) {
      return res.status(500).json({ success: false, message: 'Failed to fetch indents', error: indentError.message });
    }
    if (!indents || indents.length !== line_items.length) {
      return res.status(400).json({ success: false, message: 'One or more indents are invalid' });
    }

    // Build line specs (for filtering lots later)
    const lineSpecs = {
      variety: indents[0].variety, // Example: use first indent's specs
      fibre_length: indents[0].fibre_length
    };

    // Create sales configuration
    const { data: salesConfig, error: configError } = await supabase
      .from('sales_configuration')
      .insert({
        customer_id,
        broker_id,
        order_date,
        requested_quantity,
        lifting_period,
        priority_branch,
        line_specs: lineSpecs,
        status: 'pending',
        created_by: req.user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    if (configError) {
      return res.status(500).json({ success: false, message: 'Failed to create sales configuration', error: configError.message });
    }

    // Optionally, store line items in a separate table if needed
    // ...

    // Log creation
    await supabase.from('audit_log').insert({
      table_name: 'sales_configuration',
      record_id: salesConfig.id,
      action: 'SALES_ORDER_CREATED',
      user_id: req.user.id,
      new_values: { customer_id, broker_id, requested_quantity, lifting_period, priority_branch, line_items }
    });

    // Trigger n8n webhook for contract PDF/email
    try {
      const webhookUrl = process.env.N8N_SALES_CONTRACT_GENERATE_PDF_WEBHOOK || `${process.env.N8N_BASE_URL}${process.env.N8N_SALES_CONTRACT_GENERATE_PDF_WEBHOOK}`;
      await axios.post(webhookUrl, {
        sales_config_id: salesConfig.id,
        customer,
        broker,
        line_items,
        order_date,
        requested_quantity,
        lifting_period,
        priority_branch,
        created_by: req.user,
      });
      // Log CONTRACT_SENT
      await supabase.from('audit_log').insert({
        table_name: 'sales_configuration',
        record_id: salesConfig.id,
        action: 'CONTRACT_SENT',
        user_id: req.user.id,
        new_values: { webhook: 'triggered', customer_id, broker_id }
      });
    } catch (webhookError) {
      console.error('n8n contract webhook failed:', webhookError);
      // Do not block main flow
    }

    res.status(201).json({
      success: true,
      message: 'Sales order created successfully',
      data: { sales_config: salesConfig }
    });
  })
);

// GET /api/customer-info
router.get('/customer-info', authenticateToken, asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('customer_info')
    .select('*')
    .order('customer_name', { ascending: true });
  if (error) return res.status(500).json({ success: false, message: 'Failed to fetch customers', error: error.message });
  res.json({ data: { customers: data } });
}));

// GET /api/broker-info
router.get('/broker-info', authenticateToken, asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('broker_info')
    .select('*')
    .order('broker_name', { ascending: true });
  if (error) return res.status(500).json({ success: false, message: 'Failed to fetch brokers', error: error.message });
  res.json({ data: { brokers: data } });
}));

module.exports = router;