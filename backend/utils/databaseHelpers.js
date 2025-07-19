/**
 * Database helper utilities
 * Common database operations and query patterns used across routes
 */

const { supabase } = require('../config/supabase');

/**
 * Common select patterns for related data
 */
const selectPatterns = {
  // Customer info with basic fields
  customerBasic: `
    customer_info:customer_id (
      customer_name,
      customer_code,
      email,
      state
    )
  `,
  
  // Customer info with all fields
  customerFull: `
    customer_info:customer_id (*)
  `,
  
  // Branch information with basic fields
  branchBasic: `
    branch_information:branch_id (
      branch_name,
      branch_code,
      zone,
      state
    )
  `,
  
  // Branch information with all fields
  branchFull: `
    branch_information:branch_id (*)
  `,
  
  // Broker info with basic fields
  brokerBasic: `
    broker_info:broker_id (
      broker_name,
      broker_code,
      commission_rate
    )
  `,
  
  // Broker info with all fields
  brokerFull: `
    broker_info:broker_id (*)
  `,
  
  // User info with basic fields
  userBasic: `
    created_user:created_by (
      first_name,
      last_name
    )
  `,
  
  // User info with all fields
  userFull: `
    created_user:created_by (*)
  `,
  
  // Sales configuration with basic fields
  salesConfigBasic: `
    sales_configuration:sales_config_id (
      id,
      status,
      created_at
    )
  `,
  
  // Sales configuration with all fields
  salesConfigFull: `
    sales_configuration:sales_config_id (*)
  `,
  
  // Inventory with basic fields for sales
  inventorySalesBasic: `
    inventory_table:inventory_id (
      lot_number,
      indent_number,
      centre_name,
      branch,
      variety,
      fibre_length,
      bid_price,
      status
    )
  `,
  
  // Customer assignment with basic fields
  assignmentBasic: `
    customer_assignment_table:assignment_id (
      id,
      lot_status,
      assigned_at,
      window_end_date
    )
  `,
  
  // Customer assignment with all fields
  assignmentFull: `
    customer_assignment_table:assignment_id (*)
  `
};

/**
 * Build a select query with common patterns
 * @param {string} baseSelect - Base select statement
 * @param {string[]} patterns - Array of pattern names to include
 * @returns {string} Complete select statement
 */
function buildSelectQuery(baseSelect, patterns = []) {
  const patternStrings = patterns.map(pattern => selectPatterns[pattern]).filter(Boolean);
  return `${baseSelect}${patternStrings.length > 0 ? ',\n' + patternStrings.join(',\n') : ''}`;
}

/**
 * Common error response helper
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {string} error - Error details
 * @param {boolean} success - Success flag (default: false)
 */
function sendErrorResponse(res, statusCode, message, error = null, success = false) {
  const response = {
    success,
    message
  };
  
  if (error) {
    response.error = error;
  }
  
  return res.status(statusCode).json(response);
}

/**
 * Common success response helper
 * @param {Object} res - Express response object
 * @param {Object} data - Response data
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code (default: 200)
 */
function sendSuccessResponse(res, data, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
}

/**
 * Handle database errors consistently
 * @param {Object} res - Express response object
 * @param {Object} error - Database error object
 * @param {string} operation - Operation being performed
 * @param {number} statusCode - HTTP status code (default: 500)
 */
function handleDatabaseError(res, error, operation, statusCode = 500) {
  console.error(`Database error in ${operation}:`, error);
  return sendErrorResponse(
    res, 
    statusCode, 
    `Failed to ${operation}`, 
    error.message
  );
}

/**
 * Check if record exists and handle not found
 * @param {Object} res - Express response object
 * @param {Object} data - Database result data
 * @param {Object} error - Database error
 * @param {string} recordType - Type of record (e.g., 'allocation', 'customer')
 * @returns {boolean} True if record exists, false if not found
 */
function checkRecordExists(res, data, error, recordType) {
  if (error || !data) {
    sendErrorResponse(res, 404, `${recordType} not found`);
    return false;
  }
  return true;
}

/**
 * Create pagination metadata
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @param {number} count - Total count
 * @returns {Object} Pagination metadata
 */
function createPaginationMeta(page, limit, count) {
  const totalPages = Math.ceil(count / limit);
  return {
    current_page: page,
    total_pages: totalPages,
    total_records: count,
    has_next: page < totalPages,
    has_previous: page > 1,
    per_page: limit
  };
}

/**
 * Apply role-based filtering to query
 * @param {Object} query - Supabase query object
 * @param {Object} user - User object from request
 * @param {string} field - Field to filter on (default: 'created_by')
 * @returns {Object} Modified query
 */
function applyRoleFilter(query, user, field = 'created_by') {
  if (user.role === 'trader') {
    return query.eq(field, user.id);
  }
  return query;
}

/**
 * Common validation for UUID parameters
 * @param {string} uuid - UUID string to validate
 * @returns {boolean} True if valid UUID
 */
function isValidUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

module.exports = {
  selectPatterns,
  buildSelectQuery,
  sendErrorResponse,
  sendSuccessResponse,
  handleDatabaseError,
  checkRecordExists,
  createPaginationMeta,
  applyRoleFilter,
  isValidUUID
}; 