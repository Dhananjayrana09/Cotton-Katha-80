/**
 * Sales-specific utility functions
 * Extracted from salesRoutes.js to reduce code duplication and improve maintainability
 */

const { supabase } = require('../config/supabase');
const { sendErrorResponse, sendSuccessResponse } = require('./databaseHelpers');

/**
 * Calculate selection limits for lot selection
 * @param {number} requestedQty - Requested quantity in lots
 * @returns {Object} Selection limits object
 */
function calculateSelectionLimits(requestedQty) {
  const base = requestedQty;
  const extra = Math.floor(base * 0.2); // 20% extra for flexibility
  const maxLimit = base + extra;
  
  return {
    requested: requestedQty,
    required_bales: base,
    max_allowed: maxLimit,
    extra_percentage: 20
  };
}

/**
 * Build base query for available lots
 * @param {Object} filters - Filter criteria
 * @returns {Object} Supabase query object
 */
function buildLotsQuery(filters = {}) {
  let query = supabase
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
  if (filters.fibre_length) {
    query = query.eq('fibre_length', filters.fibre_length);
  }
  
  if (filters.variety) {
    query = query.eq('variety', filters.variety);
  }

  return query;
}

/**
 * Auto-select lots based on sales configuration
 * @param {Object} salesConfig - Sales configuration object
 * @param {number} requestedQty - Requested quantity
 * @returns {Object} Auto-selection result
 */
async function autoSelectLots(salesConfig, requestedQty) {
  const limits = calculateSelectionLimits(requestedQty);
  const filters = salesConfig.line_specs || {};
  
  // Priority: same branch first
  if (salesConfig.priority_branch) {
    const priorityQuery = buildLotsQuery(filters)
      .eq('branch', salesConfig.priority_branch)
      .order('created_at', { ascending: true })
      .limit(limits.max_allowed);
    
    const { data: priorityLots, error: priorityError } = await priorityQuery;
    
    if (!priorityError && priorityLots && priorityLots.length >= limits.required_bales) {
      const autoSelected = priorityLots.slice(0, Math.min(limits.max_allowed, priorityLots.length));
      const totalValue = autoSelected.reduce((sum, lot) => sum + (lot.bid_price || 0), 0);
      
      return {
        success: true,
        data: {
          sales_config: salesConfig,
          available_lots: priorityLots,
          auto_selected: autoSelected,
          selection_limits: {
            ...limits,
            auto_selected_count: autoSelected.length
          },
          total_value: totalValue,
          out_of_stock: false,
          priority_branch_used: true
        }
      };
    }
  }

  // Fallback: get lots from any branch
  const fallbackQuery = buildLotsQuery(filters)
    .order('created_at', { ascending: true })
    .limit(limits.max_allowed);
  
  const { data: allLots, error: allError } = await fallbackQuery;
  
  if (allError) {
    return {
      success: false,
      error: allError.message
    };
  }

  if (!allLots || allLots.length < limits.required_bales) {
    return {
      success: true,
      data: {
        sales_config: salesConfig,
        available_lots: allLots || [],
        auto_selected: [],
        selection_limits: {
          ...limits,
          auto_selected_count: 0
        },
        total_value: 0,
        out_of_stock: true,
        priority_branch_used: false
      }
    };
  }

  const autoSelected = allLots.slice(0, Math.min(limits.max_allowed, allLots.length));
  const totalValue = autoSelected.reduce((sum, lot) => sum + (lot.bid_price || 0), 0);

  return {
    success: true,
    data: {
      sales_config: salesConfig,
      available_lots: allLots,
      auto_selected: autoSelected,
      selection_limits: {
        ...limits,
        auto_selected_count: autoSelected.length
      },
      total_value: totalValue,
      out_of_stock: false,
      priority_branch_used: false
    }
  };
}

/**
 * Fetch sales configuration with related data
 * @param {string} salesConfigId - Sales configuration ID
 * @returns {Object} Sales configuration with related data
 */
async function fetchSalesConfiguration(salesConfigId) {
  const { data: salesConfig, error: configError } = await supabase
    .from('sales_configuration')
    .select(`
      *,
      customer_info:customer_id (
        customer_name,
        state
      )
    `)
    .eq('id', salesConfigId)
    .single();

  if (configError || !salesConfig) {
    return {
      success: false,
      error: 'Sales configuration not found'
    };
  }

  return {
    success: true,
    data: salesConfig
  };
}

/**
 * Create or update sales draft
 * @param {string} salesConfigId - Sales configuration ID
 * @param {Array} selectedLots - Array of selected lot IDs
 * @param {string} userId - User ID
 * @param {string} notes - Optional notes
 * @returns {Object} Draft creation result
 */
async function createOrUpdateSalesDraft(salesConfigId, selectedLots, userId, notes = '') {
  // Check if draft already exists
  const { data: existingDraft } = await supabase
    .from('sales_drafts')
    .select('id')
    .eq('sales_config_id', salesConfigId)
    .single();

  const draftData = {
    sales_config_id: salesConfigId,
    selected_lots: selectedLots,
    notes: notes,
    created_by: userId,
    updated_at: new Date().toISOString()
  };

  let result;
  if (existingDraft) {
    // Update existing draft
    result = await supabase
      .from('sales_drafts')
      .update(draftData)
      .eq('id', existingDraft.id)
      .select()
      .single();
  } else {
    // Create new draft
    draftData.created_at = new Date().toISOString();
    result = await supabase
      .from('sales_drafts')
      .insert(draftData)
      .select()
      .single();
  }

  if (result.error) {
    return {
      success: false,
      error: result.error.message
    };
  }

  return {
    success: true,
    data: result.data
  };
}

/**
 * Process sales confirmation
 * @param {string} salesConfigId - Sales configuration ID
 * @param {Array} selectedLots - Array of selected lot IDs
 * @param {string} userId - User ID
 * @param {string} notes - Optional notes
 * @returns {Object} Confirmation result
 */
async function processSalesConfirmation(salesConfigId, selectedLots, userId, notes = '') {
  // Update inventory status to SOLD
  const { error: inventoryError } = await supabase
    .from('inventory_table')
    .update({ 
      status: 'SOLD',
      sold_at: new Date().toISOString(),
      sold_by: userId
    })
    .in('id', selectedLots);

  if (inventoryError) {
    return {
      success: false,
      error: inventoryError.message
    };
  }

  // Create sales record
  const salesData = {
    sales_config_id: salesConfigId,
    selected_lots: selectedLots,
    notes: notes,
    created_by: userId,
    status: 'confirmed'
  };

  const { data: salesRecord, error: salesError } = await supabase
    .from('sales_table')
    .insert(salesData)
    .select()
    .single();

  if (salesError) {
    return {
      success: false,
      error: salesError.message
    };
  }

  // Update sales configuration status
  await supabase
    .from('sales_configuration')
    .update({ 
      status: 'completed',
      updated_at: new Date().toISOString()
    })
    .eq('id', salesConfigId);

  return {
    success: true,
    data: salesRecord
  };
}

/**
 * Validate customer and broker existence
 * @param {string} customerId - Customer ID
 * @param {string} brokerId - Broker ID
 * @returns {Object} Validation result
 */
async function validateCustomerAndBroker(customerId, brokerId) {
  const [customerResult, brokerResult] = await Promise.all([
    supabase.from('customer_info').select('id').eq('id', customerId).single(),
    supabase.from('broker_info').select('id').eq('id', brokerId).single()
  ]);

  if (customerResult.error || !customerResult.data) {
    return {
      success: false,
      error: 'Customer not found'
    };
  }

  if (brokerResult.error || !brokerResult.data) {
    return {
      success: false,
      error: 'Broker not found'
    };
  }

  return {
    success: true
  };
}

/**
 * Create new sales order
 * @param {Object} orderData - Order data
 * @param {string} userId - User ID
 * @returns {Object} Order creation result
 */
async function createSalesOrder(orderData, userId) {
  const { customer_id, broker_id, order_date, line_items } = orderData;

  // Validate customer and broker
  const validation = await validateCustomerAndBroker(customer_id, broker_id);
  if (!validation.success) {
    return validation;
  }

  // Create sales configuration
  const configData = {
    customer_id,
    broker_id,
    order_date: order_date || new Date().toISOString(),
    status: 'pending',
    created_by: userId
  };

  const { data: salesConfig, error: configError } = await supabase
    .from('sales_configuration')
    .insert(configData)
    .select()
    .single();

  if (configError) {
    return {
      success: false,
      error: configError.message
    };
  }

  // Create line items
  const lineItemsData = line_items.map(item => ({
    sales_config_id: salesConfig.id,
    indent_number: item.indent_number,
    quantity: item.quantity,
    broker_brokerage_per_bale: item.broker_brokerage_per_bale,
    our_brokerage_per_bale: item.our_brokerage_per_bale
  }));

  const { error: lineItemsError } = await supabase
    .from('sales_line_items')
    .insert(lineItemsData);

  if (lineItemsError) {
    return {
      success: false,
      error: lineItemsError.message
    };
  }

  return {
    success: true,
    data: {
      sales_config: salesConfig,
      line_items: lineItemsData
    }
  };
}

module.exports = {
  calculateSelectionLimits,
  buildLotsQuery,
  autoSelectLots,
  fetchSalesConfiguration,
  createOrUpdateSalesDraft,
  processSalesConfirmation,
  validateCustomerAndBroker,
  createSalesOrder
}; 