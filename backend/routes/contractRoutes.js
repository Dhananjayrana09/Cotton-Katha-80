/**
 * Contract routes - Flow 3
 * Handles contract upload, approval, and email notifications
 */

const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { supabase } = require('../config/supabase');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { validateBody, validateQuery } = require('../middleware/validation');
const { routeSchemas } = require('../utils/validationSchemas');
const { sendErrorResponse, sendSuccessResponse, handleDatabaseError } = require('../utils/databaseHelpers');
const {
  searchProcurementByIndent,
  getPendingContracts,
  getIndentContractStatus,
  approveContract,
  getContractStatistics
} = require('../utils/contractHelpers');

const router = express.Router();

// Configure multer for file uploads (kept for potential future use)
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

/**
 * @route   GET /api/contract/search
 * @desc    Search procurement details by indent number
 * @access  Private
 */
router.get('/search', 
  authenticateToken,
  validateQuery(routeSchemas.contract.search),
  asyncHandler(async (req, res) => {
    const { indent_number } = req.query;

    // Use utility function to search procurement details
    const result = await searchProcurementByIndent(indent_number);

    if (!result.success) {
      if (result.error.includes('not found')) {
        return sendErrorResponse(res, 404, result.error);
      }
      return handleDatabaseError(res, { message: result.error }, 'search procurement details');
    }

    return sendSuccessResponse(res, result.data);
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
    // Use utility function to get pending contracts
    const result = await getPendingContracts();

    if (!result.success) {
      return handleDatabaseError(res, { message: result.error }, 'fetch pending contracts');
    }

    return sendSuccessResponse(res, result.data);
  })
);

/**
 * @route   GET /api/contract/indent-status
 * @desc    Get all indent numbers with their contract upload status
 * @access  Private
 */
router.get('/indent-status', 
  authenticateToken,
  asyncHandler(async (req, res) => {
    // Use utility function to get indent contract status
    const result = await getIndentContractStatus();

    if (!result.success) {
      return handleDatabaseError(res, { message: result.error }, 'fetch indent contract status');
    }

    return sendSuccessResponse(res, result.data);
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
      return handleDatabaseError(res, error, 'fetch contract logs');
    }

    const totalPages = Math.ceil(count / limit);

    return sendSuccessResponse(res, {
      logs: logs || [],
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_records: count,
        has_next: page < totalPages,
        has_previous: page > 1,
        per_page: limit
      }
    });
  })
);

module.exports = router;