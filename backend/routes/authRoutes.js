/**
 * Authentication routes
 * Handles user login, registration, and token management
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase } = require('../config/supabase');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');
const { sendErrorResponse, sendSuccessResponse } = require('../utils/databaseHelpers');
const { routeSchemas } = require('../utils/validationSchemas');

const router = express.Router();

/**
 * @route   POST /api/auth/login
 * @desc    Login user and return JWT token
 * @access  Public
 */
router.post('/login', validateBody(routeSchemas.auth.login), asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find user by email
  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, password_hash, first_name, last_name, role, is_active')
    .eq('email', email)
    .single();

  if (error || !user) {
    return sendErrorResponse(res, 401, 'Invalid credentials');
  }

  if (!user.is_active) {
    return sendErrorResponse(res, 401, 'Account is inactive');
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    return sendErrorResponse(res, 401, 'Invalid credentials');
  }

  // Generate JWT token
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

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

  return sendSuccessResponse(res, {
    token,
    user: {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role
    }
  }, 'Login successful');
}));

/**
 * @route   POST /api/auth/register
 * @desc    Register new user
 * @access  Public (or Admin only in production)
 */
router.post('/register', validateBody(routeSchemas.auth.register), asyncHandler(async (req, res) => {
  const { email, password, first_name, last_name, role } = req.body;

  // Check if user already exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (existingUser) {
    return sendErrorResponse(res, 400, 'User already exists with this email');
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
    return sendErrorResponse(res, 500, 'Failed to create user', error.message);
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

  return sendSuccessResponse(res, {
    token,
    user: newUser
  }, 'User registered successfully', 201);
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

  return sendSuccessResponse(res, null, 'Logout successful');
}));

/**
 * @route   GET /api/auth/me
 * @desc    Get current user details
 * @access  Private
 */
router.get('/me', authenticateToken, asyncHandler(async (req, res) => {
  return sendSuccessResponse(res, { user: req.user });
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
    return sendErrorResponse(res, 500, 'Failed to update profile', error.message);
  }

  return sendSuccessResponse(res, { user: updatedUser }, 'Profile updated successfully');
}));

module.exports = router;