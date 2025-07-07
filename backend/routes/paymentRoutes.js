/**
 * Payment routes - Flow 2
 * Handles CDU generation, UTR submission, and payment tracking
 */

const express = require('express');
const Joi = require('joi');
const axios = require('axios');
const { supabase } = require('../config/supabase');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { validateBody, validateParams } = require('../middleware/validation');

const router = express.Router();

// Validation schemas
const cduSchema = Joi.object({
  procurement_id: Joi.string().uuid().required()
});

const utrSubmitSchema = Joi.object({
  payment_id: Joi.string().uuid().required(),
  utr_number: Joi.string().min(12).max(22).required()
});

const paramSchema = Joi.object({
  id: Joi.string().uuid().required()
});

/**
 * @route   POST /api/payment/cdu
 * @desc    Generate CDU (payment draft) from procurement record
 * @access  Private
 */
router.post('/cdu', 
  authenticateToken,
  validateBody(cduSchema),
  asyncHandler(async (req, res) => {
    const { procurement_id } = req.body;

    // Fetch procurement details
    const { data: procurement, error: procurementError } = await supabase
      .from('procurement_dump')
      .select(`
        *,
        allocation:allocation_id (
          indent_number,
          branch_information:branch_id (
            branch_name,
            branch_code
          )
        )
      `)
      .eq('id', procurement_id)
      .single();

    if (procurementError || !procurement) {
      return res.status(404).json({
        success: false,
        message: 'Procurement record not found'
      });
    }

    // Check if payment already exists
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('id')
      .eq('procurement_id', procurement_id)
      .single();

    if (existingPayment) {
      return res.status(400).json({
        success: false,
        message: 'Payment already exists for this procurement'
      });
    }

    // Generate CDU data
    const cduData = {
      payment_mode: 'RTGS',
      payment_type: 'EMD',
      amount: procurement.emd_amount,
      bank: 'State Bank of India', // Default bank
      due_date: procurement.due_date,
      remarks: `EMD Payment for Indent ${procurement.indent_number}`
    };

    // Calculate UTR due date (same as payment due date)
    const utrDueDate = new Date(procurement.due_date);

    // Create payment record
    const paymentData = {
      procurement_id,
      payment_mode: cduData.payment_mode,
      payment_type: cduData.payment_type,
      amount: cduData.amount,
      bank: cduData.bank,
      due_date: cduData.due_date,
      utr_due_date: utrDueDate.toISOString().split('T')[0],
      payment_status: 'pending',
      remarks: cduData.remarks,
      created_by: req.user.id
    };

    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert(paymentData)
      .select()
      .single();

    if (paymentError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create payment record',
        error: paymentError.message
      });
    }

    // Log CDU generation
    await supabase
      .from('audit_log')
      .insert({
        table_name: 'payments',
        record_id: payment.id,
        action: 'CDU_GENERATED',
        user_id: req.user.id,
        new_values: { ...cduData, payment_id: payment.id }
      });

    res.json({
      success: true,
      message: 'CDU generated successfully',
      data: {
        payment_id: payment.id,
        cdu: cduData,
        payment_details: payment
      }
    });
  })
);

/**
 * @route   POST /api/utr/submit
 * @desc    Submit UTR number for a payment
 * @access  Private
 */
router.post('/submit', 
  authenticateToken,
  validateBody(utrSubmitSchema),
  asyncHandler(async (req, res) => {
    const { payment_id, utr_number } = req.body;

    // Check if payment exists
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', payment_id)
      .single();

    if (paymentError || !payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }

    if (payment.utr_number) {
      return res.status(400).json({
        success: false,
        message: 'UTR already submitted for this payment'
      });
    }

    // Update payment with UTR number
    const { data: updatedPayment, error: updateError } = await supabase
      .from('payments')
      .update({
        utr_number,
        payment_status: 'verified',
        verified_by: req.user.id,
        verified_at: new Date().toISOString()
      })
      .eq('id', payment_id)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update payment with UTR',
        error: updateError.message
      });
    }

    // Log UTR submission
    await supabase
      .from('audit_log')
      .insert({
        table_name: 'payments',
        record_id: payment_id,
        action: 'UTR_SUBMITTED',
        user_id: req.user.id,
        old_values: { utr_number: null, payment_status: payment.payment_status },
        new_values: { utr_number, payment_status: 'verified' }
      });

    res.json({
      success: true,
      message: 'UTR submitted successfully',
      data: {
        payment: updatedPayment
      }
    });
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
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch pending payments',
        error: error.message
      });
    }

    // Calculate overdue days for each payment
    const today = new Date();
    const paymentsWithOverdue = pendingPayments.map(payment => ({
      ...payment,
      overdue_days: Math.ceil((today - new Date(payment.due_date)) / (1000 * 60 * 60 * 24))
    }));

    res.json({
      success: true,
      data: {
        pending_payments: paymentsWithOverdue,
        count: paymentsWithOverdue.length
      }
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
    const offset = (page - 1) * limit;

    console.log("page", page);
    console.log("limit", limit);
    console.log("offset", offset);

    let query = supabase
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
      `, { count: 'exact' })
      .eq('payment_status', 'verified');

    // Role-based filtering
    if (req.user.role === 'trader') {
      query = query.eq('created_by', req.user.id);
    }

    const { data: verifiedPayments, error, count } = await query
      .order('verified_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch verified payments',
        error: error.message
      });
    }

    const totalPages = Math.ceil(count / limit);

    res.json({
      success: true,
      data: {
        payments: verifiedPayments,
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

/**
 * @route   GET /api/payment/:id
 * @desc    Get payment details by ID
 * @access  Private
 */
router.get('/:id', 
  authenticateToken,
  validateParams(paramSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const { data: payment, error } = await supabase
      .from('payments')
      .select(`
        *,
        procurement_dump:procurement_id (
          *,
          allocation:allocation_id (
            indent_number,
            branch_information:branch_id (
              branch_name,
              branch_code,
              zone
            )
          )
        ),
        created_user:created_by (
          first_name,
          last_name,
          email
        ),
        verified_user:verified_by (
          first_name,
          last_name,
          email
        )
      `)
      .eq('id', id)
      .single();

    if (error || !payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    res.json({
      success: true,
      data: {
        payment
      }
    });
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
  asyncHandler(async (req, res) => {
    const { payment_ids } = req.body;

    if (!payment_ids || !Array.isArray(payment_ids)) {
      return res.status(400).json({
        success: false,
        message: 'Payment IDs array is required'
      });
    }

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

      res.json({
        success: true,
        message: 'Payment reminders triggered successfully',
        data: {
          triggered_count: payment_ids.length,
          n8n_response: response.data
        }
      });
    } catch (error) {
      console.error('n8n webhook error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to trigger payment reminders',
        error: error.message
      });
    }
  })
);

module.exports = router;