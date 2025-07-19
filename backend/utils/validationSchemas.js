/**
 * Common validation schemas
 * Centralized validation patterns used across multiple routes
 */

const Joi = require('joi');

// Common field schemas
const commonFields = {
  uuid: Joi.string().uuid({ version: 'uuidv4' }),
  email: Joi.string().email().lowercase(),
  password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  indentNumber: Joi.string().pattern(/^[A-Z0-9]+$/),
  notes: Joi.string().max(500).optional(),
  status: Joi.string().valid('pending', 'active', 'completed', 'cancelled', 'approved', 'rejected'),
  date: Joi.date().default(() => new Date()),
  quantity: Joi.number().integer().min(1),
  amount: Joi.number().min(0),
  percentage: Joi.number().min(0).max(100)
};

// Common object schemas
const commonObjects = {
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sort: Joi.string().default('created_at'),
    order: Joi.string().valid('asc', 'desc').default('desc')
  }),
  
  search: Joi.object({
    search: Joi.string().max(100),
    status: commonFields.status,
    start_date: Joi.date(),
    end_date: Joi.date()
  }),
  
  idParam: Joi.object({
    id: commonFields.uuid.required()
  }),
  
  uuidParam: Joi.object({
    uuid: commonFields.uuid.required()
  })
};

// Route-specific schemas
const routeSchemas = {
  // Auth routes
  auth: {
    login: Joi.object({
      email: commonFields.email.required(),
      password: Joi.string().required()
    }),
    
    register: Joi.object({
      email: commonFields.email.required(),
      password: commonFields.password.required(),
      first_name: Joi.string().min(2).max(50).required(),
      last_name: Joi.string().min(2).max(50).required(),
      role: Joi.string().valid('admin', 'trader', 'customer').required()
    })
  },
  
  // Allocation routes
  allocation: {
    getAllocations: Joi.object({
      page: commonObjects.pagination.extract('page'),
      limit: commonObjects.pagination.extract('limit'),
      status: commonFields.status,
      branch_id: commonFields.uuid,
      search: commonObjects.search.extract('search')
    }),
    
    manual: Joi.object({
      indent_number: commonFields.indentNumber.required(),
      buyer_type: Joi.string().required(),
      centre_name: Joi.string().required(),
      variety: Joi.string().required(),
      bale_quantity: commonFields.quantity.required(),
      crop_year: Joi.string().required(),
      offer_price: commonFields.amount.required(),
      bid_price: commonFields.amount.required(),
      lifting_period: Joi.string().required(),
      fibre_length: Joi.string().required(),
      ccl_discount: commonFields.amount.optional()
    })
  },
  
  // Procurement routes
  procurement: {
    calculate: Joi.object({
      indent_number: commonFields.indentNumber.required()
    })
  },
  
  // Payment routes
  payment: {
    cdu: Joi.object({
      procurement_id: commonFields.uuid.required()
    }),
    
    utrSubmit: Joi.object({
      payment_id: commonFields.uuid.required(),
      utr_number: Joi.string().min(12).max(22).required()
    }),
    
    sendReminder: Joi.object({
      payment_ids: Joi.array().items(commonFields.uuid).min(1).required()
    })
  },
  
  // Sales routes
  sales: {
    autoSelect: Joi.object({
      sales_config_id: commonFields.uuid.required(),
      requested_qty: commonFields.quantity.required()
    }),
    
    manualSelect: Joi.object({
      sales_config_id: commonFields.uuid.required(),
      selected_lots: Joi.array().items(commonFields.uuid).min(1).required()
    }),
    
    saveDraft: Joi.object({
      sales_config_id: commonFields.uuid.required(),
      selected_lots: Joi.array().items(commonFields.uuid).min(1).required(),
      notes: commonFields.notes
    }),
    
    confirmSale: Joi.object({
      sales_config_id: commonFields.uuid.required(),
      selected_lots: Joi.array().items(commonFields.uuid).min(1).required(),
      notes: commonFields.notes
    }),
    
    newOrder: Joi.object({
      customer_id: commonFields.uuid.required(),
      broker_id: commonFields.uuid.required(),
      order_date: commonFields.date,
      line_items: Joi.array().items(
        Joi.object({
          indent_number: commonFields.indentNumber.required(),
          quantity: commonFields.quantity.required(),
          broker_brokerage_per_bale: commonFields.amount.required(),
          our_brokerage_per_bale: commonFields.amount.required()
        })
      ).min(1).required()
    })
  },
  
  // Customer lots routes
  customerLots: {
    acceptReject: Joi.object({
      assignment_id: commonFields.uuid.required()
    }),
    
    adminOverride: Joi.object({
      assignment_id: commonFields.uuid.required(),
      action: Joi.string().valid('accept', 'reject').required(),
      notes: commonFields.notes
    })
  },
  
  // Contract routes
  contract: {
    search: Joi.object({
      indent_number: commonFields.indentNumber.required()
    }),
    
    approve: Joi.object({
      contract_id: commonFields.uuid.required(),
      notes: commonFields.notes
    })
  },
  
  // Sampling routes
  sampling: {
    fetchIndent: Joi.object({
      indent_number: commonFields.indentNumber.required()
    }),
    
    saveSampling: Joi.object({
      indent_number: commonFields.indentNumber.required(),
      lots: Joi.array().items(Joi.string().min(1)).min(1).required()
    }),
    
    logActivity: Joi.object({
      indent_number: commonFields.indentNumber.required(),
      action: Joi.string().required(),
      notes: Joi.string().optional()
    }),
    
    getHistory: Joi.object({
      indent_number: commonFields.indentNumber.required()
    })
  },
  
  // DO Specifications routes
  doSpecifications: {
    doSpec: Joi.object({
      customer_id: commonFields.uuid.required(),
      total_lots: commonFields.quantity.required(),
      bid_price: commonFields.amount.required(),
      emd_amount: commonFields.amount.required(),
      cotton_value: commonFields.amount.required(),
      gst_rate: commonFields.percentage.required(),
      zone: Joi.string().valid('South Zone', 'Other Zone').required(),
      lots: Joi.array().items(
        Joi.object({
          emd_paid_date: commonFields.date.required(),
          do_payment_dates: Joi.array().items(
            Joi.object({
              date: commonFields.date.required(),
              amount: commonFields.amount.required()
            })
          ).min(1).required(),
          moisture_percentage: commonFields.percentage.required(),
          actual_weight: commonFields.amount.required(),
          carrying_days: Joi.array().items(Joi.number().integer().min(0)).required(),
          unlifted_lots: Joi.array().items(Joi.number().integer().min(0)).required(),
          delivery_dates: Joi.array().items(
            Joi.object({
              date: commonFields.date.required(),
              lots: commonFields.quantity.required(),
              additional_carrying_days: Joi.number().integer().min(0).required()
            })
          ).required()
        })
      ).min(1).required()
    })
  }
};

module.exports = {
  commonFields,
  commonObjects,
  routeSchemas
}; 