/**
 * Sampling-specific utility functions
 * Extracted from samplingRoutes.js to reduce code duplication and improve maintainability
 */

const { supabase } = require('../config/supabase');
const { sendErrorResponse, sendSuccessResponse, handleDatabaseError } = require('./databaseHelpers');

/**
 * Fetch allocation details with related data
 * @param {string} indentNumber - Indent number
 * @returns {Object} Allocation details
 */
async function fetchAllocationDetails(indentNumber) {
  const { data: allocation, error } = await supabase
    .from('allocation')
    .select(`
      *,
      branch_information:branch_id (
        branch_name,
        branch_code,
        zone
      ),
      parsed_data:parsed_data_id (
        firm_name,
        centre_name,
        variety,
        fibre_length
      )
    `)
    .eq('indent_number', indentNumber)
    .single();

  if (error || !allocation) {
    return { 
      success: false, 
      error: 'Indent not found' 
    };
  }

  return { 
    success: true, 
    data: allocation 
  };
}

/**
 * Calculate lot requirements based on bale quantity
 * @param {number} balesQuantity - Number of bales
 * @returns {Object} Lot calculation results
 */
function calculateLotRequirements(balesQuantity) {
  const base = Math.floor(balesQuantity / 100);
  const extra = Math.floor(base * 0.2);
  const totalLots = base + (extra < 1 ? 0 : extra);

  return {
    base_lots: base,
    extra_lots: extra < 1 ? 0 : extra,
    total_lots: totalLots
  };
}

/**
 * Check existing lots for an indent
 * @param {string} indentNumber - Indent number
 * @returns {Object} Existing lots data
 */
async function checkExistingLots(indentNumber) {
  const { data: existingLots, error } = await supabase
    .from('inventory_table')
    .select('lot_number')
    .eq('indent_number', indentNumber);

  if (error) {
    return { 
      success: false, 
      error: `Failed to fetch existing lots: ${error.message}` 
    };
  }

  return { 
    success: true, 
    data: existingLots || [] 
  };
}

/**
 * Validate lot numbers for uniqueness
 * @param {Array} lots - Array of lot numbers
 * @returns {Object} Validation result
 */
function validateLotNumbers(lots) {
  const uniqueLots = [...new Set(lots)];
  
  if (uniqueLots.length !== lots.length) {
    return { 
      success: false, 
      error: 'Duplicate lot numbers found' 
    };
  }

  return { success: true };
}

/**
 * Prepare inventory entries for insertion
 * @param {Array} lots - Array of lot numbers
 * @param {Object} allocation - Allocation details
 * @param {string} userId - User ID
 * @returns {Array} Inventory entries
 */
function prepareInventoryEntries(lots, allocation, userId) {
  return lots.map(lotNumber => ({
    indent_number: allocation.indent_number,
    lot_number: lotNumber,
    centre_name: allocation.parsed_data?.centre_name || 'Unknown',
    branch: allocation.branch_information?.branch_name || 'Unknown',
    branch_id: allocation.branch_information?.id || null,
    date: new Date().toISOString().split('T')[0],
    lifting_period: allocation.lifting_period,
    fibre_length: allocation.parsed_data?.fibre_length || 'Unknown',
    variety: allocation.parsed_data?.variety || 'Unknown',
    bid_price: allocation.otr_price || 0,
    status: 'AVAILABLE',
    added_by: userId
  }));
}

/**
 * Insert inventory entries
 * @param {Array} inventoryEntries - Inventory entries to insert
 * @returns {Object} Insertion result
 */
async function insertInventoryEntries(inventoryEntries) {
  try {
    const { data: insertedEntries, error } = await supabase
      .from('inventory_table')
      .insert(inventoryEntries)
      .select();

    if (error) {
      return { 
        success: false, 
        error: `Failed to save sampling entries: ${error.message}` 
      };
    }

    return { 
      success: true, 
      data: insertedEntries 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Inventory insertion failed: ${error.message}` 
    };
  }
}

/**
 * Log sampling completion in audit log
 * @param {string} indentNumber - Indent number
 * @param {Array} lots - Array of lot numbers
 * @param {string} userId - User ID
 * @returns {Object} Logging result
 */
async function logSamplingCompletion(indentNumber, lots, userId) {
  try {
    await supabase
      .from('audit_log')
      .insert({
        table_name: 'inventory_table',
        action: 'SAMPLING_COMPLETED',
        user_id: userId,
        new_values: { 
          indent_number: indentNumber,
          lot_count: lots.length,
          lot_numbers: lots
        }
      });

    return { success: true };
  } catch (error) {
    console.error('Failed to log sampling completion:', error);
    return { 
      success: false, 
      error: `Logging failed: ${error.message}` 
    };
  }
}

/**
 * Fetch indent details for sampling entry
 * @param {string} indentNumber - Indent number
 * @returns {Object} Indent details with calculations
 */
async function fetchIndentForSampling(indentNumber) {
  try {
    // Fetch allocation details
    const allocationResult = await fetchAllocationDetails(indentNumber);
    if (!allocationResult.success) {
      return allocationResult;
    }

    const allocation = allocationResult.data;

    // Calculate lot requirements
    const calculatedLots = calculateLotRequirements(allocation.bale_quantity);

    // Check existing lots
    const existingLotsResult = await checkExistingLots(indentNumber);
    if (!existingLotsResult.success) {
      return existingLotsResult;
    }

    const response = {
      indent_details: {
        indent_number: allocation.indent_number,
        bales_quantity: allocation.bale_quantity,
        centre_name: allocation.parsed_data?.centre_name || 'Unknown',
        branch: allocation.branch_information?.branch_name || 'Unknown',
        date: allocation.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
        lifting_period: allocation.lifting_period,
        fibre_length: allocation.parsed_data?.fibre_length || 'Unknown',
        variety: allocation.parsed_data?.variety || 'Unknown',
        bid_price: allocation.otr_price || 0,
        firm_name: allocation.parsed_data?.firm_name || 'Unknown'
      },
      calculated_lots: calculatedLots,
      existing_lots: existingLotsResult.data,
      sampling_completed: (existingLotsResult.data && existingLotsResult.data.length > 0)
    };

    return { 
      success: true, 
      data: response 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to fetch indent details: ${error.message}` 
    };
  }
}

/**
 * Save sampling entries to inventory table
 * @param {string} indentNumber - Indent number
 * @param {Array} lots - Array of lot numbers
 * @param {string} userId - User ID
 * @returns {Object} Save result
 */
async function saveSamplingEntries(indentNumber, lots, userId) {
  try {
    // Fetch allocation details
    const allocationResult = await fetchAllocationDetails(indentNumber);
    if (!allocationResult.success) {
      return allocationResult;
    }

    // Check if sampling already exists
    const existingLotsResult = await checkExistingLots(indentNumber);
    if (!existingLotsResult.success) {
      return existingLotsResult;
    }

    if (existingLotsResult.data && existingLotsResult.data.length > 0) {
      return { 
        success: false, 
        error: 'Sampling already completed for this indent number' 
      };
    }

    // Validate lot numbers
    const validationResult = validateLotNumbers(lots);
    if (!validationResult.success) {
      return validationResult;
    }

    // Prepare inventory entries
    const inventoryEntries = prepareInventoryEntries(lots, allocationResult.data, userId);

    // Insert inventory entries
    const insertResult = await insertInventoryEntries(inventoryEntries);
    if (!insertResult.success) {
      return insertResult;
    }

    // Log sampling completion
    await logSamplingCompletion(indentNumber, lots, userId);

    return { 
      success: true, 
      data: {
        saved_lots: insertResult.data,
        total_lots: lots.length
      }
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to save sampling entries: ${error.message}` 
    };
  }
}

/**
 * Get sampling statistics
 * @returns {Object} Sampling statistics
 */
async function getSamplingStatistics() {
  try {
    const { data: inventoryStats, error: inventoryError } = await supabase
      .from('inventory_table')
      .select('status, indent_number')
      .then(({ data, error }) => {
        if (error) return { data: { total: 0, available: 0, allocated: 0 } };
        
        const stats = data.reduce((acc, item) => {
          acc.total += 1;
          if (item.status === 'AVAILABLE') acc.available += 1;
          if (item.status === 'ALLOCATED') acc.allocated += 1;
          return acc;
        }, { total: 0, available: 0, allocated: 0 });
        
        return { data: stats };
      });

    if (inventoryError) {
      return { 
        success: false, 
        error: `Failed to get inventory stats: ${inventoryError.message}` 
      };
    }

    // Get unique indents count
    const { data: uniqueIndents, error: indentsError } = await supabase
      .from('inventory_table')
      .select('indent_number')
      .then(({ data, error }) => {
        if (error) return { data: 0 };
        const uniqueIndents = [...new Set(data.map(item => item.indent_number))];
        return { data: uniqueIndents.length };
      });

    if (indentsError) {
      return { 
        success: false, 
        error: `Failed to get indents count: ${indentsError.message}` 
      };
    }

    return {
      success: true,
      data: {
        total_lots: inventoryStats.total,
        available_lots: inventoryStats.available,
        allocated_lots: inventoryStats.allocated,
        total_indents: uniqueIndents,
        generated_at: new Date().toISOString()
      }
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to get sampling statistics: ${error.message}` 
    };
  }
}

/**
 * Validate sampling data
 * @param {Object} samplingData - Sampling data to validate
 * @returns {Object} Validation result
 */
function validateSamplingData(samplingData) {
  const requiredFields = ['indent_number', 'lots'];
  const missingFields = requiredFields.filter(field => !samplingData[field]);

  if (missingFields.length > 0) {
    return {
      success: false,
      error: `Missing required fields: ${missingFields.join(', ')}`
    };
  }

  if (!Array.isArray(samplingData.lots) || samplingData.lots.length === 0) {
    return {
      success: false,
      error: 'Lots must be a non-empty array'
    };
  }

  if (samplingData.lots.some(lot => !lot || lot.trim() === '')) {
    return {
      success: false,
      error: 'All lot numbers must be non-empty'
    };
  }

  return { success: true };
}

module.exports = {
  fetchAllocationDetails,
  calculateLotRequirements,
  checkExistingLots,
  validateLotNumbers,
  prepareInventoryEntries,
  insertInventoryEntries,
  logSamplingCompletion,
  fetchIndentForSampling,
  saveSamplingEntries,
  getSamplingStatistics,
  validateSamplingData
}; 