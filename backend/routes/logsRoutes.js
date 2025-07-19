/**
 * Logs routes
 * Handles audit log retrieval and filtering
 */

const express = require('express');
const { supabase } = require('../config/supabase');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { sendErrorResponse, sendSuccessResponse, handleDatabaseError } = require('../utils/databaseHelpers');

const router = express.Router();

/**
 * @route   GET /api/logs
 * @desc    Get paginated audit logs (all tables)
 * @access  Private (Admin only)
 */
router.get('/', 
  authenticateToken,
  authorizeRoles('admin'),
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const { table_name, action, user_id, search } = req.query;

    let query = supabase
      .from('audit_log')
      .select(`*, users:user_id (first_name, last_name, email)`, { count: 'exact' })
      .order('created_at', { ascending: false });

    if (table_name) query = query.eq('table_name', table_name);
    if (action) query = query.eq('action', action);
    if (user_id) query = query.eq('user_id', user_id);
    if (search) query = query.ilike('new_values', `%${search}%`);

    const { data: logs, error, count } = await query.range(offset, offset + limit - 1);

    if (error) {
      return handleDatabaseError(res, error, 'fetch logs');
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

/**
 * @route   GET /api/logs/table/:tableName
 * @desc    Get logs for a specific table
 * @access  Private (Admin only)
 */
router.get('/table/:tableName', 
  authenticateToken,
  authorizeRoles('admin'),
  asyncHandler(async (req, res) => {
    const { tableName } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const { data: logs, error, count } = await supabase
      .from('audit_log')
      .select(`*, users:user_id (first_name, last_name, email)`, { count: 'exact' })
      .eq('table_name', tableName)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return handleDatabaseError(res, error, 'fetch table logs');
    }

    const totalPages = Math.ceil(count / limit);

    return sendSuccessResponse(res, {
      logs: logs || [],
      table_name: tableName,
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

/**
 * @route   GET /api/logs/action/:action
 * @desc    Get logs for a specific action
 * @access  Private (Admin only)
 */
router.get('/action/:action', 
  authenticateToken,
  authorizeRoles('admin'),
  asyncHandler(async (req, res) => {
    const { action } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const { data: logs, error, count } = await supabase
      .from('audit_log')
      .select(`*, users:user_id (first_name, last_name, email)`, { count: 'exact' })
      .eq('action', action)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return handleDatabaseError(res, error, 'fetch action logs');
    }

    const totalPages = Math.ceil(count / limit);

    return sendSuccessResponse(res, {
      logs: logs || [],
      action: action,
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

/**
 * @route   GET /api/logs/stats
 * @desc    Get log statistics
 * @access  Private (Admin only)
 */
router.get('/stats', 
  authenticateToken,
  authorizeRoles('admin'),
  asyncHandler(async (req, res) => {
    try {
      // Get total logs count
      const { count: totalLogs } = await supabase
        .from('audit_log')
        .select('*', { count: 'exact', head: true });

      // Get logs by table
      const { data: tableStats } = await supabase
        .from('audit_log')
        .select('table_name')
        .then(({ data, error }) => {
          if (error) return { data: [] };
          const stats = data.reduce((acc, log) => {
            acc[log.table_name] = (acc[log.table_name] || 0) + 1;
            return acc;
          }, {});
          return { data: stats };
        });

      // Get logs by action
      const { data: actionStats } = await supabase
        .from('audit_log')
        .select('action')
        .then(({ data, error }) => {
          if (error) return { data: [] };
          const stats = data.reduce((acc, log) => {
            acc[log.action] = (acc[log.action] || 0) + 1;
            return acc;
          }, {});
          return { data: stats };
        });

      // Get recent activity (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: recentActivity } = await supabase
        .from('audit_log')
        .select('created_at')
        .gte('created_at', sevenDaysAgo.toISOString())
        .then(({ data, error }) => {
          if (error) return { data: 0 };
          return { data: data.length };
        });

      return sendSuccessResponse(res, {
        total_logs: totalLogs,
        table_stats: tableStats,
        action_stats: actionStats,
        recent_activity: recentActivity,
        generated_at: new Date().toISOString()
      });
    } catch (error) {
      return handleDatabaseError(res, { message: error.message }, 'fetch log statistics');
    }
  })
);

module.exports = router; 