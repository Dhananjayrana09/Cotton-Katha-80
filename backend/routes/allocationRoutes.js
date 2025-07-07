/**
 * Allocation routes - Flow 2
 * Handles allocation listing and management
 */

const express = require('express');
const Joi = require('joi');
const { supabase } = require('../config/supabase');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { validateQuery } = require('../middleware/validation');

const router = express.Router();

// Validation schemas
const getAllocationsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  status: Joi.string().valid('pending', 'active', 'completed', 'cancelled'),
  branch_id: Joi.string().uuid(),
  search: Joi.string().max(100)
});

/**
 * @route   GET /api/allocations
 * @desc    Get list of allocations with pagination and filtering
 * @access  Private (All authenticated users)
 */
router.get('/', 
  authenticateToken, 
  validateQuery(getAllocationsSchema), 
  asyncHandler(async (req, res) => {
    const { page, limit, status, branch_id, search } = req.query;
    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from('allocation')
      .select(`
        *,
        branch_information:branch_id (
          branch_name,
          branch_code,
          zone
        ),
        parsed_data:parsed_data_id (
          firm_name,
          centre_name,
          variety,
          fibre_length
        )
      `, { count: 'exact' });

    // Apply filters
    if (status) {
      query = query.eq('allocation_status', status);
    }

    if (branch_id) {
      query = query.eq('branch_id', branch_id);
    }

    if (search) {
      query = query.or(`indent_number.ilike.%${search}%,branch_name.ilike.%${search}%`);
    }

    // Role-based filtering
    if (req.user.role === 'trader') {
      // Traders can only see their own allocations
      // This would require a created_by field in allocation table
      // For now, we'll show all allocations
    }

    // Add pagination and sorting
    const { data: allocations, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch allocations',
        error: error.message
      });
    }

    // Calculate pagination info
    const totalPages = Math.ceil(count / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    res.json({
      success: true,
      data: {
        allocations,
        pagination: {
          current_page: page,
          total_pages: totalPages,
          total_records: count,
          has_next: hasNext,
          has_previous: hasPrev,
          per_page: limit
        }
      }
    });
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

    const { data: allocation, error } = await supabase
      .from('allocation')
      .select(`
        *,
        branch_information:branch_id (
          branch_name,
          branch_code,
          zone,
          state,
          branch_email_id
        ),
        parsed_data:parsed_data_id (
          *
        ),
        procurement_dump (
          *
        )
      `)
      .eq('id', id)
      .single();

    if (error || !allocation) {
      return res.status(404).json({
        success: false,
        message: 'Allocation not found'
      });
    }

    res.json({
      success: true,
      data: {
        allocation
      }
    });
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
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['pending', 'active', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const { data: allocation, error } = await supabase
      .from('allocation')
      .update({
        allocation_status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update allocation status',
        error: error.message
      });
    }

    // Log the status change
    await supabase
      .from('audit_log')
      .insert({
        table_name: 'allocation',
        record_id: id,
        action: 'STATUS_UPDATE',
        user_id: req.user.id,
        old_values: { status: allocation.allocation_status },
        new_values: { status, notes }
      });

    res.json({
      success: true,
      message: 'Allocation status updated successfully',
      data: {
        allocation
      }
    });
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
    // Get allocation counts by status
    const { data: statusCounts, error: statusError } = await supabase
      .from('allocation')
      .select('allocation_status')
      .then(({ data, error }) => {
        if (error) return { data: null, error };
        
        const counts = data.reduce((acc, item) => {
          acc[item.allocation_status] = (acc[item.allocation_status] || 0) + 1;
          return acc;
        }, {});
        
        return { data: counts, error: null };
      });

    if (statusError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch statistics',
        error: statusError.message
      });
    }

    // Get total bale quantities
    const { data: totalBales, error: balesError } = await supabase
      .from('allocation')
      .select('bale_quantity')
      .then(({ data, error }) => {
        if (error) return { data: 0, error };
        
        const total = data.reduce((sum, item) => sum + (item.bale_quantity || 0), 0);
        return { data: total, error: null };
      });

    if (balesError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch bale statistics',
        error: balesError.message
      });
    }

    res.json({
      success: true,
      data: {
        status_counts: statusCounts,
        total_bales: totalBales,
        generated_at: new Date().toISOString()
      }
    });
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
  asyncHandler(async (req, res) => {
    const {
      indent_number,
      buyer_type,
      centre_name,
      variety,
      bale_quantity,
      crop_year,
      offer_price,
      bid_price,
      lifting_period,
      fibre_length,
      ccl_discount
    } = req.body;

    // Basic validation (could be extended with Joi)
    if (!indent_number || !buyer_type || !centre_name || !variety || !bale_quantity || !crop_year || !offer_price || !bid_price || !lifting_period || !fibre_length) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be provided.'
      });
    }

    // Insert allocation
    const { data: allocation, error } = await supabase
      .from('allocation')
      .insert({
        indent_number,
        buyer_type,
        centre_name,
        variety,
        bale_quantity,
        crop_year,
        offer_price,
        bid_price,
        lifting_period,
        fibre_length,
        ccl_discount,
        created_by: req.user.id,
        updated_by: req.user.id,
        allocation_status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create allocation',
        error: error.message
      });
    }

    // Log creation
    await supabase
      .from('audit_log')
      .insert({
        table_name: 'allocation',
        record_id: allocation.id,
        action: 'MANUAL_CREATE',
        user_id: req.user.id,
        new_values: allocation
      });

    res.status(201).json({
      success: true,
      message: 'Allocation created successfully',
      data: { allocation }
    });
  })
);

/**
 * @route   POST /api/allocations/bulk
 * @desc    Bulk ingest allocations (API or file upload)
 * @access  Private (Admin only)
 */
router.post('/bulk', authenticateToken, authorizeRoles('admin'), asyncHandler(async (req, res) => {
  const allocations = req.body.allocations;
  if (!Array.isArray(allocations) || allocations.length === 0) {
    return res.status(400).json({ message: 'No allocations provided' });
  }

  // Fetch branch info for referential integrity
  const { data: branches, error: branchError } = await supabase
    .from('branch_information')
    .select('branch_name, branch_code, zone');
  if (branchError) return res.status(500).json({ message: 'Failed to fetch branch info', error: branchError });

  const results = [];
  for (const [i, alloc] of allocations.entries()) {
    // Basic validation
    const requiredFields = [
      'indent_number', 'buyer_type', 'centre_name', 'variety', 'bale_quantity',
      'crop_year', 'offer_price', 'bid_price', 'lifting_period', 'fibre_length'
    ];
    const missing = requiredFields.filter(f => !alloc[f]);
    if (missing.length > 0) {
      results.push({ index: i, status: 'failed', reason: `Missing fields: ${missing.join(', ')}` });
      continue;
    }
    // Referential integrity: branch
    const branch = branches.find(b => b.branch_name === alloc.branch_name);
    if (!branch) {
      results.push({ index: i, status: 'failed', reason: 'Invalid branch_name' });
      continue;
    }
    // Insert allocation
    const { error: insertError } = await supabase
      .from('allocation')
      .insert([
        {
          ...alloc,
          branch_name: branch.branch_name,
          zone: branch.zone,
          created_by: req.user.id,
          updated_by: req.user.id
        }
      ]);
    if (insertError) {
      results.push({ index: i, status: 'failed', reason: insertError.message });
      continue;
    }
    results.push({ index: i, status: 'success' });
  }
  res.json({ summary: {
    total: allocations.length,
    success: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'failed').length,
    details: results
  }});
}));

module.exports = router;