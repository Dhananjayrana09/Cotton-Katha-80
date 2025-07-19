/**
 * Payment-specific utility functions
 * Extracted from paymentRoutes.js to reduce code duplication and improve maintainability
 */

const { supabase } = require('../config/supabase');
const { sendErrorResponse, sendSuccessResponse, handleDatabaseError } = require('./databaseHelpers');

/**
 * Fetch procurement details with related data
 * @param {string} procurementId - Procurement ID
 * @returns {Object} Procurement details
 */
async function fetchProcurementDetails(procurementId) {
  const { data: procurement, error } = await supabase
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
    .eq('id', procurementId)
    .single();

  if (error || !procurement) {
    return { 
      success: false, 
      error: 'Procurement record not found' 
    };
  }

  return { 
    success: true, 
    data: procurement 
  };
}

/**
 * Check if payment already exists for procurement
 * @param {string} procurementId - Procurement ID
 * @returns {Object} Check result
 */
async function checkExistingPayment(procurementId) {
  const { data: existingPayment } = await supabase
    .from('payments')
    .select('id')
    .eq('procurement_id', procurementId)
    .single();

  if (existingPayment) {
    return { 
      success: false, 
      error: 'Payment already exists for this procurement' 
    };
  }

  return { success: true };
}

/**
 * Generate CDU data from procurement
 * @param {Object} procurement - Procurement object
 * @returns {Object} CDU data
 */
function generateCDUData(procurement) {
  return {
    payment_mode: 'RTGS',
    payment_type: 'EMD',
    amount: procurement.emd_amount,
    bank: 'State Bank of India', // Default bank
    due_date: procurement.due_date,
    remarks: `EMD Payment for Indent ${procurement.indent_number}`
  };
}

/**
 * Create payment record
 * @param {Object} paymentData - Payment data
 * @param {string} userId - User ID creating the payment
 * @returns {Object} Creation result
 */
async function createPaymentRecord(paymentData, userId) {
  try {
    const { data: payment, error } = await supabase
      .from('payments')
      .insert(paymentData)
      .select()
      .single();

    if (error) {
      return { 
        success: false, 
        error: `Failed to create payment record: ${error.message}` 
      };
    }

    return { 
      success: true, 
      data: payment 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Payment creation failed: ${error.message}` 
    };
  }
}

/**
 * Log payment action in audit log
 * @param {string} tableName - Table name
 * @param {string} recordId - Record ID
 * @param {string} action - Action performed
 * @param {string} userId - User ID
 * @param {Object} newValues - New values
 * @param {Object} oldValues - Old values (optional)
 * @returns {Object} Logging result
 */
async function logPaymentAction(tableName, recordId, action, userId, newValues, oldValues = {}) {
  try {
    await supabase
      .from('audit_log')
      .insert({
        table_name: tableName,
        record_id: recordId,
        action: action,
        user_id: userId,
        old_values: oldValues,
        new_values: newValues
      });

    return { success: true };
  } catch (error) {
    console.error('Failed to log payment action:', error);
    return { 
      success: false, 
      error: `Logging failed: ${error.message}` 
    };
  }
}

/**
 * Generate CDU (payment draft) from procurement record
 * @param {string} procurementId - Procurement ID
 * @param {string} userId - User ID
 * @returns {Object} CDU generation result
 */
async function generateCDU(procurementId, userId) {
  try {
    // Fetch procurement details
    const procurementResult = await fetchProcurementDetails(procurementId);
    if (!procurementResult.success) {
      return procurementResult;
    }

    // Check if payment already exists
    const existingResult = await checkExistingPayment(procurementId);
    if (!existingResult.success) {
      return existingResult;
    }

    // Generate CDU data
    const cduData = generateCDUData(procurementResult.data);

    // Calculate UTR due date (same as payment due date)
    const utrDueDate = new Date(procurementResult.data.due_date);

    // Create payment record
    const paymentData = {
      procurement_id: procurementId,
      payment_mode: cduData.payment_mode,
      payment_type: cduData.payment_type,
      amount: cduData.amount,
      bank: cduData.bank,
      due_date: cduData.due_date,
      utr_due_date: utrDueDate.toISOString().split('T')[0],
      payment_status: 'pending',
      remarks: cduData.remarks,
      created_by: userId
    };

    const paymentResult = await createPaymentRecord(paymentData, userId);
    if (!paymentResult.success) {
      return paymentResult;
    }

    // Log CDU generation
    await logPaymentAction(
      'payments',
      paymentResult.data.id,
      'CDU_GENERATED',
      userId,
      { ...cduData, payment_id: paymentResult.data.id }
    );

    return {
      success: true,
      data: {
        payment_id: paymentResult.data.id,
        cdu: cduData,
        payment_details: paymentResult.data
      }
    };
  } catch (error) {
    return { 
      success: false, 
      error: `CDU generation failed: ${error.message}` 
    };
  }
}

/**
 * Fetch payment details by ID
 * @param {string} paymentId - Payment ID
 * @returns {Object} Payment details
 */
async function fetchPaymentDetails(paymentId) {
  const { data: payment, error } = await supabase
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .single();

  if (error || !payment) {
    return { 
      success: false, 
      error: 'Payment record not found' 
    };
  }

  return { 
    success: true, 
    data: payment 
  };
}

/**
 * Validate UTR submission
 * @param {Object} payment - Payment object
 * @returns {Object} Validation result
 */
function validateUTRSubmission(payment) {
  if (payment.utr_number) {
    return { 
      success: false, 
      error: 'UTR already submitted for this payment' 
    };
  }

  return { success: true };
}

/**
 * Submit UTR number for a payment
 * @param {string} paymentId - Payment ID
 * @param {string} utrNumber - UTR number
 * @param {string} userId - User ID
 * @returns {Object} Submission result
 */
async function submitUTR(paymentId, utrNumber, userId) {
  try {
    // Check if payment exists
    const paymentResult = await fetchPaymentDetails(paymentId);
    if (!paymentResult.success) {
      return paymentResult;
    }

    // Validate UTR submission
    const validationResult = validateUTRSubmission(paymentResult.data);
    if (!validationResult.success) {
      return validationResult;
    }

    // Update payment with UTR number
    const { data: updatedPayment, error: updateError } = await supabase
      .from('payments')
      .update({
        utr_number: utrNumber,
        payment_status: 'verified',
        verified_by: userId,
        verified_at: new Date().toISOString()
      })
      .eq('id', paymentId)
      .select()
      .single();

    if (updateError) {
      return { 
        success: false, 
        error: `Failed to update payment with UTR: ${updateError.message}` 
      };
    }

    // Log UTR submission
    await logPaymentAction(
      'payments',
      paymentId,
      'UTR_SUBMITTED',
      userId,
      { utr_number: utrNumber, payment_status: 'verified' }
    );

    return { 
      success: true, 
      data: updatedPayment 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `UTR submission failed: ${error.message}` 
    };
  }
}

/**
 * Fetch payments with pagination and filtering
 * @param {Object} filters - Filter criteria
 * @param {Object} pagination - Pagination parameters
 * @returns {Object} Payments with pagination metadata
 */
async function fetchPayments(filters = {}, pagination = {}) {
  const { page = 1, limit = 10 } = pagination;
  const offset = (page - 1) * limit;

  let query = supabase
    .from('payments')
    .select(`
      *,
      procurement_dump:procurement_id (
        indent_number,
        emd_amount,
        due_date
      )
    `, { count: 'exact' });

  // Apply filters
  if (filters.status) {
    query = query.eq('payment_status', filters.status);
  }

  if (filters.payment_type) {
    query = query.eq('payment_type', filters.payment_type);
  }

  if (filters.search) {
    query = query.or(`utr_number.ilike.%${filters.search}%,remarks.ilike.%${filters.search}%`);
  }

  // Add pagination and sorting
  const { data: payments, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return { 
      success: false, 
      error: error.message 
    };
  }

  // Calculate pagination info
  const totalPages = Math.ceil(count / limit);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  return {
    success: true,
    data: {
      payments: payments || [],
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_records: count,
        has_next: hasNext,
        has_previous: hasPrev,
        per_page: limit
      }
    }
  };
}

/**
 * Get payment statistics
 * @returns {Object} Statistics data
 */
async function getPaymentStatistics() {
  try {
    const { data: payments, error } = await supabase
      .from('payments')
      .select('payment_status, amount');

    if (error) {
      return { 
        success: false, 
        error: error.message 
      };
    }

    // Calculate statistics
    const stats = payments.reduce((acc, payment) => {
      const status = payment.payment_status;
      acc[status] = (acc[status] || 0) + 1;
      acc.total_amount = (acc.total_amount || 0) + (payment.amount || 0);
      return acc;
    }, {});

    return {
      success: true,
      data: {
        statistics: stats,
        total_payments: payments.length,
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
 * Validate payment data
 * @param {Object} paymentData - Payment data to validate
 * @returns {Object} Validation result
 */
function validatePaymentData(paymentData) {
  const requiredFields = ['procurement_id', 'amount', 'payment_type'];
  const missingFields = requiredFields.filter(field => !paymentData[field]);

  if (missingFields.length > 0) {
    return {
      success: false,
      error: `Missing required fields: ${missingFields.join(', ')}`
    };
  }

  if (paymentData.amount <= 0) {
    return {
      success: false,
      error: 'Amount must be greater than 0'
    };
  }

  return { success: true };
}

module.exports = {
  fetchProcurementDetails,
  checkExistingPayment,
  generateCDUData,
  createPaymentRecord,
  logPaymentAction,
  generateCDU,
  fetchPaymentDetails,
  validateUTRSubmission,
  submitUTR,
  fetchPayments,
  getPaymentStatistics,
  validatePaymentData
}; 