/**
 * Payment routes - Flow 2
 * Handles CDU generation, UTR submission, and payment tracking
 */

const express = require('express');
const axios = require('axios');
const { supabase } = require('../config/supabase');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { validateBody, validateParams } = require('../middleware/validation');
const { routeSchemas, commonObjects } = require('../utils/validationSchemas');
const { sendErrorResponse, sendSuccessResponse, handleDatabaseError } = require('../utils/databaseHelpers');
const {
  generateCDU,
  submitUTR,
  fetchPaymentDetails,
  fetchPayments,
  getPaymentStatistics,
  validatePaymentData
} = require('../utils/paymentHelpers');

const router = express.Router();

/**
 * @route   POST /api/payment/cdu
 * @desc    Generate CDU (payment draft) from procurement record
 * @access  Private
 */
router.post('/cdu', 
  authenticateToken,
  validateBody(routeSchemas.payment.cdu),
  asyncHandler(async (req, res) => {
    const { procurement_id } = req.body;

    // Use utility function to generate CDU
    const result = await generateCDU(procurement_id, req.user.id);

    if (!result.success) {
      if (result.error.includes('not found')) {
        return sendErrorResponse(res, 404, result.error);
      }
      if (result.error.includes('already exists')) {
        return sendErrorResponse(res, 400, result.error);
      }
      return handleDatabaseError(res, { message: result.error }, 'generate CDU');
    }

    return sendSuccessResponse(res, result.data, 'CDU generated successfully');
  })
);

/**
 * @route   POST /api/utr/submit
 * @desc    Submit UTR number for a payment
 * @access  Private
 */
router.post('/submit', 
  authenticateToken,
  validateBody(routeSchemas.payment.utrSubmit),
  asyncHandler(async (req, res) => {
    const { payment_id, utr_number } = req.body;

    // Use utility function to submit UTR
    const result = await submitUTR(payment_id, utr_number, req.user.id);

    if (!result.success) {
      if (result.error.includes('not found')) {
        return sendErrorResponse(res, 404, result.error);
      }
      if (result.error.includes('already submitted')) {
        return sendErrorResponse(res, 400, result.error);
      }
      return handleDatabaseError(res, { message: result.error }, 'submit UTR');
    }

    return sendSuccessResponse(res, { payment: result.data }, 'UTR submitted successfully');
  })
);

/**
 * @route   GET /api/utr/pending
 * @desc    Get all pending UTR payments (overdue)
 * @access  Private (Admin only)
 */
router.get('/pending', 
  authenticateToken,
  authorizeRoles('admin'),
  asyncHandler(async (req, res) => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const { data: pendingPayments, error } = await supabase
      .from('payments')
      .select(`
        *,
        procurement_dump:procurement_id (
          indent_number,
          firm_name,
          allocation:allocation_id (
            branch_information:branch_id (
              branch_name
            )
          )
        )
      `)
      .is('utr_number', null)
      .lt('due_date', threeDaysAgo.toISOString().split('T')[0])
      .order('due_date', { ascending: true });

    if (error) {
      return handleDatabaseError(res, error, 'fetch pending payments');
    }

    // Calculate overdue days for each payment
    const today = new Date();
    const paymentsWithOverdue = pendingPayments.map(payment => ({
      ...payment,
      overdue_days: Math.ceil((today - new Date(payment.due_date)) / (1000 * 60 * 60 * 24))
    }));

    return sendSuccessResponse(res, {
      pending_payments: paymentsWithOverdue,
      count: paymentsWithOverdue.length
    });
  })
);

/**
 * @route   GET /api/payment/verified
 * @desc    Get all verified payments
 * @access  Private
 */
router.get('/verified', 
  authenticateToken,
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // Use utility function to fetch payments
    const result = await fetchPayments(
      { status: 'verified' },
      { page, limit },
      req.user
    );

    if (!result.success) {
      return handleDatabaseError(res, { message: result.error }, 'fetch verified payments');
    }

    return sendSuccessResponse(res, result.data);
  })
);

/**
 * @route   GET /api/payment/:id
 * @desc    Get payment details by ID
 * @access  Private
 */
router.get('/:id', 
  authenticateToken,
  validateParams(commonObjects.idParam),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Use utility function to fetch payment details
    const result = await fetchPaymentDetails(id);

    if (!result.success) {
      return sendErrorResponse(res, 404, result.error);
    }

    return sendSuccessResponse(res, { payment: result.data });
  })
);

/**
 * @route   POST /api/payment/send-reminder
 * @desc    Trigger n8n webhook to send payment reminders
 * @access  Private (Admin only)
 */
router.post('/send-reminder', 
  authenticateToken,
  authorizeRoles('admin'),
  validateBody(routeSchemas.payment.sendReminder),
  asyncHandler(async (req, res) => {
    const { payment_ids } = req.body;

    try {
      // Trigger n8n webhook for payment reminders
      const webhookUrl = `${process.env.N8N_BASE_URL}${process.env.N8N_PAYMENT_REMINDER_WEBHOOK}`;
      
      const response = await axios.post(webhookUrl, {
        payment_ids,
        triggered_by: req.user.id,
        timestamp: new Date().toISOString()
      });

      // Log reminder trigger
      await supabase
        .from('audit_log')
        .insert({
          table_name: 'payments',
          action: 'REMINDER_TRIGGERED',
          user_id: req.user.id,
          new_values: { payment_ids, n8n_response: response.data }
        });

      return sendSuccessResponse(res, {
        triggered_count: payment_ids.length,
        n8n_response: response.data
      }, 'Payment reminders triggered successfully');
    } catch (error) {
      console.error('n8n webhook error:', error);
      return handleDatabaseError(res, { message: error.message }, 'trigger payment reminders');
    }
  })
);

module.exports = router;