/**
 * Customer Lots routes - Flow 7
 * Handles customer lot assignments, acceptance, and rejection
 */

const express = require('express');
const axios = require('axios');
const { supabase } = require('../config/supabase');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { validateBody } = require('../middleware/validation');
const { routeSchemas } = require('../utils/validationSchemas');
const { sendErrorResponse, sendSuccessResponse, handleDatabaseError } = require('../utils/databaseHelpers');
const {
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
} = require('../utils/customerLotsHelpers');

const router = express.Router();

// Safety check for required n8n env variables
if (!process.env.N8N_BASE_URL || !process.env.N8N_LOT_ACCEPTANCE_CONFIRMATION_WEBHOOK) {
  throw new Error('n8n lot acceptance confirmation webhook URL or base URL is not configured in environment variables');
}

/**
 * @route   GET /api/customer/lots
 * @desc    Get customer's assigned lots
 * @access  Private (Customer role)
 */
router.get('/lots', 
  authenticateToken,
  asyncHandler(async (req, res) => {
    // Get customer ID using utility function
    const customerResult = await getCustomerId(req.user);
    if (!customerResult.success) {
      return sendErrorResponse(res, 404, customerResult.error);
    }

    // Get current date to check window periods
    const currentDate = new Date().toISOString().split('T')[0];

    // Fetch assignments using utility function
    const assignmentsResult = await fetchCustomerAssignments(customerResult.customerId);
    if (!assignmentsResult.success) {
      return handleDatabaseError(res, { message: assignmentsResult.error }, 'fetch lot assignments');
    }

    const assignments = assignmentsResult.data;

    // Categorize assignments using utility function
    const categorizedAssignments = categorizeAssignments(assignments, currentDate);

    // Auto-expire assignments using utility function
    const expireResult = await autoExpireAssignments(categorizedAssignments.expired);
    if (!expireResult.success) {
      console.error('Auto-expiration failed:', expireResult.error);
      // Continue with response even if auto-expiration fails
    }

    // Calculate summary using utility function
    const summary = calculateAssignmentSummary(assignments, categorizedAssignments);

    return sendSuccessResponse(res, {
      assignments: categorizedAssignments,
      summary
    });
  })
);

/**
 * @route   POST /api/customer/accept
 * @desc    Accept assigned lot
 * @access  Private (Customer role)
 */
router.post('/accept', 
  authenticateToken,
  validateBody(routeSchemas.customerLots.acceptReject),
  asyncHandler(async (req, res) => {
    const { assignment_id } = req.body;

    // Get customer ID using utility function
    const customerResult = await getCustomerId(req.user);
    if (!customerResult.success) {
      return sendErrorResponse(res, 404, customerResult.error);
    }

    // Fetch assignment details using utility function
    const assignmentResult = await fetchAssignmentDetails(assignment_id);
    if (!assignmentResult.success) {
      return sendErrorResponse(res, 404, assignmentResult.error);
    }

    // Validate assignment ownership using utility function
    const validationResult = validateAssignmentOwnership(assignmentResult.data, customerResult.customerId);
    if (!validationResult.success) {
      return sendErrorResponse(res, 400, validationResult.error);
    }

    // Process assignment acceptance using utility function
    const result = await processAssignmentAcceptance(assignment_id, customerResult.customerId, req.user.id);
    if (!result.success) {
      return handleDatabaseError(res, { message: result.error }, 'accept assignment');
    }

    // Check if customer has accepted enough lots for the sales order
    await checkAndTriggerConfirmation(assignmentResult.data.sales_id, req.user);

    return sendSuccessResponse(res, { assignment: result.data }, 'Lot accepted successfully');
  })
);

/**
 * @route   POST /api/customer/reject
 * @desc    Reject assigned lot
 * @access  Private (Customer role)
 */
router.post('/reject', 
  authenticateToken,
  validateBody(routeSchemas.customerLots.acceptReject),
  asyncHandler(async (req, res) => {
    const { assignment_id } = req.body;

    // Get customer ID using utility function
    const customerResult = await getCustomerId(req.user);
    if (!customerResult.success) {
      return sendErrorResponse(res, 404, customerResult.error);
    }

    // Fetch assignment details using utility function
    const assignmentResult = await fetchAssignmentDetails(assignment_id);
    if (!assignmentResult.success) {
      return sendErrorResponse(res, 404, assignmentResult.error);
    }

    // Validate assignment ownership using utility function
    const validationResult = validateAssignmentOwnership(assignmentResult.data, customerResult.customerId);
    if (!validationResult.success) {
      return sendErrorResponse(res, 400, validationResult.error);
    }

    // Process assignment rejection using utility function
    const result = await processAssignmentRejection(assignment_id, customerResult.customerId, req.user.id);
    if (!result.success) {
      return handleDatabaseError(res, { message: result.error }, 'reject assignment');
    }

    return sendSuccessResponse(res, { assignment: result.data }, 'Lot rejected successfully');
  })
);

/**
 * @route   POST /api/customer/admin/override
 * @desc    Admin override for lot assignment
 * @access  Private (Admin only)
 */
router.post('/admin/override', 
  authenticateToken,
  authorizeRoles('admin'),
  validateBody(routeSchemas.customerLots.adminOverride),
  asyncHandler(async (req, res) => {
    const { assignment_id, action, notes } = req.body;

    // Fetch assignment details using utility function
    const assignmentResult = await fetchAssignmentDetails(assignment_id);
    if (!assignmentResult.success) {
      return sendErrorResponse(res, 404, assignmentResult.error);
    }

    try {
      const newStatus = action === 'accept' ? 'ACCEPTED' : 'REJECTED';
      const inventoryStatus = action === 'accept' ? 'SOLD' : 'AVAILABLE';

      // Update assignment
      const { data: updatedAssignment, error: updateError } = await supabase
        .from('customer_assignment_table')
        .update({
          lot_status: newStatus,
          responded_by: req.user.id,
          responded_at: new Date().toISOString()
        })
        .eq('id', assignment_id)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to update assignment: ${updateError.message}`);
      }

      // Update inventory
      await supabase
        .from('inventory_table')
        .update({ status: inventoryStatus, updated_at: new Date().toISOString() })
        .eq('id', assignmentResult.data.inventory_id);

      // Log admin override
      await supabase
        .from('audit_log')
        .insert({
          table_name: 'customer_assignment_table',
          record_id: assignment_id,
          action: 'ADMIN_OVERRIDE',
          user_id: req.user.id,
          old_values: { lot_status: assignmentResult.data.lot_status },
          new_values: { lot_status: newStatus, notes, admin_action: action }
        });

      // Check for confirmation if accepted
      if (action === 'accept') {
        await checkAndTriggerConfirmation(assignmentResult.data.sales_id, req.user);
      }

      return sendSuccessResponse(res, {
        assignment: updatedAssignment,
        admin_notes: notes
      }, `Assignment ${action}ed by admin successfully`);
    } catch (error) {
      return handleDatabaseError(res, { message: error.message }, 'admin override');
    }
  })
);



/**
 * @route   GET /api/customer/assignments/stats
 * @desc    Get assignment statistics
 * @access  Private (Admin only)
 */
router.get('/assignments/stats', 
  authenticateToken,
  authorizeRoles('admin'),
  asyncHandler(async (req, res) => {
    const { data: stats, error } = await supabase
      .from('customer_assignment_table')
      .select('lot_status')
      .then(({ data, error }) => {
        if (error) return { data: null, error };
        
        const counts = data.reduce((acc, item) => {
          acc[item.lot_status] = (acc[item.lot_status] || 0) + 1;
          return acc;
        }, {});
        
        return { data: counts, error: null };
      });

    if (error) {
      return handleDatabaseError(res, error, 'fetch statistics');
    }

    return sendSuccessResponse(res, {
      assignment_stats: stats,
      generated_at: new Date().toISOString()
    });
  })
);

/**
 * @route   POST /api/customer/reminder-log
 * @desc    Log a REMINDER_SENT action in audit_log (for n8n)
 * @access  Private (n8n or admin)
 */
router.post('/reminder-log',
  authenticateToken,
  authorizeRoles('admin', 'n8n'), // 'n8n' is a service user/role if you have it
  asyncHandler(async (req, res) => {
    const { assignment_id, customer_id, sales_id, notes } = req.body;
    
    const { error } = await supabase.from('audit_log').insert({
      table_name: 'customer_assignment_table',
      record_id: assignment_id,
      action: 'REMINDER_SENT',
      user_id: req.user.id,
      new_values: { customer_id, sales_id, notes }
    });
    
    if (error) {
      return handleDatabaseError(res, error, 'log reminder');
    }
    
    return sendSuccessResponse(res, null, 'Reminder log created');
  })
);

/**
 * @route   POST /api/customer/manual-reminder
 * @desc    Manually trigger n8n reminder webhook for selected assignments
 * @access  Private (Admin only)
 */
router.post('/manual-reminder',
  authenticateToken,
  authorizeRoles('admin'),
  asyncHandler(async (req, res) => {
    const { assignment_ids } = req.body; // array of assignment IDs
    if (!Array.isArray(assignment_ids) || assignment_ids.length === 0) {
      return sendErrorResponse(res, 400, 'assignment_ids must be a non-empty array');
    }
    
    // Fetch assignment details
    const { data: assignments, error: fetchError } = await supabase
      .from('customer_assignment_table')
      .select('*')
      .in('id', assignment_ids);
      
    if (fetchError) {
      return handleDatabaseError(res, fetchError, 'fetch assignments');
    }
    
    // Build webhook URL (assume N8N_LOT_REMINDER_WEBHOOK is set)
    if (!process.env.N8N_LOT_REMINDER_WEBHOOK) {
      return sendErrorResponse(res, 500, 'n8n lot reminder webhook URL is not configured in environment variables');
    }
    
    const webhookUrl = `${process.env.N8N_BASE_URL}${process.env.N8N_LOT_REMINDER_WEBHOOK}`;
    
    // Post to n8n webhook
    try {
      await axios.post(webhookUrl, { assignments, triggered_by: req.user });
    } catch (webhookError) {
      console.error('n8n manual reminder webhook failed:', webhookError);
      // Do not block main flow
    }
    
    return sendSuccessResponse(res, assignments, 'Manual reminder triggered');
  })
);

module.exports = router;