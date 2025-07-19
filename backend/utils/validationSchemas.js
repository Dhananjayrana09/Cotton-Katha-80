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
      search: commonObjects.search.extract('search'),
      status: commonFields.status,
      start_date: commonObjects.search.extract('start_date'),
      end_date: commonObjects.search.extract('end_date')
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
      lot_number: Joi.string().required(),
      moisture_percentage: commonFields.percentage.required(),
      actual_weight: commonFields.amount.required(),
      notes: commonFields.notes
    })
  },
  
  // DO Specifications routes
  doSpecifications: {
    doSpec: Joi.object({
      indent_number: commonFields.indentNumber.required(),
      lot_number: Joi.string().required(),
      specifications: Joi.object({
        fibre_length: Joi.string().required(),
        variety: Joi.string().required(),
        other_specs: Joi.object().optional()
      }).required(),
      notes: commonFields.notes
    })
  }
};

module.exports = {
  commonFields,
  commonObjects,
  routeSchemas
}; 