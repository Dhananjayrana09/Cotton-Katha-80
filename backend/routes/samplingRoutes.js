/**
 * Sampling routes - Flow 4
 * Handles sampling entry and lot number management
 */

const express = require('express');
const { supabase } = require('../config/supabase');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateToken } = require('../middleware/auth');
const { validateQuery, validateBody } = require('../middleware/validation');
const { routeSchemas } = require('../utils/validationSchemas');
const { sendErrorResponse, sendSuccessResponse, handleDatabaseError } = require('../utils/databaseHelpers');
const {
  fetchIndentForSampling,
  saveSamplingEntries,
  getSamplingStatistics,
  validateSamplingData
} = require('../utils/samplingHelpers');

const router = express.Router();

/**
 * @route   GET /api/sampling/fetch-indent
 * @desc    Fetch indent details for sampling entry
 * @access  Private
 */
router.get('/fetch-indent', 
  authenticateToken,
  validateQuery(routeSchemas.sampling.fetchIndent),
  asyncHandler(async (req, res) => {
    const { indent_number } = req.query;

    // Use utility function to fetch indent details
    const result = await fetchIndentForSampling(indent_number);

    if (!result.success) {
      if (result.error.includes('not found')) {
        return sendErrorResponse(res, 404, result.error);
      }
      return handleDatabaseError(res, { message: result.error }, 'fetch indent details');
    }

    return sendSuccessResponse(res, result.data);
  })
);

/**
 * @route   POST /api/sampling/save
 * @desc    Save sampling entries to inventory table
 * @access  Private
 */
router.post('/save', 
  authenticateToken,
  validateBody(routeSchemas.sampling.saveSampling),
  asyncHandler(async (req, res) => {
    const { indent_number, lots } = req.body;

    // Use utility function to save sampling entries
    const result = await saveSamplingEntries(indent_number, lots, req.user.id);

    if (!result.success) {
      if (result.error.includes('not found')) {
        return sendErrorResponse(res, 404, result.error);
      }
      if (result.error.includes('already completed') || result.error.includes('Duplicate')) {
        return sendErrorResponse(res, 400, result.error);
      }
      return handleDatabaseError(res, { message: result.error }, 'save sampling entries');
    }

    return sendSuccessResponse(res, result.data, 'Sampling entries saved successfully', 201);
  })
);

/**
 * @route   POST /api/sampling/log
 * @desc    Log sampling activity (optional audit trail)
 * @access  Private
 */
router.post('/log', 
  authenticateToken,
  validateBody(routeSchemas.sampling.logActivity),
  asyncHandler(async (req, res) => {
    const { indent_number, action, notes } = req.body;

    try {
      await supabase
        .from('audit_log')
        .insert({
          table_name: 'sampling_log',
          action: action.toUpperCase(),
          user_id: req.user.id,
          new_values: {
            indent_number,
            notes,
            timestamp: new Date().toISOString()
          }
        });

      return sendSuccessResponse(res, null, 'Sampling activity logged successfully');
    } catch (error) {
      return handleDatabaseError(res, { message: error.message }, 'log sampling activity');
    }
  })
);

/**
 * @route   GET /api/sampling/history
 * @desc    Get sampling history for an indent
 * @access  Private
 */
router.get('/history', 
  authenticateToken,
  validateQuery(routeSchemas.sampling.getHistory),
  asyncHandler(async (req, res) => {
    const { indent_number } = req.query;

    const { data: history, error } = await supabase
      .from('inventory_table')
      .select(`
        *,
        added_user:added_by (
          first_name,
          last_name,
          email
        )
      `)
      .eq('indent_number', indent_number)
      .order('created_at', { ascending: false });

    if (error) {
      return handleDatabaseError(res, error, 'fetch sampling history');
    }

    return sendSuccessResponse(res, {
      indent_number,
      history: history || [],
      total_lots: history ? history.length : 0
    });
  })
);

/**
 * @route   GET /api/sampling/stats
 * @desc    Get sampling statistics
 * @access  Private
 */
router.get('/stats', 
  authenticateToken,
  asyncHandler(async (req, res) => {
    // Use utility function to get sampling statistics
    const result = await getSamplingStatistics();

    if (!result.success) {
      return handleDatabaseError(res, { message: result.error }, 'fetch sampling statistics');
    }

    return sendSuccessResponse(res, result.data);
  })
);

module.exports = router;