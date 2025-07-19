/**
 * Dashboard routes
 * Provides overview statistics and data for admin dashboard
 */

const express = require('express');
const { supabase } = require('../config/supabase');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { sendErrorResponse, sendSuccessResponse, handleDatabaseError } = require('../utils/databaseHelpers');
const {
  getDashboardOverview,
  getDashboardCharts,
  getPerformanceMetrics
} = require('../utils/dashboardHelpers');

const router = express.Router();

/**
 * @route   GET /api/dashboard/overview
 * @desc    Get dashboard overview statistics
 * @access  Private (Admin only)
 */
router.get('/overview', 
  authenticateToken,
  authorizeRoles('admin'),
  asyncHandler(async (req, res) => {
    // Use utility function to get dashboard overview
    const result = await getDashboardOverview();

    if (!result.success) {
      return handleDatabaseError(res, { message: result.error }, 'fetch dashboard overview');
    }

    return sendSuccessResponse(res, result.data);
  })
);

/**
 * @route   GET /api/dashboard/charts
 * @desc    Get chart data for dashboard
 * @access  Private (Admin only)
 */
router.get('/charts', 
  authenticateToken,
  authorizeRoles('admin'),
  asyncHandler(async (req, res) => {
    // Use utility function to get dashboard charts
    const result = await getDashboardCharts();

    if (!result.success) {
      return handleDatabaseError(res, { message: result.error }, 'fetch dashboard charts');
    }

    return sendSuccessResponse(res, result.data);
  })
);

/**
 * @route   GET /api/dashboard/alerts
 * @desc    Get system alerts and notifications
 * @access  Private (Admin only)
 */
router.get('/alerts', 
  authenticateToken,
  authorizeRoles('admin'),
  asyncHandler(async (req, res) => {
    try {
      const alerts = [];

      // Check for overdue payments
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      
      const { data: overduePayments } = await supabase
        .from('payments')
        .select('id, amount, due_date')
        .is('utr_number', null)
        .lt('due_date', threeDaysAgo.toISOString().split('T')[0]);

      if (overduePayments && overduePayments.length > 0) {
        alerts.push({
          type: 'warning',
          title: 'Overdue Payments',
          message: `${overduePayments.length} payments are overdue`,
          count: overduePayments.length,
          action_url: '/utr/pending'
        });
      }

      // Check for pending manual applications
      const { data: manualApps } = await supabase
        .from('manual_applications')
        .select('id')
        .eq('status', 'pending');

      if (manualApps && manualApps.length > 0) {
        alerts.push({
          type: 'info',
          title: 'Manual Review Required',
          message: `${manualApps.length} applications need manual review`,
          count: manualApps.length,
          action_url: '/admin/manual-applications'
        });
      }

      // Check for pending contract approvals
      const { data: pendingContracts } = await supabase
        .from('purchase_contract_table')
        .select('id')
        .eq('status', 'pending');

      if (pendingContracts && pendingContracts.length > 0) {
        alerts.push({
          type: 'info',
          title: 'Contracts Pending Approval',
          message: `${pendingContracts.length} contracts await approval`,
          count: pendingContracts.length,
          action_url: '/admin/contracts'
        });
      }

      // Check for low inventory
      const { data: inventoryCount } = await supabase
        .from('inventory_table')
        .select('status')
        .eq('status', 'AVAILABLE')
        .then(({ data, error }) => {
          if (error) return { data: 0 };
          return { data: data.length };
        });

      if (inventoryCount.data < 100) {
        alerts.push({
          type: 'warning',
          title: 'Low Inventory',
          message: `Only ${inventoryCount.data} lots available`,
          count: inventoryCount.data,
          action_url: '/sampling-entry'
        });
      }

      return sendSuccessResponse(res, {
        alerts,
        total_alerts: alerts.length,
        generated_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Dashboard alerts error:', error);
      return handleDatabaseError(res, { message: error.message }, 'fetch dashboard alerts');
    }
  })
);



/**
 * @route   GET /api/branch-info
 * @desc    Get all branches, zones, and candy rates (for LOVs and calculations)
 * @access  Private (Admin/Trader)
 */
router.get('/branch-info', authenticateToken, asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('branch_information')
    .select('*')
    .order('branch_name', { ascending: true });
  
  if (error) {
    return handleDatabaseError(res, error, 'fetch branch info');
  }
  
  return sendSuccessResponse(res, { data });
}));

/**
 * @route   GET /api/procurement/config
 * @desc    Get procurement config (multipliers, rates, etc.)
 * @access  Private (Admin/Trader)
 */
router.get('/procurement/config', authenticateToken, asyncHandler(async (req, res) => {
  // For now, return hardcoded config. Replace with DB fetch if needed.
  const config = {
    bale_weight: 170, // kg
    cotton_value_multiplier: 1,
    emd_percentage_threshold: 3000, // Fixed: Changed from 2000 to 3000
    emd_percentage_low: 15, // Fixed: Changed from 10 to 15
    emd_percentage_high: 25, // Fixed: Changed from 20 to 25
    gst_same_state: { cgst: 2.5, sgst: 2.5 }, // Fixed: Changed from 9 to 2.5
    gst_diff_state: { igst: 5 }, // Fixed: Changed from 18 to 5
    emd_due_days: 5
  };
  
  return sendSuccessResponse(res, { data: config });
}));

module.exports = router;