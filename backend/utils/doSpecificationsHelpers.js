/**
 * DO Specifications-specific utility functions
 * Extracted from doSpecificationsRoutes.js to reduce code duplication and improve maintainability
 */

const { supabase } = require('../config/supabase');
const { sendErrorResponse, sendSuccessResponse, handleDatabaseError } = require('./databaseHelpers');

/**
 * Calculate weight difference for a lot
 * @param {number} actualWeight - Actual weight
 * @param {number} assumedWeight - Assumed weight based on zone
 * @param {number} bidPrice - Bid price
 * @returns {Object} Weight difference calculation result
 */
function calculateWeightDifference(actualWeight, assumedWeight, bidPrice) {
  const weightDiffAmount = (actualWeight - assumedWeight) * bidPrice * 0.2812;
  let weightCase = '';
  let weightMessage = '';

  if (actualWeight > assumedWeight) {
    weightCase = 'customer_pays_us';
    weightMessage = 'Customer pays us (and we pay CCI) for extra weight.';
  } else if (actualWeight < assumedWeight) {
    weightCase = 'we_pay_customer';
    weightMessage = 'CCI pays us (and we pay customer) for reduced weight.';
  } else {
    weightCase = 'no_difference';
    weightMessage = 'No weight difference.';
  }

  return {
    weightDifference: Number(weightDiffAmount.toFixed(2)),
    weightCase,
    weightMessage
  };
}

/**
 * Calculate interest for DO payments
 * @param {Array} doPaymentDates - Array of DO payment dates and amounts
 * @param {string} emdPaidDate - EMD paid date
 * @returns {number} Total interest amount
 */
function calculateInterest(doPaymentDates, emdPaidDate) {
  let interestTotal = 0;

  if (Array.isArray(doPaymentDates)) {
    doPaymentDates.forEach(slot => {
      const emdDate = new Date(emdPaidDate);
      const doDate = new Date(slot.date);
      const days = Math.max(0, Math.ceil((doDate - emdDate) / (1000 * 60 * 60 * 24)));
      const slotInterest = (((days * 0.05) / 365) * slot.amount);
      interestTotal += slotInterest;
    });
  }

  return Number(interestTotal.toFixed(2));
}

/**
 * Calculate late lifting charges for deliveries
 * @param {Array} deliveryDates - Array of delivery dates
 * @param {Array} doPaymentDates - Array of DO payment dates
 * @param {number} cottonValue - Cotton value
 * @param {number} gstRate - GST rate
 * @returns {Object} Late lifting charges calculation result
 */
function calculateLateLiftingCharges(deliveryDates, doPaymentDates, cottonValue, gstRate) {
  let lateLiftingTotal = 0;
  let lateLiftingBreakdown = [];

  if (Array.isArray(deliveryDates)) {
    deliveryDates.forEach(delivery => {
      const doDate = new Date(doPaymentDates[0]?.date); // Assume first DO payment date for 15-day window
      const deliveryDate = new Date(delivery.date);
      const daysSinceDo = Math.max(0, Math.ceil((deliveryDate - doDate) / (1000 * 60 * 60 * 24)));
      const additionalCarryingDays = delivery.additional_carrying_days || 0;
      const totalCarryingDays = daysSinceDo + additionalCarryingDays;

      let rate = 0;
      let rateLabel = '';

      if (totalCarryingDays <= 15) {
        rate = 0;
        rateLabel = 'No charges (within 15 days)';
      } else if (totalCarryingDays <= 45) {
        rate = 0.005;
        rateLabel = '0.50% per month (0-30 days after 15-day window)';
      } else if (totalCarryingDays <= 75) {
        rate = 0.0075;
        rateLabel = '0.75% per month (31-60 days after 15-day window)';
      } else {
        rate = 0.01;
        rateLabel = '1.00% per month (after 60 days after 15-day window)';
      }

      let baseCharge = 0;
      if (rate > 0) {
        baseCharge = cottonValue * rate * delivery.lots;
      }

      const gst = baseCharge * gstRate;
      const totalCharge = baseCharge + gst;
      lateLiftingTotal += totalCharge;

      lateLiftingBreakdown.push({
        delivery_date: delivery.date,
        lots: delivery.lots,
        additional_carrying_days: totalCarryingDays,
        rate,
        rate_label: rateLabel,
        base_charge: baseCharge,
        gst,
        total_charge: totalCharge
      });
    });
  }

  return {
    lateLiftingCharges: Number(lateLiftingTotal.toFixed(3)),
    lateLiftingBreakdown
  };
}

/**
 * Get assumed weight based on zone
 * @param {string} zone - Zone (South Zone or Other Zone)
 * @returns {number} Assumed weight
 */
function getAssumedWeight(zone) {
  return zone === 'South Zone' ? 48 / 0.2812 : 47 / 0.2812;
}

/**
 * Calculate DO Specifications results
 * @param {Object} params - Calculation parameters
 * @param {Array} params.lots - Array of lots
 * @param {number} params.bidPrice - Bid price
 * @param {number} params.emdAmount - EMD amount
 * @param {number} params.cottonValue - Cotton value
 * @param {number} params.gstRate - GST rate
 * @param {string} params.zone - Zone
 * @returns {Object} Calculation results
 */
function calculateResults({ lots, bid_price, emd_amount, cotton_value, gst_rate, zone }) {
  const assumedWeight = getAssumedWeight(zone);
  const results = [];
  let totalWeightDiff = 0;
  let totalInterest = 0;
  let totalLateLifting = 0;

  lots.forEach((lot, idx) => {
    const actualWeight = Number(lot.actual_weight);

    // 1. Weight Difference Calculation
    const weightResult = calculateWeightDifference(actualWeight, assumedWeight, bid_price);

    // 2. Interest Calculation
    const interestTotal = calculateInterest(lot.do_payment_dates, lot.emd_paid_date);

    // 3. Late Lifting Charges Calculation
    const lateLiftingResult = calculateLateLiftingCharges(
      lot.delivery_dates, 
      lot.do_payment_dates, 
      cotton_value, 
      gst_rate
    );

    results.push({
      lot_index: idx + 1,
      weight_difference: weightResult.weightDifference,
      weight_case: weightResult.weightCase,
      weight_message: weightResult.weightMessage,
      interest: interestTotal,
      late_lifting_charges: lateLiftingResult.lateLiftingCharges,
      late_lifting_breakdown: lateLiftingResult.lateLiftingBreakdown
    });

    totalWeightDiff += weightResult.weightDifference;
    totalInterest += interestTotal;
    totalLateLifting += lateLiftingResult.lateLiftingCharges;
  });

  return {
    lots: results,
    summary: {
      total_weight_difference: Number(totalWeightDiff.toFixed(2)),
      total_interest: Number(totalInterest.toFixed(2)),
      total_late_lifting_charges: Number(totalLateLifting.toFixed(3))
    }
  };
}

/**
 * Save DO Specification to database
 * @param {Object} doSpecData - DO Specification data
 * @param {string} userId - User ID
 * @returns {Object} Save result
 */
async function saveDOSpecification(doSpecData, userId) {
  try {
    const { customer_id, total_lots, bid_price, emd_amount, cotton_value, gst_rate, zone, lots } = doSpecData;

    // Calculate results
    const calculationResults = calculateResults({ 
      lots, 
      bid_price, 
      emd_amount, 
      cotton_value, 
      gst_rate, 
      zone 
    });

    // Insert into database
    const { data, error } = await supabase
      .from('do_specifications')
      .insert({
        user_id: userId,
        customer_id,
        total_lots,
        bid_price,
        emd_amount,
        cotton_value,
        gst_rate,
        zone,
        lots,
        calculation_results: calculationResults
      })
      .select()
      .single();

    if (error) {
      return { 
        success: false, 
        error: `Failed to save DO Specification: ${error.message}` 
      };
    }

    return { 
      success: true, 
      data: {
        ...data,
        calculation_results: calculationResults
      }
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to save DO Specification: ${error.message}` 
    };
  }
}

/**
 * Get DO Specifications with pagination
 * @param {string} userId - User ID
 * @param {number} page - Page number
 * @param {number} limit - Items per page
 * @returns {Object} DO Specifications with pagination
 */
async function getDOSpecifications(userId, page = 1, limit = 10) {
  try {
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabase
      .from('do_specifications')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return { 
        success: false, 
        error: `Failed to fetch DO Specifications: ${error.message}` 
      };
    }

    return {
      success: true,
      data: {
        records: data || [],
        pagination: {
          current_page: Number(page),
          total_pages: Math.ceil(count / limit),
          total_records: count,
          has_next: offset + limit < count,
          has_previous: page > 1,
          per_page: limit
        }
      }
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to get DO Specifications: ${error.message}` 
    };
  }
}

/**
 * Get DO Specification by ID
 * @param {string} specificationId - Specification ID
 * @param {string} userId - User ID (for authorization)
 * @returns {Object} DO Specification details
 */
async function getDOSpecificationById(specificationId, userId) {
  try {
    const { data, error } = await supabase
      .from('do_specifications')
      .select(`
        *,
        customer:customer_id (
          first_name,
          last_name,
          email,
          company_name
        )
      `)
      .eq('id', specificationId)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return { 
        success: false, 
        error: 'DO Specification not found' 
      };
    }

    return { 
      success: true, 
      data 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to get DO Specification: ${error.message}` 
    };
  }
}

/**
 * Get DO Specifications history
 * @param {string} userId - User ID
 * @param {Object} filters - Optional filters
 * @returns {Object} DO Specifications history
 */
async function getDOSpecificationsHistory(userId, filters = {}) {
  try {
    let query = supabase
      .from('do_specifications')
      .select(`
        id,
        created_at,
        total_lots,
        bid_price,
        cotton_value,
        zone,
        calculation_results
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    // Apply filters if provided
    if (filters.start_date) {
      query = query.gte('created_at', filters.start_date);
    }
    if (filters.end_date) {
      query = query.lte('created_at', filters.end_date);
    }
    if (filters.zone) {
      query = query.eq('zone', filters.zone);
    }

    const { data, error } = await query;

    if (error) {
      return { 
        success: false, 
        error: `Failed to fetch DO Specifications history: ${error.message}` 
      };
    }

    return {
      success: true,
      data: {
        history: data || [],
        total_records: data ? data.length : 0
      }
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to get DO Specifications history: ${error.message}` 
    };
  }
}

/**
 * Validate DO Specification data
 * @param {Object} doSpecData - DO Specification data to validate
 * @returns {Object} Validation result
 */
function validateDOSpecificationData(doSpecData) {
  const requiredFields = ['customer_id', 'total_lots', 'bid_price', 'emd_amount', 'cotton_value', 'gst_rate', 'zone', 'lots'];
  const missingFields = requiredFields.filter(field => !doSpecData[field]);

  if (missingFields.length > 0) {
    return {
      success: false,
      error: `Missing required fields: ${missingFields.join(', ')}`
    };
  }

  if (!Array.isArray(doSpecData.lots) || doSpecData.lots.length === 0) {
    return {
      success: false,
      error: 'Lots must be a non-empty array'
    };
  }

  if (doSpecData.bid_price < 0 || doSpecData.emd_amount < 0 || doSpecData.cotton_value < 0 || doSpecData.gst_rate < 0) {
    return {
      success: false,
      error: 'All monetary values must be non-negative'
    };
  }

  if (!['South Zone', 'Other Zone'].includes(doSpecData.zone)) {
    return {
      success: false,
      error: 'Zone must be either "South Zone" or "Other Zone"'
    };
  }

  return { success: true };
}

module.exports = {
  calculateWeightDifference,
  calculateInterest,
  calculateLateLiftingCharges,
  getAssumedWeight,
  calculateResults,
  saveDOSpecification,
  getDOSpecifications,
  getDOSpecificationById,
  getDOSpecificationsHistory,
  validateDOSpecificationData
}; 