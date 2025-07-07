/**
 * n8n Webhook routes
 * Handles incoming webhooks from n8n automation workflows
 */

const express = require('express');
const { supabase } = require('../config/supabase');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * @route   POST /webhook/n8n/email-processing
 * @desc    Handle processed email data from n8n (Flow 1)
 * @access  n8n webhook
 */
router.post('/email-processing', asyncHandler(async (req, res) => {
  const { email_subject, pdf_url, raw_text, sender_email, parsed_data } = req.body;

  try {
    // Save purchase confirmation
    const { data: confirmation, error: confirmationError } = await supabase
      .from('purchase_confirmations')
      .insert({
        email_subject,
        pdf_url,
        raw_text,
        sender_email,
        processed: true
      })
      .select()
      .single();

    if (confirmationError) {
      throw new Error(`Failed to save confirmation: ${confirmationError.message}`);
    }

    // If parsing was successful, save parsed data
    if (parsed_data && parsed_data.success) {
      const { data: parsedRecord, error: parsedError } = await supabase
        .from('parsed_data')
        .insert({
          confirmation_id: confirmation.id,
          ...parsed_data.data
        })
        .select()
        .single();

      if (parsedError) {
        throw new Error(`Failed to save parsed data: ${parsedError.message}`);
      }

      // Create allocation record
      const { data: allocation, error: allocationError } = await supabase
        .from('allocation')
        .insert({
          indent_number: parsed_data.data.indent_number,
          parsed_data_id: parsedRecord.id,
          buyer_type: parsed_data.data.buyer_type,
          crop_year: parsed_data.data.crop_year,
          bale_quantity: parsed_data.data.quantity,
          otr_price: parsed_data.data.otr_price,
          lifting_period: parsed_data.data.lifting_period,
          allocation_status: 'pending'
        })
        .select()
        .single();

      if (allocationError) {
        console.error('Failed to create allocation:', allocationError);
      }

      // Log successful processing
      await supabase
        .from('audit_log')
        .insert({
          table_name: 'purchase_confirmations',
          record_id: confirmation.id,
          action: 'EMAIL_PROCESSED_SUCCESS',
          new_values: { parsed_data: parsed_data.data }
        });

      res.json({
        success: true,
        message: 'Email processed and data saved successfully',
        data: {
          confirmation_id: confirmation.id,
          parsed_data_id: parsedRecord.id,
          allocation_id: allocation?.id
        }
      });
    } else {
      // Parsing failed, save to manual applications
      const { data: manualApp, error: manualError } = await supabase
        .from('manual_applications')
        .insert({
          confirmation_id: confirmation.id,
          issue_reason: parsed_data?.error || 'PDF parsing failed',
          status: 'pending'
        })
        .select()
        .single();

      if (manualError) {
        console.error('Failed to save manual application:', manualError);
      }

      // Log processing failure
      await supabase
        .from('audit_log')
        .insert({
          table_name: 'purchase_confirmations',
          record_id: confirmation.id,
          action: 'EMAIL_PROCESSED_FAILED',
          new_values: { error: parsed_data?.error || 'Unknown parsing error' }
        });

      res.json({
        success: true,
        message: 'Email processed but parsing failed - saved for manual review',
        data: {
          confirmation_id: confirmation.id,
          manual_application_id: manualApp?.id,
          requires_manual_review: true
        }
      });
    }
  } catch (error) {
    console.error('Email processing webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process email webhook',
      error: error.message
    });
  }
}));

/**
 * @route   POST /webhook/n8n/payment-reminder-status
 * @desc    Handle payment reminder status from n8n (Flow 2)
 * @access  n8n webhook
 */
router.post('/payment-reminder-status', asyncHandler(async (req, res) => {
  const { payment_ids, reminder_type, status, sent_count, failed_count } = req.body;

  try {
    // Log reminder status
    await supabase
      .from('audit_log')
      .insert({
        table_name: 'payments',
        action: 'REMINDER_STATUS',
        new_values: {
          payment_ids,
          reminder_type,
          status,
          sent_count,
          failed_count,
          timestamp: new Date().toISOString()
        }
      });

    res.json({
      success: true,
      message: 'Payment reminder status logged successfully'
    });
  } catch (error) {
    console.error('Payment reminder status webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log payment reminder status',
      error: error.message
    });
  }
}));

/**
 * @route   POST /webhook/n8n/contract-sent-status
 * @desc    Handle contract email sent status from n8n (Flow 3)
 * @access  n8n webhook
 */
router.post('/contract-sent-status', asyncHandler(async (req, res) => {
  const { contract_id, email_status, recipient_email, error_message } = req.body;

  try {
    // Update contract status based on email sending result
    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (email_status === 'sent') {
      updateData.status = 'sent';
      updateData.sent_at = new Date().toISOString();
    } else {
      updateData.status = 'failed';
    }

    await supabase
      .from('purchase_contract_table')
      .update(updateData)
      .eq('id', contract_id);

    // Log contract sending status
    await supabase
      .from('contract_logs')
      .insert({
        contract_id,
        action: email_status === 'sent' ? 'sent' : 'send_failed',
        notes: error_message || `Email ${email_status} to ${recipient_email}`
      });

    res.json({
      success: true,
      message: 'Contract sent status updated successfully'
    });
  } catch (error) {
    console.error('Contract sent status webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update contract sent status',
      error: error.message
    });
  }
}));

/**
 * @route   POST /webhook/n8n/sales-notification-status
 * @desc    Handle sales notification status from n8n (Flow 5-6)
 * @access  n8n webhook
 */
router.post('/sales-notification-status', asyncHandler(async (req, res) => {
  const { sales_id, notification_type, status, recipients, error_message } = req.body;

  try {
    // Log sales notification status
    await supabase
      .from('audit_log')
      .insert({
        table_name: 'sales_table',
        record_id: sales_id,
        action: `SALES_${notification_type.toUpperCase()}_${status.toUpperCase()}`,
        new_values: {
          notification_type,
          status,
          recipients,
          error_message,
          timestamp: new Date().toISOString()
        }
      });

    res.json({
      success: true,
      message: 'Sales notification status logged successfully'
    });
  } catch (error) {
    console.error('Sales notification status webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log sales notification status',
      error: error.message
    });
  }
}));

/**
 * @route   POST /webhook/n8n/daily-reminder-status
 * @desc    Handle daily lot reminder status from n8n (Flow 7)
 * @access  n8n webhook
 */
router.post('/daily-reminder-status', asyncHandler(async (req, res) => {
  const { reminder_date, customers_notified, total_pending_assignments, status } = req.body;

  try {
    // Log daily reminder status
    await supabase
      .from('audit_log')
      .insert({
        table_name: 'customer_assignment_table',
        action: 'DAILY_REMINDER_SENT',
        new_values: {
          reminder_date,
          customers_notified,
          total_pending_assignments,
          status,
          timestamp: new Date().toISOString()
        }
      });

    res.json({
      success: true,
      message: 'Daily reminder status logged successfully'
    });
  } catch (error) {
    console.error('Daily reminder status webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log daily reminder status',
      error: error.message
    });
  }
}));

/**
 * @route   POST xx/webhook/n8n/pdf-parse-result
 * @desc    Handle PDF parsing results from n8n
 * @access  n8n webhook
 */
router.post('/pdf-parse-result', asyncHandler(async (req, res) => {
  const { 
    confirmation_id, 
    parsing_success, 
    parsed_data, 
    error_message,
    raw_text 
  } = req.body;

  try {
    if (parsing_success && parsed_data) {
      // Save parsed data
      const { data: parsedRecord, error: parsedError } = await supabase
        .from('parsed_data')
        .insert({
          confirmation_id,
          ...parsed_data
        })
        .select()
        .single();

      if (parsedError) {
        throw new Error(`Failed to save parsed data: ${parsedError.message}`);
      }

      // Create allocation if parsing successful
      const { error: allocationError } = await supabase
        .from('allocation')
        .insert({
          indent_number: parsed_data.indent_number,
          parsed_data_id: parsedRecord.id,
          buyer_type: parsed_data.buyer_type,
          crop_year: parsed_data.crop_year,
          bale_quantity: parsed_data.quantity,
          otr_price: parsed_data.otr_price,
          lifting_period: parsed_data.lifting_period,
          allocation_status: 'pending'
        });

      if (allocationError) {
        console.error('Failed to create allocation:', allocationError);
      }
    } else {
      // Save to manual applications
      await supabase
        .from('manual_applications')
        .insert({
          confirmation_id,
          issue_reason: error_message || 'PDF parsing failed',
          status: 'pending'
        });
    }

    // Update confirmation as processed
    await supabase
      .from('purchase_confirmations')
      .update({ 
        processed: true, 
        raw_text: raw_text || null 
      })
      .eq('id', confirmation_id);

    res.json({
      success: true,
      message: 'PDF parsing result processed successfully'
    });
  } catch (error) {
    console.error('PDF parse result webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process PDF parsing result',
      error: error.message
    });
  }
}));

/**
 * @route   GET /webhook/n8n/health
 * @desc    Health check endpoint for n8n
 * @access  n8n webhook
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'n8n webhook endpoints are healthy',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;