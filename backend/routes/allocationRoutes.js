/**
 * Allocation routes - Flow 2
 * Handles allocation listing and management
 */

const express = require('express');
const { supabase } = require('../config/supabase');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { validateQuery, validateBody } = require('../middleware/validation');
const { routeSchemas } = require('../utils/validationSchemas');
const { sendErrorResponse, sendSuccessResponse, handleDatabaseError } = require('../utils/databaseHelpers');
const {
  fetchAllocations,
  fetchAllocationDetails,
  updateAllocationStatus,
  createAllocation,
  deleteAllocation,
  getAllocationStatistics,
  validateAllocationData
} = require('../utils/allocationHelpers');

const router = express.Router();

/**
 * @route   GET /api/allocations
 * @desc    Get list of allocations with pagination and filtering
 * @access  Private (All authenticated users)
 */
router.get('/', 
  authenticateToken, 
  validateQuery(routeSchemas.allocation.getAllocations), 
  asyncHandler(async (req, res) => {
    const { page, limit, status, branch_id, search } = req.query;

    // Use utility function to fetch allocations
    const result = await fetchAllocations(
      { status, branch_id, search },
      { page, limit },
      req.user
    );

    if (!result.success) {
      return handleDatabaseError(res, { message: result.error }, 'fetch allocations');
    }

    return sendSuccessResponse(res, result.data);
  })
);

/**
 * @route   GET /api/allocations/:id
 * @desc    Get single allocation details
 * @access  Private
 */
router.get('/:id', 
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Use utility function to fetch allocation details
    const result = await fetchAllocationDetails(id);

    if (!result.success) {
      return sendErrorResponse(res, 404, result.error);
    }

    return sendSuccessResponse(res, { allocation: result.data });
  })
);

/**
 * @route   PUT /api/allocations/:id/status
 * @desc    Update allocation status
 * @access  Private (Admin only)
 */
router.put('/:id/status', 
  authenticateToken,
  authorizeRoles('admin'),
  validateBody(routeSchemas.allocation.updateStatus),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, notes } = req.body;

    // Use utility function to update allocation status
    const result = await updateAllocationStatus(id, status, req.user.id, notes);

    if (!result.success) {
      return sendErrorResponse(res, 400, result.error);
    }

    return sendSuccessResponse(res, { allocation: result.data }, 'Allocation status updated successfully');
  })
);

/**
 * @route   GET /api/allocations/stats/overview
 * @desc    Get allocation statistics overview
 * @access  Private (Admin only)
 */
router.get('/stats/overview', 
  authenticateToken,
  authorizeRoles('admin'),
  asyncHandler(async (req, res) => {
    // Use utility function to get allocation statistics
    const result = await getAllocationStatistics(req.user);

    if (!result.success) {
      return handleDatabaseError(res, { message: result.error }, 'fetch statistics');
    }

    return sendSuccessResponse(res, result.data);
  })
);

/**
 * @route   POST /api/allocations/manual
 * @desc    Manually create a new allocation (Admin only)
 * @access  Private (Admin only)
 */
router.post('/manual', 
  authenticateToken,
  authorizeRoles('admin'),
  validateBody(routeSchemas.allocation.createAllocation),
  asyncHandler(async (req, res) => {
    // Validate allocation data using utility function
    const validationResult = validateAllocationData(req.body);
    if (!validationResult.success) {
      return sendErrorResponse(res, 400, validationResult.error);
    }

    // Use utility function to create allocation
    const result = await createAllocation(req.body, req.user.id);

    if (!result.success) {
      return handleDatabaseError(res, { message: result.error }, 'create allocation');
    }

    return sendSuccessResponse(res, { allocation: result.data }, 'Allocation created successfully', 201);
  })
);

/**
 * @route   POST /api/allocations/bulk
 * @desc    Bulk ingest allocations (API or file upload)
 * @access  Private (Admin only)
 */
router.post('/bulk', 
  authenticateToken, 
  authorizeRoles('admin'), 
  validateBody(routeSchemas.allocation.bulkCreate),
  asyncHandler(async (req, res) => {
    const { allocations } = req.body;

    // Fetch branch info for referential integrity
    const { data: branches, error: branchError } = await supabase
      .from('branch_information')
      .select('branch_name, branch_code, zone');
      
    if (branchError) {
      return handleDatabaseError(res, branchError, 'fetch branch info');
    }

    const results = [];
    for (const [i, alloc] of allocations.entries()) {
      // Validate allocation data using utility function
      const validationResult = validateAllocationData(alloc);
      if (!validationResult.success) {
        results.push({ index: i, status: 'failed', reason: validationResult.error });
        continue;
      }

      // Referential integrity: branch
      const branch = branches.find(b => b.branch_name === alloc.branch_name);
      if (!branch) {
        results.push({ index: i, status: 'failed', reason: 'Invalid branch_name' });
        continue;
      }

      // Use utility function to create allocation
      const result = await createAllocation({
        ...alloc,
        branch_name: branch.branch_name,
        zone: branch.zone
      }, req.user.id);

      if (!result.success) {
        results.push({ index: i, status: 'failed', reason: result.error });
        continue;
      }

      results.push({ index: i, status: 'success' });
    }

    const summary = {
      total: allocations.length,
      success: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length,
      details: results
    };

    return sendSuccessResponse(res, { summary });
  })
);

module.exports = router;