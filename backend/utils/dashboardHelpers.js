/**
 * Dashboard-specific utility functions
 * Extracted from dashboardRoutes.js to reduce code duplication and improve maintainability
 */

const { supabase } = require('../config/supabase');
const { sendErrorResponse, sendSuccessResponse, handleDatabaseError } = require('./databaseHelpers');

/**
 * Get entity counts for dashboard overview
 * @returns {Object} Entity counts
 */
async function getEntityCounts() {
  try {
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

    return {
      success: true,
      data: {
        total_allocations: allocationsCount.count || 0,
        total_procurements: procurementCount.count || 0,
        total_payments: paymentsCount.count || 0,
        total_contracts: contractsCount.count || 0,
        total_inventory: inventoryCount.count || 0,
        total_sales: salesCount.count || 0,
        total_customers: customersCount.count || 0
      }
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to get entity counts: ${error.message}` 
    };
  }
}

/**
 * Get status breakdowns for various entities
 * @returns {Object} Status breakdowns
 */
async function getStatusBreakdowns() {
  try {
    const [allocationsByStatus, paymentsByStatus, inventoryByStatus] = await Promise.all([
      supabase
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
        }),
      supabase
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
        }),
      supabase
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
        })
    ]);

    return {
      success: true,
      data: {
        allocations: allocationsByStatus.data,
        payments: paymentsByStatus.data,
        inventory: inventoryByStatus.data
      }
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to get status breakdowns: ${error.message}` 
    };
  }
}

/**
 * Get recent activities for dashboard
 * @param {number} limit - Number of activities to fetch
 * @returns {Object} Recent activities
 */
async function getRecentActivities(limit = 10) {
  try {
    const { data: recentActivities, error } = await supabase
      .from('audit_log')
      .select(`
        *,
        users:user_id (
          first_name,
          last_name
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return { 
        success: false, 
        error: `Failed to fetch recent activities: ${error.message}` 
      };
    }

    return { 
      success: true, 
      data: recentActivities || [] 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to get recent activities: ${error.message}` 
    };
  }
}

/**
 * Calculate financial summary from procurement data
 * @returns {Object} Financial summary
 */
async function getFinancialSummary() {
  try {
    const { data, error } = await supabase
      .from('procurement_dump')
      .select('total_amount, emd_amount, gst_amount');

    if (error) {
      return { 
        success: false, 
        error: `Failed to fetch financial data: ${error.message}` 
      };
    }

    const summary = data.reduce((acc, item) => {
      acc.total_value += item.total_amount || 0;
      acc.total_emd += item.emd_amount || 0;
      acc.total_gst += item.gst_amount || 0;
      return acc;
    }, { total_value: 0, total_emd: 0, total_gst: 0 });

    return { 
      success: true, 
      data: summary 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to calculate financial summary: ${error.message}` 
    };
  }
}

/**
 * Get dashboard overview statistics
 * @returns {Object} Dashboard overview data
 */
async function getDashboardOverview() {
  try {
    const [entityCounts, statusBreakdowns, recentActivities, financialSummary] = await Promise.all([
      getEntityCounts(),
      getStatusBreakdowns(),
      getRecentActivities(),
      getFinancialSummary()
    ]);

    if (!entityCounts.success) {
      return entityCounts;
    }

    if (!statusBreakdowns.success) {
      return statusBreakdowns;
    }

    if (!recentActivities.success) {
      return recentActivities;
    }

    if (!financialSummary.success) {
      return financialSummary;
    }

    return {
      success: true,
      data: {
        overview: entityCounts.data,
        status_breakdowns: statusBreakdowns.data,
        financial_summary: financialSummary.data,
        recent_activities: recentActivities.data,
        generated_at: new Date().toISOString()
      }
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to get dashboard overview: ${error.message}` 
    };
  }
}

/**
 * Get monthly allocation trends for charts
 * @returns {Object} Monthly allocation data
 */
async function getMonthlyAllocationTrends() {
  try {
    const { data, error } = await supabase
      .from('allocation')
      .select('created_at, bale_quantity')
      .order('created_at', { ascending: true });

    if (error) {
      return { 
        success: false, 
        error: `Failed to fetch allocation data: ${error.message}` 
      };
    }

    const monthlyData = {};
    data.forEach(item => {
      const month = item.created_at.substring(0, 7); // YYYY-MM
      if (!monthlyData[month]) {
        monthlyData[month] = { count: 0, bales: 0 };
      }
      monthlyData[month].count += 1;
      monthlyData[month].bales += item.bale_quantity || 0;
    });

    const monthlyTrends = Object.entries(monthlyData).map(([month, values]) => ({
      month,
      allocations: values.count,
      bales: values.bales
    }));

    return { 
      success: true, 
      data: monthlyTrends 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to get monthly allocation trends: ${error.message}` 
    };
  }
}

/**
 * Get payment status distribution for charts
 * @returns {Object} Payment distribution data
 */
async function getPaymentStatusDistribution() {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('payment_status, amount');

    if (error) {
      return { 
        success: false, 
        error: `Failed to fetch payment data: ${error.message}` 
      };
    }

    const distribution = {};
    data.forEach(item => {
      if (!distribution[item.payment_status]) {
        distribution[item.payment_status] = { count: 0, amount: 0 };
      }
      distribution[item.payment_status].count += 1;
      distribution[item.payment_status].amount += item.amount || 0;
    });

    const paymentDistribution = Object.entries(distribution).map(([status, values]) => ({
      status,
      count: values.count,
      amount: values.amount
    }));

    return { 
      success: true, 
      data: paymentDistribution 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to get payment distribution: ${error.message}` 
    };
  }
}

/**
 * Get inventory status distribution for charts
 * @returns {Object} Inventory distribution data
 */
async function getInventoryStatusDistribution() {
  try {
    const { data, error } = await supabase
      .from('inventory_table')
      .select('status, quantity');

    if (error) {
      return { 
        success: false, 
        error: `Failed to fetch inventory data: ${error.message}` 
      };
    }

    const distribution = {};
    data.forEach(item => {
      if (!distribution[item.status]) {
        distribution[item.status] = { count: 0, quantity: 0 };
      }
      distribution[item.status].count += 1;
      distribution[item.status].quantity += item.quantity || 0;
    });

    const inventoryDistribution = Object.entries(distribution).map(([status, values]) => ({
      status,
      count: values.count,
      quantity: values.quantity
    }));

    return { 
      success: true, 
      data: inventoryDistribution 
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to get inventory distribution: ${error.message}` 
    };
  }
}

/**
 * Get chart data for dashboard
 * @returns {Object} Chart data
 */
async function getDashboardCharts() {
  try {
    const [monthlyAllocations, paymentDistribution, inventoryDistribution] = await Promise.all([
      getMonthlyAllocationTrends(),
      getPaymentStatusDistribution(),
      getInventoryStatusDistribution()
    ]);

    if (!monthlyAllocations.success) {
      return monthlyAllocations;
    }

    if (!paymentDistribution.success) {
      return paymentDistribution;
    }

    if (!inventoryDistribution.success) {
      return inventoryDistribution;
    }

    return {
      success: true,
      data: {
        monthly_allocations: monthlyAllocations.data,
        payment_distribution: paymentDistribution.data,
        inventory_distribution: inventoryDistribution.data,
        generated_at: new Date().toISOString()
      }
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to get chart data: ${error.message}` 
    };
  }
}

/**
 * Get performance metrics for dashboard
 * @returns {Object} Performance metrics
 */
async function getPerformanceMetrics() {
  try {
    // Get completion rates
    const { data: allocationCompletion } = await supabase
      .from('allocation')
      .select('allocation_status')
      .then(({ data, error }) => {
        if (error) return { data: { completed: 0, total: 0 } };
        const total = data.length;
        const completed = data.filter(item => item.allocation_status === 'completed').length;
        return { data: { completed, total, rate: total > 0 ? (completed / total * 100).toFixed(2) : 0 } };
      });

    const { data: paymentCompletion } = await supabase
      .from('payments')
      .select('payment_status')
      .then(({ data, error }) => {
        if (error) return { data: { completed: 0, total: 0 } };
        const total = data.length;
        const completed = data.filter(item => item.payment_status === 'verified').length;
        return { data: { completed, total, rate: total > 0 ? (completed / total * 100).toFixed(2) : 0 } };
      });

    // Get average processing times
    const { data: avgProcessingTime } = await supabase
      .from('allocation')
      .select('created_at, updated_at, allocation_status')
      .eq('allocation_status', 'completed')
      .then(({ data, error }) => {
        if (error || !data.length) return { data: 0 };
        
        const totalTime = data.reduce((sum, item) => {
          const created = new Date(item.created_at);
          const updated = new Date(item.updated_at);
          return sum + (updated - created);
        }, 0);
        
        return { data: Math.round(totalTime / data.length / (1000 * 60 * 60 * 24)) }; // Days
      });

    return {
      success: true,
      data: {
        allocation_completion: allocationCompletion.data,
        payment_completion: paymentCompletion.data,
        avg_processing_time_days: avgProcessingTime.data,
        generated_at: new Date().toISOString()
      }
    };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to get performance metrics: ${error.message}` 
    };
  }
}

module.exports = {
  getEntityCounts,
  getStatusBreakdowns,
  getRecentActivities,
  getFinancialSummary,
  getDashboardOverview,
  getMonthlyAllocationTrends,
  getPaymentStatusDistribution,
  getInventoryStatusDistribution,
  getDashboardCharts,
  getPerformanceMetrics
}; 