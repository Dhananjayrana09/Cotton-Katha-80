const express = require('express');
const { supabase } = require('../config/supabase');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateToken } = require('../middleware/auth');
const { validateBody } = require('../middleware/validation');
const { routeSchemas } = require('../utils/validationSchemas');
const { sendErrorResponse, sendSuccessResponse, handleDatabaseError } = require('../utils/databaseHelpers');
const {
  saveDOSpecification,
  getDOSpecifications,
  getDOSpecificationById,
  getDOSpecificationsHistory
} = require('../utils/doSpecificationsHelpers');

const router = express.Router();

// Calculation logic moved to doSpecificationsHelpers.js

// POST /api/do-specifications
router.post('/', 
  authenticateToken, 
  validateBody(routeSchemas.doSpecifications.doSpec), 
  asyncHandler(async (req, res) => {
    // Use utility function to save DO Specification
    const result = await saveDOSpecification(req.body, req.user.id);

    if (!result.success) {
      return handleDatabaseError(res, { message: result.error }, 'save DO Specification');
    }

    return sendSuccessResponse(res, result.data, 'DO Specification saved successfully', 201);
  })
);

// GET /api/do-specifications (list all for user, with pagination)
router.get('/', 
  authenticateToken, 
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 10 } = req.query;

    // Use utility function to get DO Specifications
    const result = await getDOSpecifications(req.user.id, parseInt(page), parseInt(limit));

    if (!result.success) {
      return handleDatabaseError(res, { message: result.error }, 'fetch DO Specifications');
    }

    return sendSuccessResponse(res, result.data);
  })
);

// GET /api/do-specifications/:id
router.get('/:id', 
  authenticateToken, 
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Use utility function to get DO Specification by ID
    const result = await getDOSpecificationById(id, req.user.id);

    if (!result.success) {
      if (result.error.includes('not found')) {
        return sendErrorResponse(res, 404, result.error);
      }
      return handleDatabaseError(res, { message: result.error }, 'fetch DO Specification');
    }

    return sendSuccessResponse(res, result.data);
  })
);

module.exports = router; 