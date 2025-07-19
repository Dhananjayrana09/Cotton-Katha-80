/**
 * Allocation-specific utility functions
 * Extracted from allocationRoutes.js to reduce code duplication and improve maintainability
 */

const { supabase } = require('../config/supabase');
const { sendErrorResponse, sendSuccessResponse, handleDatabaseError, createPaginationMeta, applyRoleFilter } = require('./databaseHelpers');

/**
 * Build allocation query with filters
 * @param {Object} filters - Filter criteria
 * @param {Object} user - User object for role-based filtering
 * @returns {Object} Supabase query object
 */
function buildAllocationQuery(filters = {}, user = null) {
  let query = supabase
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
    `, { count: 'exact' });

  // Apply filters
  if (filters.status) {
    query = query.eq('allocation_status', filters.status);
  }

  if (filters.branch_id) {
    query = query.eq('branch_id', filters.branch_id);
  }

  if (filters.search) {
    query = query.or(`indent_number.ilike.%${filters.search}%,branch_name.ilike.%${filters.search}%`);
  }

  // Apply role-based filtering
  if (user && user.role === 'trader') {
    // Traders can only see their own allocations
    // This would require a created_by field in allocation table
    // For now, we'll show all allocations
    // query = query.eq('created_by', user.id);
  }

  return query;
}

/**
 * Fetch allocations with pagination and filtering
 * @param {Object} filters - Filter criteria
 * @param {Object} pagination - Pagination parameters
 * @param {Object} user - User object for role-based filtering
 * @returns {Object} Allocations with pagination metadata
 */
async function fetchAllocations(filters = {}, pagination = {}, user = null) {
  const { page = 1, limit = 10 } = pagination;
  const offset = (page - 1) * limit;

  const query = buildAllocationQuery(filters, user);

  // Add pagination and sorting
  const { data: allocations, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return { 
      success: false, 
      error: error.message 
    };
  }

  const paginationMeta = createPaginationMeta(page, limit, count);

  return {
    success: true,
    data: {
      allocations: allocations || [],
      pagination: paginationMeta
    }
  };
}

/**
 * Fetch single allocation details by ID
 * @param {string} allocationId - Allocation ID
 * @returns {Object} Allocation details
 */
async function fetchAllocationDetails(allocationId) {
  const { data: allocation, error } = await supabase
    .from('allocation')
    .select(`
      *,
      branch_information:branch_id (
        branch_name,
        branch_code,
        zone,
        state,
        branch_email_id
      ),
      parsed_data:parsed_data_id (
        *
      ),
      procurement_dump (
        *
      )
    `)
    .eq('id', allocationId)
    .single();

  if (error || !allocation) {
    return { 
      success: false, 
      error: 'Allocation not found' 
    };
  }

  return { 
    success: true, 
    data: allocation 
  };
}

/**
 * Update allocation status
 * @param {string} allocationId - Allocation ID
 * @param {string} status - New status
 * @param {string} userId - User ID performing the update
 * @param {string} notes - Optional notes
 * @returns {Object} Update result
 */
async function updateAllocationStatus(allocationId, status, userId, notes = '') {
  const validStatuses = ['pending', 'active', 'completed', 'cancelled'];
  
  if (!validStatuses.includes(status)) {
    return { 
      success: false, 
      error: 'Invalid status' 
    };
  }

  try {
    const { data: allocation, error } = await supabase
      .from('allocation')
      .update({
        allocation_status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', allocationId)
      .select()
      .single();

    if (error) {
      return { 
        success: false, 
        error: `Failed to update allocation status: ${error.message}` 
      };
    }

    // Log the status change
    await supabase
      .from('audit_log')
      .insert({
        table_name: 'allocation',
        record_id: allocationId,
        action: 'STATUS_UPDATE',
        user_id: userId,
        old_values: { allocation_status: 'previous_status' }, // We don't have the old status
        new_values: { 
          allocation_status: status,
          notes: notes || null
        }
      });

    return { 
      success: true, 
      data: allocation 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Status update failed: ${error.message}` 
    };
  }
}

/**
 * Create new allocation
 * @param {Object} allocationData - Allocation data
 * @param {string} userId - User ID creating the allocation
 * @returns {Object} Creation result
 */
async function createAllocation(allocationData, userId) {
  try {
    const { data: allocation, error } = await supabase
      .from('allocation')
      .insert({
        ...allocationData,
        created_by: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      return { 
        success: false, 
        error: `Failed to create allocation: ${error.message}` 
      };
    }

    // Log the creation
    await supabase
      .from('audit_log')
      .insert({
        table_name: 'allocation',
        record_id: allocation.id,
        action: 'ALLOCATION_CREATED',
        user_id: userId,
        new_values: allocationData
      });

    return { 
      success: true, 
      data: allocation 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Allocation creation failed: ${error.message}` 
    };
  }
}

/**
 * Delete allocation
 * @param {string} allocationId - Allocation ID
 * @param {string} userId - User ID performing the deletion
 * @returns {Object} Deletion result
 */
async function deleteAllocation(allocationId, userId) {
  try {
    // First check if allocation exists
    const { data: existingAllocation, error: fetchError } = await supabase
      .from('allocation')
      .select('id, allocation_status')
      .eq('id', allocationId)
      .single();

    if (fetchError || !existingAllocation) {
      return { 
        success: false, 
        error: 'Allocation not found' 
      };
    }

    // Check if allocation can be deleted (not active or completed)
    if (['active', 'completed'].includes(existingAllocation.allocation_status)) {
      return { 
        success: false, 
        error: 'Cannot delete active or completed allocations' 
      };
    }

    const { error } = await supabase
      .from('allocation')
      .delete()
      .eq('id', allocationId);

    if (error) {
      return { 
        success: false, 
        error: `Failed to delete allocation: ${error.message}` 
      };
    }

    // Log the deletion
    await supabase
      .from('audit_log')
      .insert({
        table_name: 'allocation',
        record_id: allocationId,
        action: 'ALLOCATION_DELETED',
        user_id: userId,
        old_values: { allocation_status: existingAllocation.allocation_status }
      });

    return { 
      success: true, 
      data: { deleted_id: allocationId } 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Allocation deletion failed: ${error.message}` 
    };
  }
}

/**
 * Get allocation statistics
 * @param {Object} user - User object for role-based filtering
 * @returns {Object} Statistics data
 */
async function getAllocationStatistics(user = null) {
  try {
    let query = supabase
      .from('allocation')
      .select('allocation_status');

    // Apply role-based filtering
    if (user && user.role === 'trader') {
      // query = query.eq('created_by', user.id);
    }

    const { data: allocations, error } = await query;

    if (error) {
      return { 
        success: false, 
        error: error.message 
      };
    }

    // Calculate statistics
    const stats = allocations.reduce((acc, allocation) => {
      const status = allocation.allocation_status;
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    return {
      success: true,
      data: {
        statistics: stats,
        total_allocations: allocations.length,
        generated_at: new Date().toISOString()
      }
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to get statistics: ${error.message}` 
    };
  }
}

/**
 * Validate allocation data
 * @param {Object} allocationData - Allocation data to validate
 * @returns {Object} Validation result
 */
function validateAllocationData(allocationData) {
  const requiredFields = ['indent_number', 'branch_id', 'bale_quantity', 'otr_price'];
  const missingFields = requiredFields.filter(field => !allocationData[field]);

  if (missingFields.length > 0) {
    return {
      success: false,
      error: `Missing required fields: ${missingFields.join(', ')}`
    };
  }

  if (allocationData.bale_quantity <= 0) {
    return {
      success: false,
      error: 'Bale quantity must be greater than 0'
    };
  }

  if (allocationData.otr_price < 0) {
    return {
      success: false,
      error: 'OTR price cannot be negative'
    };
  }

  return { success: true };
}

module.exports = {
  buildAllocationQuery,
  fetchAllocations,
  fetchAllocationDetails,
  updateAllocationStatus,
  createAllocation,
  deleteAllocation,
  getAllocationStatistics,
  validateAllocationData
}; 