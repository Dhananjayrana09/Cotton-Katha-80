/**
 * Customer Lots-specific utility functions
 * Extracted from customerLotsRoutes.js to reduce code duplication and improve maintainability
 */

const axios = require('axios');
const { supabase } = require('../config/supabase');
const { sendErrorResponse, sendSuccessResponse, handleDatabaseError } = require('./databaseHelpers');

/**
 * Get customer ID from user object
 * @param {Object} user - User object from request
 * @returns {Object} Customer ID result
 */
async function getCustomerId(user) {
  try {
    if (!user || !user.id) {
      console.log('[getCustomerId] No user or user.id:', user);
      return { 
        success: false, 
        error: 'User not authenticated' 
      };
    }

    // For customer role, the user ID is the customer ID
    if (user.role === 'customer') {
      console.log('[getCustomerId] Customer role, using user.id:', user.id);
      return { 
        success: true, 
        customerId: user.id 
      };
    }

    // For other roles, we need to find the customer ID
    console.log('[getCustomerId] Looking up customer_info for user.email:', user.email);
    const { data: customer, error } = await supabase
      .from('customer_info')
      .select('id, email')
      .eq('email', user.email)
      .single();

    console.log('[getCustomerId] Query result:', { customer, error });

    if (error || !customer) {
      return { 
        success: false, 
        error: 'Customer not found' 
      };
    }

    return { 
      success: true, 
      customerId: customer.id 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to get customer ID: ${error.message}` 
    };
  }
}

/**
 * Fetch customer assignments
 * @param {string} customerId - Customer ID
 * @returns {Object} Assignments result
 */
async function fetchCustomerAssignments(customerId) {
  try {
    const { data: assignments, error } = await supabase
      .from('customer_assignment_table')
      .select(`
        *,
        inventory_table:inventory_id (
          lot_number,
          centre_name,
          branch,
          fibre_length,
          variety,
          bid_price,
          status
        ),
        sales_table:sales_id (
          order_number,
          customer_id,
          total_lots,
          confirmed_lots
        )
      `)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) {
      return { 
        success: false, 
        error: `Failed to fetch assignments: ${error.message}` 
      };
    }

    return { 
      success: true, 
      data: assignments || [] 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to fetch customer assignments: ${error.message}` 
    };
  }
}

/**
 * Categorize assignments by status and window periods
 * @param {Array} assignments - Array of assignments
 * @param {string} currentDate - Current date in YYYY-MM-DD format
 * @returns {Object} Categorized assignments
 */
function categorizeAssignments(assignments, currentDate) {
  const categorized = {
    pending: [],
    accepted: [],
    rejected: [],
    expired: [],
    confirmed: []
  };

  assignments.forEach(assignment => {
    const status = assignment.lot_status;
    const windowEnd = assignment.window_end_date;

    if (status === 'PENDING') {
      if (windowEnd && windowEnd < currentDate) {
        categorized.expired.push(assignment);
      } else {
        categorized.pending.push(assignment);
      }
    } else if (status === 'ACCEPTED') {
      categorized.accepted.push(assignment);
    } else if (status === 'REJECTED') {
      categorized.rejected.push(assignment);
    } else if (status === 'CONFIRMED') {
      categorized.confirmed.push(assignment);
    }
  });

  return categorized;
}

/**
 * Auto-expire assignments that are past their window
 * @param {Array} expiredAssignments - Array of expired assignments
 * @returns {Object} Expiration result
 */
async function autoExpireAssignments(expiredAssignments) {
  try {
    if (!expiredAssignments || expiredAssignments.length === 0) {
      return { success: true, expired_count: 0 };
    }

    const assignmentIds = expiredAssignments.map(assignment => assignment.id);
    const inventoryIds = expiredAssignments.map(assignment => assignment.inventory_id);

    // Update assignments to expired status
    const { error: assignmentError } = await supabase
      .from('customer_assignment_table')
      .update({
        lot_status: 'EXPIRED',
        responded_at: new Date().toISOString()
      })
      .in('id', assignmentIds);

    if (assignmentError) {
      return { 
        success: false, 
        error: `Failed to update assignments: ${assignmentError.message}` 
      };
    }

    // Update inventory back to available
    const { error: inventoryError } = await supabase
      .from('inventory_table')
      .update({
        status: 'AVAILABLE',
        updated_at: new Date().toISOString()
      })
      .in('id', inventoryIds);

    if (inventoryError) {
      console.error('Failed to update inventory:', inventoryError);
      // Continue even if inventory update fails
    }

    return { 
      success: true, 
      expired_count: expiredAssignments.length 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to auto-expire assignments: ${error.message}` 
    };
  }
}

/**
 * Calculate assignment summary
 * @param {Array} assignments - All assignments
 * @param {Object} categorized - Categorized assignments
 * @returns {Object} Summary statistics
 */
function calculateAssignmentSummary(assignments, categorized) {
  const total = assignments.length;
  const pending = categorized.pending.length;
  const accepted = categorized.accepted.length;
  const rejected = categorized.rejected.length;
  const expired = categorized.expired.length;
  const confirmed = categorized.confirmed.length;

  return {
    total,
    pending,
    accepted,
    rejected,
    expired,
    confirmed,
    response_rate: total > 0 ? ((accepted + rejected) / total * 100).toFixed(1) : 0
  };
}

/**
 * Fetch assignment details by ID
 * @param {string} assignmentId - Assignment ID
 * @returns {Object} Assignment details result
 */
async function fetchAssignmentDetails(assignmentId) {
  try {
    const { data: assignment, error } = await supabase
      .from('customer_assignment_table')
      .select(`
        *,
        inventory_table:inventory_id (
          lot_number,
          centre_name,
          branch,
          fibre_length,
          variety,
          bid_price,
          status
        ),
        sales_table:sales_id (
          order_number,
          customer_id,
          total_lots,
          confirmed_lots
        )
      `)
      .eq('id', assignmentId)
      .single();

    if (error || !assignment) {
      return { 
        success: false, 
        error: 'Assignment not found' 
      };
    }

    return { 
      success: true, 
      data: assignment 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to fetch assignment details: ${error.message}` 
    };
  }
}

/**
 * Validate assignment ownership
 * @param {Object} assignment - Assignment object
 * @param {string} customerId - Customer ID
 * @returns {Object} Validation result
 */
function validateAssignmentOwnership(assignment, customerId) {
  if (assignment.customer_id !== customerId) {
    return { 
      success: false, 
      error: 'Assignment does not belong to this customer' 
    };
  }

  if (assignment.lot_status !== 'PENDING') {
    return { 
      success: false, 
      error: 'Assignment is not in pending status' 
    };
  }

  return { success: true };
}

/**
 * Process assignment acceptance
 * @param {string} assignmentId - Assignment ID
 * @param {string} customerId - Customer ID
 * @param {string} userId - User ID
 * @returns {Object} Processing result
 */
async function processAssignmentAcceptance(assignmentId, customerId, userId) {
  try {
    // Update assignment status
    const { data: updatedAssignment, error: updateError } = await supabase
      .from('customer_assignment_table')
      .update({
        lot_status: 'ACCEPTED',
        responded_by: userId,
        responded_at: new Date().toISOString()
      })
      .eq('id', assignmentId)
      .select()
      .single();

    if (updateError) {
      return { 
        success: false, 
        error: `Failed to update assignment: ${updateError.message}` 
      };
    }

    // Update inventory status
    const { error: inventoryError } = await supabase
      .from('inventory_table')
      .update({
        status: 'SOLD',
        updated_at: new Date().toISOString()
      })
      .eq('id', updatedAssignment.inventory_id);

    if (inventoryError) {
      console.error('Failed to update inventory:', inventoryError);
      // Continue even if inventory update fails
    }

    // Log acceptance
    await supabase
      .from('audit_log')
      .insert({
        table_name: 'customer_assignment_table',
        record_id: assignmentId,
        action: 'LOT_ACCEPTED',
        user_id: userId,
        old_values: { lot_status: 'PENDING' },
        new_values: { lot_status: 'ACCEPTED' }
      });

    return { 
      success: true, 
      data: updatedAssignment 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to process assignment acceptance: ${error.message}` 
    };
  }
}

/**
 * Process assignment rejection
 * @param {string} assignmentId - Assignment ID
 * @param {string} customerId - Customer ID
 * @param {string} userId - User ID
 * @returns {Object} Processing result
 */
async function processAssignmentRejection(assignmentId, customerId, userId) {
  try {
    // Update assignment status
    const { data: updatedAssignment, error: updateError } = await supabase
      .from('customer_assignment_table')
      .update({
        lot_status: 'REJECTED',
        responded_by: userId,
        responded_at: new Date().toISOString()
      })
      .eq('id', assignmentId)
      .select()
      .single();

    if (updateError) {
      return { 
        success: false, 
        error: `Failed to update assignment: ${updateError.message}` 
      };
    }

    // Update inventory back to available
    const { error: inventoryError } = await supabase
      .from('inventory_table')
      .update({
        status: 'AVAILABLE',
        updated_at: new Date().toISOString()
      })
      .eq('id', updatedAssignment.inventory_id);

    if (inventoryError) {
      console.error('Failed to update inventory:', inventoryError);
      // Continue even if inventory update fails
    }

    // Log rejection
    await supabase
      .from('audit_log')
      .insert({
        table_name: 'customer_assignment_table',
        record_id: assignmentId,
        action: 'LOT_REJECTED',
        user_id: userId,
        old_values: { lot_status: 'PENDING' },
        new_values: { lot_status: 'REJECTED' }
      });

    return { 
      success: true, 
      data: updatedAssignment 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to process assignment rejection: ${error.message}` 
    };
  }
}

/**
 * Check and trigger confirmation if enough lots are accepted
 * @param {string} salesId - Sales ID
 * @param {Object} user - User object
 * @returns {Object} Confirmation result
 */
async function checkAndTriggerConfirmation(salesId, user) {
  try {
    // Get sales order details
    const { data: salesOrder, error: salesError } = await supabase
      .from('sales_table')
      .select('total_lots, confirmed_lots')
      .eq('id', salesId)
      .single();

    if (salesError || !salesOrder) {
      console.error('Failed to fetch sales order:', salesError);
      return { success: false };
    }

    // Check if all lots are accepted
    if (salesOrder.confirmed_lots >= salesOrder.total_lots) {
      // Trigger n8n webhook for confirmation
      const webhookUrl = `${process.env.N8N_BASE_URL}${process.env.N8N_LOT_ACCEPTANCE_CONFIRMATION_WEBHOOK}`;
      
      try {
        await axios.post(webhookUrl, {
          sales_id: salesId,
          confirmed_lots: salesOrder.confirmed_lots,
          total_lots: salesOrder.total_lots,
          triggered_by: user.id,
          timestamp: new Date().toISOString()
        });

        // Log confirmation trigger
        await supabase
          .from('audit_log')
          .insert({
            table_name: 'sales_table',
            record_id: salesId,
            action: 'CONFIRMATION_TRIGGERED',
            user_id: user.id,
            new_values: { 
              confirmed_lots: salesOrder.confirmed_lots,
              total_lots: salesOrder.total_lots
            }
          });

        return { success: true, confirmation_triggered: true };
      } catch (webhookError) {
        console.error('n8n webhook error:', webhookError);
        return { success: false, webhook_error: webhookError.message };
      }
    }

    return { success: true, confirmation_triggered: false };
  } catch (error) {
    console.error('Failed to check confirmation:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  getCustomerId,
  categorizeAssignments,
  autoExpireAssignments,
  calculateAssignmentSummary,
  fetchCustomerAssignments,
  fetchAssignmentDetails,
  validateAssignmentOwnership,
  processAssignmentAcceptance,
  processAssignmentRejection,
  checkAndTriggerConfirmation
}; 