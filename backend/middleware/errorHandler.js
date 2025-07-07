/**
 * Global error handling middleware
 * Handles all errors and provides consistent error responses
 */

const { supabase } = require('../config/supabase');

/**
 * Global error handler
 */
const errorHandler = async (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error details
  console.error('🚨 Error:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id
  });

  // Log error to audit_log table
  try {
    await supabase
      .from('audit_log')
      .insert({
        table_name: 'error_log',
        action: 'ERROR',
        user_id: req.user?.id || null,
        new_values: {
          message: err.message,
          stack: err.stack,
          url: req.originalUrl,
          method: req.method
        },
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });
  } catch (logError) {
    console.error('Failed to log error to database:', logError);
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = { message, statusCode: 404 };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = 'Duplicate field value entered';
    error = { message, statusCode: 400 };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = { message, statusCode: 400 };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = { message, statusCode: 401 };
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = { message, statusCode: 401 };
  }

  // Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    const message = 'File size too large';
    error = { message, statusCode: 400 };
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    const message = 'Unexpected file field';
    error = { message, statusCode: 400 };
  }

  // Supabase errors
  if (err.code && err.code.startsWith('PGRST')) {
    const message = 'Database operation failed';
    error = { message, statusCode: 500 };
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

/**
 * Handle async errors
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  errorHandler,
  asyncHandler
};