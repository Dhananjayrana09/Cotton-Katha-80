/**
 * Authentication routes
 * Handles user login, registration, and token management
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { supabase } = require('../config/supabase');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Validation schemas
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required(),
  first_name: Joi.string().min(2).max(50).required(),
  last_name: Joi.string().min(2).max(50).required(),
  role: Joi.string().valid('admin', 'trader', 'customer').default('trader')
});

/**
 * @route   POST /api/auth/login
 * @desc    Login user and return JWT token
 * @access  Public
 */
router.post('/login', validateBody(loginSchema), asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find user by email
  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, password_hash, first_name, last_name, role, is_active')
    .eq('email', email)
    .single();

  if (error || !user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }

  if (!user.is_active) {
    return res.status(401).json({
      success: false,
      message: 'Account is inactive'
    });
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }

  // Generate JWT token
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  console.log("logged in nhi hua", user);
  // Log successful login
  await supabase
    .from('audit_log')
    .insert({
      table_name: 'users',
      record_id: user.id,
      action: 'LOGIN',
      user_id: user.id,
      new_values: { login_time: new Date().toISOString() }
    });

  console.log("logged in user", user);

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role
      }
    }
  });
}));

/**
 * @route   POST /api/auth/register
 * @desc    Register new user
 * @access  Public (or Admin only in production)
 */
router.post('/register', validateBody(registerSchema), asyncHandler(async (req, res) => {
  const { email, password, first_name, last_name, role } = req.body;

  // Check if user already exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: 'User already exists with this email'
    });
  }

  // Hash password
  const saltRounds = 12;
  const password_hash = await bcrypt.hash(password, saltRounds);

  // Create user
  const { data: newUser, error } = await supabase
    .from('users')
    .insert({
      email,
      password_hash,
      first_name,
      last_name,
      role,
      is_active: true
    })
    .select('id, email, first_name, last_name, role')
    .single();

  if (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: error.message
    });
  }

  // Generate JWT token
  const token = jwt.sign(
    { userId: newUser.id, email: newUser.email, role: newUser.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  // Log user registration
  await supabase
    .from('audit_log')
    .insert({
      table_name: 'users',
      record_id: newUser.id,
      action: 'REGISTER',
      user_id: newUser.id,
      new_values: { registration_time: new Date().toISOString() }
    });

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: {
      token,
      user: newUser
    }
  });
}));

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (client-side token removal)
 * @access  Private
 */
router.post('/logout', authenticateToken, asyncHandler(async (req, res) => {
  // Log logout
  await supabase
    .from('audit_log')
    .insert({
      table_name: 'users',
      record_id: req.user.id,
      action: 'LOGOUT',
      user_id: req.user.id,
      new_values: { logout_time: new Date().toISOString() }
    });

  res.json({
    success: true,
    message: 'Logout successful'
  });
}));

/**
 * @route   GET /api/auth/me
 * @desc    Get current user details
 * @access  Private
 */
router.get('/me', authenticateToken, asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      user: req.user
    }
  });
}));

/**
 * @route   PUT /api/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile', authenticateToken, asyncHandler(async (req, res) => {
  const { first_name, last_name } = req.body;

  const { data: updatedUser, error } = await supabase
    .from('users')
    .update({
      first_name,
      last_name,
      updated_at: new Date().toISOString()
    })
    .eq('id', req.user.id)
    .select('id, email, first_name, last_name, role')
    .single();

  if (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      user: updatedUser
    }
  });
}));

module.exports = router;