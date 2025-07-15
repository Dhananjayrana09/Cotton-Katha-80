const express = require('express');
const Joi = require('joi');
const { supabase } = require('../config/supabase');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateToken } = require('../middleware/auth');
const { validateBody } = require('../middleware/validation');

const router = express.Router();

// Validation schema for DO Specification input
const doSpecSchema = Joi.object({
  customer_id: Joi.string().uuid().required(),
  total_lots: Joi.number().integer().min(1).required(),
  bid_price: Joi.number().min(0).required(),
  emd_amount: Joi.number().min(0).required(),
  cotton_value: Joi.number().min(0).required(),
  gst_rate: Joi.number().min(0).required(),
  zone: Joi.string().valid('South Zone', 'Other Zone').required(),
  lots: Joi.array().items(
    Joi.object({
      emd_paid_date: Joi.date().required(),
      do_payment_dates: Joi.array().items(
        Joi.object({
          date: Joi.date().required(),
          amount: Joi.number().min(0).required()
        })
      ).min(1).required(),
      moisture_percentage: Joi.number().min(0).required(),
      actual_weight: Joi.number().min(0).required(),
      carrying_days: Joi.array().items(Joi.number().integer().min(0)).required(),
      unlifted_lots: Joi.array().items(Joi.number().integer().min(0)).required(),
      delivery_dates: Joi.array().items(
        Joi.object({
          date: Joi.date().required(),
          lots: Joi.number().integer().min(1).required(),
          additional_carrying_days: Joi.number().integer().min(0).required()
        })
      ).required()
    })
  ).min(1).required()
});

// Calculation logic for DO Specifications
function calculateResults({ lots, bid_price, emd_amount, cotton_value, gst_rate, zone }) {
  // Assumed weight per zone
  const assumed_weight = zone === 'South Zone' ? 48 / 0.2812 : 47 / 0.2812;
  const results = [];
  let total_weight_diff = 0;
  let total_interest = 0;
  let total_late_lifting = 0;

  lots.forEach((lot, idx) => {
    // 1. Weight Difference Calculation
    const actual_weight = Number(lot.actual_weight);
    const weight_diff_amount = (actual_weight - assumed_weight) * bid_price * 0.2812;
    let weight_case = '';
    let weight_message = '';
    if (actual_weight > assumed_weight) {
      weight_case = 'customer_pays_us';
      weight_message = 'Customer pays us (and we pay CCI) for extra weight.';
    } else if (actual_weight < assumed_weight) {
      weight_case = 'we_pay_customer';
      weight_message = 'CCI pays us (and we pay customer) for reduced weight.';
    } else {
      weight_case = 'no_difference';
      weight_message = 'No weight difference.';
    }

    // 2. Interest Calculation (handle partial payments)
    let interest_total = 0;
    if (Array.isArray(lot.do_payment_dates)) {
      lot.do_payment_dates.forEach(slot => {
        const emdDate = new Date(lot.emd_paid_date);
        const doDate = new Date(slot.date);
        const days = Math.max(0, Math.ceil((doDate - emdDate) / (1000 * 60 * 60 * 24)));
        const slot_interest = (((days * 0.05) / 365) * slot.amount);
        interest_total += slot_interest;
      });
    }

    // 3. Late Lifting Charges (handle partial deliveries)
    let late_lifting_total = 0;
    let late_lifting_breakdown = [];
    if (Array.isArray(lot.delivery_dates)) {
      lot.delivery_dates.forEach(delivery => {
        const doDate = new Date(lot.do_payment_dates[0]?.date); // Assume first DO payment date for 15-day window
        const deliveryDate = new Date(delivery.date);
        const days_since_do = Math.max(0, Math.ceil((deliveryDate - doDate) / (1000 * 60 * 60 * 24)));
        const additional_carrying_days = delivery.additional_carrying_days || 0;
        const total_carrying_days = days_since_do + additional_carrying_days;
        let rate = 0;
        let rate_label = '';
        if (total_carrying_days <= 15) {
          rate = 0;
          rate_label = 'No charges (within 15 days)';
        } else if (total_carrying_days <= 45) {
          rate = 0.005;
          rate_label = '0.50% per month (0-30 days after 15-day window)';
        } else if (total_carrying_days <= 75) {
          rate = 0.0075;
          rate_label = '0.75% per month (31-60 days after 15-day window)';
        } else {
          rate = 0.01;
          rate_label = '1.00% per month (after 60 days after 15-day window)';
        }
        let base_charge = 0;
        if (rate > 0) {
          base_charge = cotton_value * rate * delivery.lots;
        }
        const gst = base_charge * gst_rate;
        const total_charge = base_charge + gst;
        late_lifting_total += total_charge;
        late_lifting_breakdown.push({
          delivery_date: delivery.date,
          lots: delivery.lots,
          additional_carrying_days: total_carrying_days,
          rate,
          rate_label,
          base_charge,
          gst,
          total_charge
        });
      });
    }

    results.push({
      lot_index: idx + 1,
      weight_difference: Number(weight_diff_amount.toFixed(2)),
      weight_case,
      weight_message,
      interest: Number(interest_total.toFixed(2)),
      late_lifting_charges: Number(late_lifting_total.toFixed(3)),
      late_lifting_breakdown
    });
    total_weight_diff += weight_diff_amount;
    total_interest += interest_total;
    total_late_lifting += late_lifting_total;
  });

  return {
    lots: results,
    summary: {
      total_weight_difference: Number(total_weight_diff.toFixed(2)),
      total_interest: Number(total_interest.toFixed(2)),
      total_late_lifting_charges: Number(total_late_lifting.toFixed(3))
    }
  };
}

// POST /api/do-specifications
router.post('/', authenticateToken, validateBody(doSpecSchema), asyncHandler(async (req, res) => {
  const { customer_id, total_lots, bid_price, emd_amount, cotton_value, gst_rate, zone, lots } = req.body;
  // Calculate results
  const calculation_results = calculateResults({ lots, bid_price, emd_amount, cotton_value, gst_rate, zone });
  // Insert into DB
  const { data, error } = await supabase
    .from('do_specifications')
    .insert({
      user_id: req.user.id,
      customer_id,
      total_lots,
      bid_price,
      emd_amount,
      cotton_value,
      gst_rate,
      zone,
      lots,
      calculation_results
    })
    .select()
    .single();
  if (error) {
    return res.status(500).json({ success: false, message: 'Failed to save DO Specification', error: error.message });
  }
  res.json({ success: true, data });
}));

// GET /api/do-specifications (list all for user, with pagination)
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;
  const { data, error, count } = await supabase
    .from('do_specifications')
    .select('*', { count: 'exact' })
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch DO Specifications', error: error.message });
  }
  res.json({
    success: true,
    data: {
      records: data,
      pagination: {
        current_page: Number(page),
        total_pages: Math.ceil(count / limit),
        total_records: count,
        has_next: offset + limit < count,
        has_previous: page > 1,
        per_page: Number(limit)
      }
    }
  });
}));

// GET /api/do-specifications/:id
router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('do_specifications')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !data) {
    return res.status(404).json({ success: false, message: 'DO Specification not found' });
  }
  res.json({ success: true, data });
}));

module.exports = router; 