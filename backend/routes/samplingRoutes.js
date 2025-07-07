/**
 * Sampling routes - Flow 4
 * Handles sampling entry and lot number management
 */

const express = require('express');
const Joi = require('joi');
const { supabase } = require('../config/supabase');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateToken } = require('../middleware/auth');
const { validateQuery, validateBody } = require('../middleware/validation');

const router = express.Router();

// Validation schemas
const fetchIndentSchema = Joi.object({
  indent_number: Joi.string().required()
});

const saveSamplingSchema = Joi.object({
  indent_number: Joi.string().required(),
  lots: Joi.array().items(Joi.string().min(1)).min(1).required()
});

/**
 * @route   GET /api/sampling/fetch-indent
 * @desc    Fetch indent details for sampling entry
 * @access  Private
 */
router.get('/fetch-indent', 
  authenticateToken,
  validateQuery(fetchIndentSchema),
  asyncHandler(async (req, res) => {
    const { indent_number } = req.query;

    const { data: allocation, error } = await supabase
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
      `)
      .eq('indent_number', indent_number)
      .single();

    if (error || !allocation) {
      return res.status(404).json({
        success: false,
        message: 'Indent not found'
      });
    }

    // Calculate total number of lots needed
    const balesQuantity = allocation.bale_quantity;
    const base = Math.floor(balesQuantity / 100);
    const extra = Math.floor(base * 0.2);
    const totalLots = base + (extra < 1 ? 0 : extra);

    // Check if sampling already exists
    const { data: existingLots, error: lotsError } = await supabase
      .from('inventory_table')
      .select('lot_number')
      .eq('indent_number', indent_number);

    if (lotsError) {
      console.error('Error fetching existing lots:', lotsError);
    }

    const response = {
      indent_details: {
        indent_number: allocation.indent_number,
        bales_quantity: allocation.bale_quantity,
        centre_name: allocation.parsed_data?.centre_name || 'Unknown',
        branch: allocation.branch_information?.branch_name || 'Unknown',
        date: allocation.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
        lifting_period: allocation.lifting_period,
        fibre_length: allocation.parsed_data?.fibre_length || 'Unknown',
        variety: allocation.parsed_data?.variety || 'Unknown',
        bid_price: allocation.otr_price || 0,
        firm_name: allocation.parsed_data?.firm_name || 'Unknown'
      },
      calculated_lots: {
        base_lots: base,
        extra_lots: extra < 1 ? 0 : extra,
        total_lots: totalLots
      },
      existing_lots: existingLots || [],
      sampling_completed: (existingLots && existingLots.length > 0)
    };

    res.json({
      success: true,
      data: response
    });
  })
);

/**
 * @route   POST /api/sampling/save
 * @desc    Save sampling entries to inventory table
 * @access  Private
 */
router.post('/save', 
  authenticateToken,
  validateBody(saveSamplingSchema),
  asyncHandler(async (req, res) => {
    const { indent_number, lots } = req.body;

    // Fetch allocation details first
    const { data: allocation, error: allocationError } = await supabase
      .from('allocation')
      .select(`
        *,
        branch_information:branch_id (
          id,
          branch_name,
          branch_code
        ),
        parsed_data:parsed_data_id (
          centre_name,
          variety,
          fibre_length
        )
      `)
      .eq('indent_number', indent_number)
      .single();

    if (allocationError || !allocation) {
      return res.status(404).json({
        success: false,
        message: 'Allocation not found for the given indent number'
      });
    }

    // Check if sampling already exists
    const { data: existingLots } = await supabase
      .from('inventory_table')
      .select('lot_number')
      .eq('indent_number', indent_number);

    if (existingLots && existingLots.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Sampling already completed for this indent number'
      });
    }

    // Validate lot numbers are unique
    const uniqueLots = [...new Set(lots)];
    if (uniqueLots.length !== lots.length) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate lot numbers found'
      });
    }

    // Prepare inventory entries
    const inventoryEntries = lots.map(lotNumber => ({
      indent_number,
      lot_number: lotNumber,
      centre_name: allocation.parsed_data?.centre_name || 'Unknown',
      branch: allocation.branch_information?.branch_name || 'Unknown',
      branch_id: allocation.branch_information?.id || null,
      date: new Date().toISOString().split('T')[0],
      lifting_period: allocation.lifting_period,
      fibre_length: allocation.parsed_data?.fibre_length || 'Unknown',
      variety: allocation.parsed_data?.variety || 'Unknown',
      bid_price: allocation.otr_price || 0,
      status: 'AVAILABLE',
      added_by: req.user.id
    }));

    // Insert all inventory entries
    const { data: insertedEntries, error: insertError } = await supabase
      .from('inventory_table')
      .insert(inventoryEntries)
      .select();

    if (insertError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to save sampling entries',
        error: insertError.message
      });
    }

    // Log sampling completion
    await supabase
      .from('audit_log')
      .insert({
        table_name: 'inventory_table',
        action: 'SAMPLING_COMPLETED',
        user_id: req.user.id,
        new_values: {
          indent_number,
          lots_count: lots.length,
          lot_numbers: lots
        }
      });

    res.status(201).json({
      success: true,
      message: 'Sampling entries saved successfully',
      data: {
        indent_number,
        lots_saved: lots.length,
        entries: insertedEntries
      }
    });
  })
);

/**
 * @route   POST /api/sampling/log
 * @desc    Log sampling activity (optional audit trail)
 * @access  Private
 */
router.post('/log', 
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { indent_number, action, notes } = req.body;

    if (!indent_number || !action) {
      return res.status(400).json({
        success: false,
        message: 'Indent number and action are required'
      });
    }

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

    res.json({
      success: true,
      message: 'Sampling activity logged successfully'
    });
  })
);

/**
 * @route   GET /api/sampling/history
 * @desc    Get sampling history for an indent
 * @access  Private
 */
router.get('/history', 
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { indent_number } = req.query;

    if (!indent_number) {
      return res.status(400).json({
        success: false,
        message: 'Indent number is required'
      });
    }

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
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch sampling history',
        error: error.message
      });
    }

    res.json({
      success: true,
      data: {
        indent_number,
        history,
        total_lots: history.length
      }
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
    // Get total lots by status
    const { data: statusCounts, error: statusError } = await supabase
      .from('inventory_table')
      .select('status')
      .then(({ data, error }) => {
        if (error) return { data: null, error };
        
        const counts = data.reduce((acc, item) => {
          acc[item.status] = (acc[item.status] || 0) + 1;
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

    // Get sampling completion by date
    const { data: dailyStats, error: dailyError } = await supabase
      .from('inventory_table')
      .select('created_at')
      .then(({ data, error }) => {
        if (error) return { data: null, error };
        
        const dailyCounts = data.reduce((acc, item) => {
          const date = item.created_at.split('T')[0];
          acc[date] = (acc[date] || 0) + 1;
          return acc;
        }, {});
        
        return { data: dailyCounts, error: null };
      });

    if (dailyError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch daily statistics',
        error: dailyError.message
      });
    }

    res.json({
      success: true,
      data: {
        status_counts: statusCounts,
        daily_sampling: dailyStats,
        generated_at: new Date().toISOString()
      }
    });
  })
);

module.exports = router;