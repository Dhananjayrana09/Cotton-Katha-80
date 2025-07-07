/**
 * Contract routes - Flow 3
 * Handles contract upload, approval, and email notifications
 */

const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const axios = require('axios');
const { supabase } = require('../config/supabase');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { validateBody, validateQuery } = require('../middleware/validation');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// Validation schemas
const searchSchema = Joi.object({
  indent_number: Joi.string().required()
});

const approveSchema = Joi.object({
  contract_id: Joi.string().uuid().required()
});

/**
 * @route   GET /api/contract/search
 * @desc    Search procurement details by indent number
 * @access  Private
 */
router.get('/search', 
  authenticateToken,
  validateQuery(searchSchema),
  asyncHandler(async (req, res) => {
    const { indent_number } = req.query;

    const { data: procurement, error } = await supabase
      .from('procurement_dump')
      .select(`
        *,
        allocation:allocation_id (
          *,
          branch_information:branch_id (
            branch_name,
            branch_code,
            zone,
            state,
            branch_email_id
          )
        )
      `)
      .eq('indent_number', indent_number)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
      

    if (error || !procurement) {
      return res.status(404).json({
        success: false,
        message: 'Procurement details not found for the given indent number'
      });
    }

    res.json({
      success: true,
      data: {
        procurement
      }
    });
  })
);

/**
 * @route   POST /api/contract/upload
 * @desc    DEPRECATED: Upload contract PDF file (now handled by n8n)
 * @access  Deprecated
 */
router.post('/upload', (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'This endpoint is deprecated. Please upload contracts via the n8n workflow.'
  });
});

/**
 * @route   POST /api/contract/approve-send
 * @desc    DEPRECATED: Approve contract and send via email (now handled by n8n)
 * @access  Deprecated
 */
router.post('/approve-send', (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'This endpoint is deprecated. Please approve contracts via the n8n workflow.'
  });
});

/**
 * @route   GET /api/contract/pending
 * @desc    Get all pending contracts for admin approval
 * @access  Private (Admin only)
 */
router.get('/pending', 
  authenticateToken,
  authorizeRoles('admin'),
  asyncHandler(async (req, res) => {
    const { data: contracts, error } = await supabase
      .from('purchase_contract_table')
      .select(`
        *,
        uploaded_user:uploaded_by (
          first_name,
          last_name,
          email
        )
      `)
      .eq('status', 'pending')
      .order('uploaded_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch pending contracts',
        error: error.message
      });
    }

    res.json({
      success: true,
      data: {
        contracts,
        count: contracts.length
      }
    });
  })
);

/**
 * @route   GET /api/contract/logs
 * @desc    Get contract logs (audit trail)
 * @access  Private (Admin only)
 */
router.get('/logs', 
  authenticateToken,
  authorizeRoles('admin'),
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const { data: logs, error, count } = await supabase
      .from('contract_logs')
      .select(`
        *,
        purchase_contract_table:contract_id (
          indent_number,
          firm_name,
          status
        ),
        users:user_id (
          first_name,
          last_name,
          email
        )
      `, { count: 'exact' })
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch contract logs',
        error: error.message
      });
    }

    const totalPages = Math.ceil(count / limit);

    res.json({
      success: true,
      data: {
        logs,
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

module.exports = router;