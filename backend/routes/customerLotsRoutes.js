/**
 * Customer Lots routes - Flow 7
 * Handles customer lot assignments, acceptance, and rejection
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
const acceptRejectSchema = Joi.object({
  assignment_id: Joi.string().uuid().required()
});

const adminOverrideSchema = Joi.object({
  assignment_id: Joi.string().uuid().required(),
  action: Joi.string().valid('accept', 'reject').required(),
  notes: Joi.string().max(500).optional()
});

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
    let customerId = req.user.id;

    // If user is not a customer, find their customer record
    if (req.user.role !== 'customer') {
      const { data: customerInfo, error: customerError } = await supabase
        .from('customer_info')
        .select('id')
        .eq('email', req.user.email)
        .single();

      if (customerError || !customerInfo) {
        return res.status(404).json({
          success: false,
          message: 'Customer record not found'
        });
      }
      customerId = customerInfo.id;
    }

    // Get current date to check window periods
    const currentDate = new Date().toISOString().split('T')[0];

    const { data: assignments, error } = await supabase
      .from('customer_assignment_table')
      .select(`
        *,
        inventory_table:inventory_id (
          lot_number,
          indent_number,
          centre_name,
          branch,
          variety,
          fibre_length,
          bid_price
        ),
        sales_table:sales_id (
          total_value,
          broker_commission
        ),
        assigned_user:assigned_by (
          first_name,
          last_name
        )
      `)
      .eq('customer_id', customerId)
      .order('assigned_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch lot assignments',
        error: error.message
      });
    }

    // Categorize assignments
    const activeAssignments = [];
    const expiredAssignments = [];
    const respondedAssignments = [];

    assignments.forEach(assignment => {
      const isWithinWindow = currentDate <= assignment.window_end_date;
      const isPending = assignment.lot_status === 'PENDING';

      if (isPending && isWithinWindow) {
        activeAssignments.push(assignment);
      } else if (isPending && !isWithinWindow) {
        expiredAssignments.push(assignment);
      } else {
        respondedAssignments.push(assignment);
      }
    });

    // Auto-expire pending lots that are past window
    if (expiredAssignments.length > 0) {
      const expiredIds = expiredAssignments.map(a => a.id);
      
      // Update expired assignments
      await supabase
        .from('customer_assignment_table')
        .update({
          lot_status: 'EXPIRED',
          responded_at: new Date().toISOString()
        })
        .in('id', expiredIds);

      // Update inventory status back to available
      const expiredInventoryIds = expiredAssignments.map(a => a.inventory_id);
      await supabase
        .from('inventory_table')
        .update({ status: 'AVAILABLE' })
        .in('id', expiredInventoryIds);

      // Update the expired assignments in our response
      expiredAssignments.forEach(assignment => {
        assignment.lot_status = 'EXPIRED';
        assignment.responded_at = new Date().toISOString();
      });
    }

    // Calculate summary statistics
    const totalAssigned = assignments.length;
    const totalAccepted = assignments.filter(a => a.lot_status === 'ACCEPTED').length;
    const totalRejected = assignments.filter(a => a.lot_status === 'REJECTED').length;
    const totalPending = activeAssignments.length;

    res.json({
      success: true,
      data: {
        assignments: {
          active: activeAssignments,
          expired: expiredAssignments,
          responded: respondedAssignments
        },
        summary: {
          total_assigned: totalAssigned,
          total_accepted: totalAccepted,
          total_rejected: totalRejected,
          total_pending: totalPending,
          total_expired: expiredAssignments.length
        }
      }
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
  validateBody(acceptRejectSchema),
  asyncHandler(async (req, res) => {
    const { assignment_id } = req.body;

    // Fetch assignment details
    const { data: assignment, error: assignmentError } = await supabase
      .from('customer_assignment_table')
      .select(`
        *,
        inventory_table:inventory_id (
          lot_number,
          indent_number
        )
      `)
      .eq('id', assignment_id)
      .single();

    if (assignmentError || !assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    // Check if assignment belongs to the user
    let customerId = req.user.id;
    if (req.user.role !== 'customer') {
      const { data: customerInfo } = await supabase
        .from('customer_info')
        .select('id')
        .eq('email', req.user.email)
        .single();
      customerId = customerInfo?.id;
    }

    if (assignment.customer_id !== customerId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this assignment'
      });
    }

    // Check if within window period
    const currentDate = new Date().toISOString().split('T')[0];
    if (currentDate > assignment.window_end_date) {
      return res.status(400).json({
        success: false,
        message: 'Assignment window has expired'
      });
    }

    // Check if already responded
    if (assignment.lot_status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: 'Assignment has already been responded to'
      });
    }

    try {
      // Update assignment status
      const { data: updatedAssignment, error: updateError } = await supabase
        .from('customer_assignment_table')
        .update({
          lot_status: 'ACCEPTED',
          responded_by: req.user.id,
          responded_at: new Date().toISOString()
        })
        .eq('id', assignment_id)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to update assignment: ${updateError.message}`);
      }

      // Update inventory status to SOLD
      await supabase
        .from('inventory_table')
        .update({ status: 'SOLD', updated_at: new Date().toISOString() })
        .eq('id', assignment.inventory_id);

      // Log the acceptance
      await supabase
        .from('audit_log')
        .insert({
          table_name: 'customer_assignment_table',
          record_id: assignment_id,
          action: 'ACCEPTED',
          user_id: req.user.id,
          old_values: { lot_status: 'PENDING' },
          new_values: { lot_status: 'ACCEPTED' }
        });

      // Check if customer has accepted enough lots for the sales order
      await checkAndTriggerConfirmation(assignment.sales_id, req.user);

      res.json({
        success: true,
        message: 'Lot accepted successfully',
        data: {
          assignment: updatedAssignment
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
 * @route   POST /api/customer/reject
 * @desc    Reject assigned lot
 * @access  Private (Customer role)
 */
router.post('/reject', 
  authenticateToken,
  validateBody(acceptRejectSchema),
  asyncHandler(async (req, res) => {
    const { assignment_id } = req.body;

    // Similar validation as accept route
    const { data: assignment, error: assignmentError } = await supabase
      .from('customer_assignment_table')
      .select('*')
      .eq('id', assignment_id)
      .single();

    if (assignmentError || !assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    // Authorization check (similar to accept)
    let customerId = req.user.id;
    if (req.user.role !== 'customer') {
      const { data: customerInfo } = await supabase
        .from('customer_info')
        .select('id')
        .eq('email', req.user.email)
        .single();
      customerId = customerInfo?.id;
    }

    if (assignment.customer_id !== customerId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this assignment'
      });
    }

    // Window and status checks
    const currentDate = new Date().toISOString().split('T')[0];
    if (currentDate > assignment.window_end_date) {
      return res.status(400).json({
        success: false,
        message: 'Assignment window has expired'
      });
    }

    if (assignment.lot_status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: 'Assignment has already been responded to'
      });
    }

    try {
      // Update assignment status
      const { data: updatedAssignment, error: updateError } = await supabase
        .from('customer_assignment_table')
        .update({
          lot_status: 'REJECTED',
          responded_by: req.user.id,
          responded_at: new Date().toISOString()
        })
        .eq('id', assignment_id)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to update assignment: ${updateError.message}`);
      }

      // Update inventory status back to AVAILABLE
      await supabase
        .from('inventory_table')
        .update({ status: 'AVAILABLE', updated_at: new Date().toISOString() })
        .eq('id', assignment.inventory_id);

      // Log the rejection
      await supabase
        .from('audit_log')
        .insert({
          table_name: 'customer_assignment_table',
          record_id: assignment_id,
          action: 'REJECTED',
          user_id: req.user.id,
          old_values: { lot_status: 'PENDING' },
          new_values: { lot_status: 'REJECTED' }
        });

      res.json({
        success: true,
        message: 'Lot rejected successfully',
        data: {
          assignment: updatedAssignment
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
 * @route   POST /api/customer/admin/override
 * @desc    Admin override for lot assignment
 * @access  Private (Admin only)
 */
router.post('/admin/override', 
  authenticateToken,
  authorizeRoles('admin'),
  validateBody(adminOverrideSchema),
  asyncHandler(async (req, res) => {
    const { assignment_id, action, notes } = req.body;

    const { data: assignment, error: assignmentError } = await supabase
      .from('customer_assignment_table')
      .select('*')
      .eq('id', assignment_id)
      .single();

    if (assignmentError || !assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
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
        .eq('id', assignment.inventory_id);

      // Log admin override
      await supabase
        .from('audit_log')
        .insert({
          table_name: 'customer_assignment_table',
          record_id: assignment_id,
          action: 'ADMIN_OVERRIDE',
          user_id: req.user.id,
          old_values: { lot_status: assignment.lot_status },
          new_values: { lot_status: newStatus, notes, admin_action: action }
        });

      // Check for confirmation if accepted
      if (action === 'accept') {
        await checkAndTriggerConfirmation(assignment.sales_id, req.user);
      }

      res.json({
        success: true,
        message: `Assignment ${action}ed by admin successfully`,
        data: {
          assignment: updatedAssignment,
          admin_notes: notes
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
 * Helper function to check if enough lots are accepted and trigger confirmation
 */
async function checkAndTriggerConfirmation(salesId, user) {
  try {
    // Get sales configuration to check required quantity
    const { data: salesInfo, error: salesError } = await supabase
      .from('sales_table')
      .select(`
        *,
        sales_configuration:sales_config_id (
          requested_quantity,
          customer_info:customer_id (*),
          broker_info:broker_id (*)
        )
      `)
      .eq('id', salesId)
      .single();

    if (salesError || !salesInfo) {
      console.error('Failed to fetch sales info:', salesError);
      return;
    }

    // Count accepted lots for this sales order
    const { data: acceptedLots, error: countError } = await supabase
      .from('customer_assignment_table')
      .select('id')
      .eq('sales_id', salesId)
      .eq('lot_status', 'ACCEPTED');

    if (countError) {
      console.error('Failed to count accepted lots:', countError);
      return;
    }

    const acceptedCount = acceptedLots.length;
    const requiredQuantity = salesInfo.sales_configuration.requested_quantity;

    // If enough lots are accepted, trigger confirmation
    if (acceptedCount >= requiredQuantity) {
      // Trigger n8n webhook for confirmation
      const webhookUrl = `${process.env.N8N_BASE_URL}${process.env.N8N_LOT_ACCEPTANCE_CONFIRMATION_WEBHOOK}`;
      
      await axios.post(webhookUrl, {
        sales_id: salesId,
        customer: salesInfo.sales_configuration.customer_info,
        broker: salesInfo.sales_configuration.broker_info,
        accepted_lots: acceptedCount,
        required_quantity: requiredQuantity,
        confirmed_by: user
      });

      // Log confirmation trigger
      await supabase
        .from('audit_log')
        .insert({
          table_name: 'sales_table',
          record_id: salesId,
          action: 'CONFIRMATION_SENT',
          user_id: user.id,
          new_values: {
            accepted_lots: acceptedCount,
            required_quantity: requiredQuantity,
            confirmation_triggered: true
          }
        });
    }
  } catch (error) {
    console.error('Error in checkAndTriggerConfirmation:', error);
  }
}

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
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch statistics',
        error: error.message
      });
    }

    res.json({
      success: true,
      data: {
        assignment_stats: stats,
        generated_at: new Date().toISOString()
      }
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
    try {
      await supabase.from('audit_log').insert({
        table_name: 'customer_assignment_table',
        record_id: assignment_id,
        action: 'REMINDER_SENT',
        user_id: req.user.id,
        new_values: { customer_id, sales_id, notes }
      });
      res.json({ success: true, message: 'Reminder log created' });
    } catch (error) {
      console.error('Failed to log reminder:', error);
      res.status(500).json({ success: false, message: 'Failed to log reminder', error: error.message });
    }
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
      return res.status(400).json({ success: false, message: 'assignment_ids must be a non-empty array' });
    }
    try {
      // Fetch assignment details
      const { data: assignments, error: fetchError } = await supabase
        .from('customer_assignment_table')
        .select('*')
        .in('id', assignment_ids);
      if (fetchError) {
        throw new Error('Failed to fetch assignments: ' + fetchError.message);
      }
      // Build webhook URL (assume N8N_LOT_REMINDER_WEBHOOK is set)
      if (!process.env.N8N_LOT_REMINDER_WEBHOOK) {
        throw new Error('n8n lot reminder webhook URL is not configured in environment variables');
      }
      const webhookUrl = `${process.env.N8N_BASE_URL}${process.env.N8N_LOT_REMINDER_WEBHOOK}`;
      // Post to n8n webhook
      try {
        await axios.post(webhookUrl, { assignments, triggered_by: req.user });
      } catch (webhookError) {
        console.error('n8n manual reminder webhook failed:', webhookError);
        // Do not block main flow
      }
      res.json({ success: true, message: 'Manual reminder triggered', data: assignments });
    } catch (error) {
      console.error('Manual reminder error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  })
);

module.exports = router;