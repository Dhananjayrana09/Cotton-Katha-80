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
const { routeSchemas } = require('../utils/validationSchemas');
const { sendErrorResponse, sendSuccessResponse, handleDatabaseError } = require('../utils/databaseHelpers');
const { 
  autoSelectLots, 
  fetchSalesConfiguration, 
  createOrUpdateSalesDraft, 
  processSalesConfirmation, 
  createSalesOrder 
} = require('../utils/salesHelpers');

const router = express.Router();

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
      return handleDatabaseError(res, error, 'fetch pending orders');
    }

    return sendSuccessResponse(res, {
      orders: pendingOrders,
      count: pendingOrders.length
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
  validateBody(routeSchemas.sales.autoSelect),
  asyncHandler(async (req, res) => {
    const { sales_config_id, requested_qty } = req.body;

    // Fetch sales configuration using utility function
    const configResult = await fetchSalesConfiguration(sales_config_id);
    if (!configResult.success) {
      return sendErrorResponse(res, 404, configResult.error);
    }

    // Auto-select lots using utility function
    const result = await autoSelectLots(configResult.data, requested_qty);
    if (!result.success) {
      return handleDatabaseError(res, { message: result.error }, 'auto-select lots');
    }

    return sendSuccessResponse(res, result.data);
  })
);

/**
 * @route   POST /api/sales/manual-lot-selection
 * @desc    Validate manual lot selection
 * @access  Private
 */
router.post('/manual-lot-selection', 
  authenticateToken,
  validateBody(routeSchemas.sales.manualSelect),
  asyncHandler(async (req, res) => {
    const { sales_config_id, selected_lots } = req.body;

    // Fetch sales configuration using utility function
    const configResult = await fetchSalesConfiguration(sales_config_id);
    if (!configResult.success) {
      return sendErrorResponse(res, 404, configResult.error);
    }

    // Fetch selected lots details
    const { data: lots, error: lotsError } = await supabase
      .from('inventory_table')
      .select('*')
      .in('id', selected_lots)
      .eq('status', 'AVAILABLE');

    if (lotsError) {
      return handleDatabaseError(res, lotsError, 'fetch selected lots');
    }

    // Validate selection
    const requestedQty = configResult.data.requested_quantity;
    const selectedCount = lots.length;

    if (selectedCount < requestedQty) {
      return sendErrorResponse(res, 400, `Please select at least ${requestedQty} lots. Currently selected: ${selectedCount}`);
    }

    // Calculate total value
    const totalValue = lots.reduce((sum, lot) => sum + (lot.bid_price || 0), 0);

    return sendSuccessResponse(res, {
      selected_lots: lots,
      total_selected: selectedCount,
      required_minimum: requestedQty,
      total_value: totalValue,
      validation_passed: true
    }, 'Lot selection validated successfully');
  })
);

/**
 * @route   POST /api/sales/save-draft
 * @desc    Save sales draft
 * @access  Private
 */
router.post('/save-draft', 
  authenticateToken,
  validateBody(routeSchemas.sales.saveDraft),
  asyncHandler(async (req, res) => {
    const { sales_config_id, selected_lots, notes } = req.body;

    // Use utility function to create or update sales draft
    const result = await createOrUpdateSalesDraft(sales_config_id, selected_lots, req.user.id, notes);
    if (!result.success) {
      return handleDatabaseError(res, { message: result.error }, 'save sales draft');
    }

    return sendSuccessResponse(res, result.data, 'Sales draft saved successfully');
  })
);

/**
 * @route   POST /api/sales/confirm
 * @desc    Confirm sales order
 * @access  Private
 */
router.post('/confirm', 
  authenticateToken,
  validateBody(routeSchemas.sales.confirmSale),
  asyncHandler(async (req, res) => {
    const { sales_config_id, selected_lots, notes } = req.body;

    // Use utility function to process sales confirmation
    const result = await processSalesConfirmation(sales_config_id, selected_lots, req.user.id, notes);
    if (!result.success) {
      return handleDatabaseError(res, { message: result.error }, 'confirm sales order');
    }

    return sendSuccessResponse(res, result.data, 'Sales order confirmed successfully');
  })
);



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
      return sendErrorResponse(res, 404, 'Sales record not found');
    }

    return sendSuccessResponse(res, { sales_record: salesRecord });
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
  validateBody(routeSchemas.sales.newOrder),
  asyncHandler(async (req, res) => {
    const { customer_id, broker_id, order_date, line_items } = req.body;

    // Use utility function to create sales order
    const result = await createSalesOrder(req.body, req.user.id);
    if (!result.success) {
      return sendErrorResponse(res, 400, result.error);
    }

    return sendSuccessResponse(res, result.data, 'Sales order created successfully', 201);
  })
);

/**
 * @route   GET /api/sales/customer-info
 * @desc    Get all customers for sales order creation
 * @access  Private
 */
router.get('/customer-info', 
  authenticateToken, 
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('customer_info')
      .select('*')
      .order('customer_name', { ascending: true });
    
    if (error) {
      return handleDatabaseError(res, error, 'fetch customers');
    }
    
    return sendSuccessResponse(res, { customers: data });
  })
);

/**
 * @route   GET /api/sales/broker-info
 * @desc    Get all brokers for sales order creation
 * @access  Private
 */
router.get('/broker-info', 
  authenticateToken, 
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('broker_info')
      .select('*')
      .order('broker_name', { ascending: true });
    
    if (error) {
      return handleDatabaseError(res, error, 'fetch brokers');
    }
    
    return sendSuccessResponse(res, { brokers: data });
  })
);

/**
 * @route   POST /api/sales/validate-indent
 * @desc    Validate indent number and fetch allocation details
 * @access  Private
 */
router.post('/validate-indent', 
  authenticateToken,
  validateBody(Joi.object({
    indent_number: Joi.string().required()
  })),
  asyncHandler(async (req, res) => {
    const { indent_number } = req.body;

    // Fetch indent from procurement_dump table with allocation details
    const { data: indent, error: indentError } = await supabase
      .from('procurement_dump')
      .select(`
        *,
        allocation:allocation_id (
          indent_number,
          lifting_period,
          bale_quantity,
          otr_price,
          branch_name,
          zone,
          allocation_status,
          parsed_data:parsed_data_id (
            fibre_length,
            variety
          )
        )
      `)
      .eq('indent_number', indent_number)
      .single();

    if (indentError || !indent) {
      return sendErrorResponse(res, 404, 'Indent not found in procurement table');
    }

    // Check if indent is active
    if (indent.allocation?.allocation_status !== 'active') {
      return sendErrorResponse(res, 400, 'Indent is not active for sales');
    }

    // Get already sold quantity for this indent
    const { data: soldLots, error: soldError } = await supabase
      .from('lot_selected_contract')
      .select('quantity')
      .eq('indent_number', indent_number);
    
    if (soldError) {
      return handleDatabaseError(res, soldError, 'check sold quantity');
    }
    
    const alreadySold = soldLots?.reduce((sum, lot) => sum + (lot.quantity || 0), 0) || 0;
    const totalBales = indent.allocation?.bale_quantity || 0;
    const availableBales = totalBales - alreadySold;

    if (availableBales <= 0) {
      return sendErrorResponse(res, 400, 'No units available for this indent');
    }

    return sendSuccessResponse(res, {
      indent: {
        indent_number: indent.indent_number,
        bales_quantity: totalBales,
        available_bales: availableBales,
        centre_name: indent.allocation?.branch_name || 'N/A',
        branch: indent.allocation?.branch_name || 'N/A',
        date: indent.created_at,
        lifting_period: indent.allocation?.lifting_period,
        fibre_length: indent.allocation?.parsed_data?.fibre_length || 'N/A',
        variety: indent.allocation?.parsed_data?.variety || 'N/A',
        bid_price: indent.allocation?.otr_price
      }
    });
  })
);

module.exports = router;