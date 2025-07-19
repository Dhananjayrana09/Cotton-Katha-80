/**
 * Dashboard routes
 * Provides overview statistics and data for admin dashboard
 */

const express = require('express');
const { supabase } = require('../config/supabase');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

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
    try {
      // Get counts for various entities
      const [
        allocationsCount,
        procurementCount,
        paymentsCount,
        contractsCount,
        inventoryCount,
        salesCount,
        customersCount
      ] = await Promise.all([
        supabase.from('allocation').select('*', { count: 'exact', head: true }),
        supabase.from('procurement_dump').select('*', { count: 'exact', head: true }),
        supabase.from('payments').select('*', { count: 'exact', head: true }),
        supabase.from('purchase_contract_table').select('*', { count: 'exact', head: true }),
        supabase.from('inventory_table').select('*', { count: 'exact', head: true }),
        supabase.from('sales_table').select('*', { count: 'exact', head: true }),
        supabase.from('customer_info').select('*', { count: 'exact', head: true })
      ]);

      // Get status-wise breakdowns
      const { data: allocationsByStatus } = await supabase
        .from('allocation')
        .select('allocation_status')
        .then(({ data, error }) => {
          if (error) return { data: {} };
          return {
            data: data.reduce((acc, item) => {
              acc[item.allocation_status] = (acc[item.allocation_status] || 0) + 1;
              return acc;
            }, {})
          };
        });

      const { data: paymentsByStatus } = await supabase
        .from('payments')
        .select('payment_status')
        .then(({ data, error }) => {
          if (error) return { data: {} };
          return {
            data: data.reduce((acc, item) => {
              acc[item.payment_status] = (acc[item.payment_status] || 0) + 1;
              return acc;
            }, {})
          };
        });

      const { data: inventoryByStatus } = await supabase
        .from('inventory_table')
        .select('status')
        .then(({ data, error }) => {
          if (error) return { data: {} };
          return {
            data: data.reduce((acc, item) => {
              acc[item.status] = (acc[item.status] || 0) + 1;
              return acc;
            }, {})
          };
        });

      // Get recent activities
      const { data: recentActivities } = await supabase
        .from('audit_log')
        .select(`
          *,
          users:user_id (
            first_name,
            last_name
          )
        `)
        .order('created_at', { ascending: false })
        .limit(10);

      // Calculate financial summary
      const { data: financialSummary } = await supabase
        .from('procurement_dump')
        .select('total_amount, emd_amount, gst_amount')
        .then(({ data, error }) => {
          if (error) return { data: { total_value: 0, total_emd: 0, total_gst: 0 } };
          
          const summary = data.reduce((acc, item) => {
            acc.total_value += item.total_amount || 0;
            acc.total_emd += item.emd_amount || 0;
            acc.total_gst += item.gst_amount || 0;
            return acc;
          }, { total_value: 0, total_emd: 0, total_gst: 0 });
          
          return { data: summary };
        });

      res.json({
        success: true,
        data: {
          overview: {
            total_allocations: allocationsCount.count || 0,
            total_procurements: procurementCount.count || 0,
            total_payments: paymentsCount.count || 0,
            total_contracts: contractsCount.count || 0,
            total_inventory: inventoryCount.count || 0,
            total_sales: salesCount.count || 0,
            total_customers: customersCount.count || 0
          },
          status_breakdowns: {
            allocations: allocationsByStatus,
            payments: paymentsByStatus,
            inventory: inventoryByStatus
          },
          financial_summary: financialSummary,
          recent_activities: recentActivities || [],
          generated_at: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Dashboard overview error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch dashboard overview',
        error: error.message
      });
    }
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
    try {
      // Get monthly allocation trends
      const { data: monthlyAllocations } = await supabase
        .from('allocation')
        .select('created_at, bale_quantity')
        .order('created_at', { ascending: true })
        .then(({ data, error }) => {
          if (error) return { data: [] };
          
          const monthlyData = {};
          data.forEach(item => {
            const month = item.created_at.substring(0, 7); // YYYY-MM
            if (!monthlyData[month]) {
              monthlyData[month] = { count: 0, bales: 0 };
            }
            monthlyData[month].count += 1;
            monthlyData[month].bales += item.bale_quantity || 0;
          });
          
          return {
            data: Object.entries(monthlyData).map(([month, values]) => ({
              month,
              allocations: values.count,
              bales: values.bales
            }))
          };
        });

      // Get payment status distribution
      const { data: paymentDistribution } = await supabase
        .from('payments')
        .select('payment_status, amount')
        .then(({ data, error }) => {
          if (error) return { data: [] };
          
          const distribution = {};
          data.forEach(item => {
            if (!distribution[item.payment_status]) {
              distribution[item.payment_status] = { count: 0, amount: 0 };
            }
            distribution[item.payment_status].count += 1;
            distribution[item.payment_status].amount += item.amount || 0;
          });
          
          return {
            data: Object.entries(distribution).map(([status, values]) => ({
              status,
              count: values.count,
              amount: values.amount
            }))
          };
        });

      // Get top branches by volume
      const { data: branchPerformance } = await supabase
        .from('allocation')
        .select(`
          branch_name,
          bale_quantity,
          branch_information:branch_id (
            branch_name,
            zone
          )
        `)
        .then(({ data, error }) => {
          if (error) return { data: [] };
          
          const branchData = {};
          data.forEach(item => {
            const branchName = item.branch_name || 'Unknown';
            if (!branchData[branchName]) {
              branchData[branchName] = { 
                total_bales: 0, 
                allocations: 0,
                zone: item.branch_information?.zone || 'Unknown'
              };
            }
            branchData[branchName].total_bales += item.bale_quantity || 0;
            branchData[branchName].allocations += 1;
          });
          
          return {
            data: Object.entries(branchData)
              .map(([branch, values]) => ({
                branch_name: branch,
                total_bales: values.total_bales,
                allocations: values.allocations,
                zone: values.zone
              }))
              .sort((a, b) => b.total_bales - a.total_bales)
              .slice(0, 10)
          };
        });

      res.json({
        success: true,
        data: {
          monthly_allocations: monthlyAllocations,
          payment_distribution: paymentDistribution,
          branch_performance: branchPerformance,
          generated_at: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Dashboard charts error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch dashboard chart data',
        error: error.message
      });
    }
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

      res.json({
        success: true,
        data: {
          alerts,
          total_alerts: alerts.length,
          generated_at: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Dashboard alerts error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch dashboard alerts',
        error: error.message
      });
    }
  })
);

/**
 * @route   GET /api/logs
 * @desc    Get paginated audit logs (all tables)
 * @access  Private (Admin only)
 */
router.get('/logs', 
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
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch logs',
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
  if (error) return res.status(500).json({ message: 'Failed to fetch branch info', error });
  res.json({ data });
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
  res.json({ data: config });
}));

module.exports = router;