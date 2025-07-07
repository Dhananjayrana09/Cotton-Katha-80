/**
 * Request logging middleware
 * Logs all requests for monitoring and debugging
 */

const { supabase } = require('../config/supabase');

/**
 * Log requests to audit table
 */
const requestLogger = async (req, res, next) => {
  // Skip logging for health checks and static files
  if (req.path === '/health' || req.path.startsWith('/static/')) {
    return next();
  }

  const startTime = Date.now();

  // Override res.end to capture response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const endTime = Date.now();
    const responseTime = endTime - startTime;

    // Log request details (async, don't wait)
    logRequest(req, res, responseTime).catch(console.error);

    originalEnd.call(this, chunk, encoding);
  };

  next();
};

/**
 * Log request to database
 */
async function logRequest(req, res, responseTime) {
  try {
    await supabase
      .from('audit_log')
      .insert({
        table_name: 'request_log',
        action: `${req.method} ${req.path}`,
        user_id: req.user?.id || null,
        new_values: {
          method: req.method,
          url: req.originalUrl,
          status_code: res.statusCode,
          response_time: responseTime,
          query_params: req.query,
          body_size: req.headers['content-length'] || 0
        },
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });
  } catch (error) {
    // Don't throw error if logging fails
    console.error('Failed to log request:', error);
  }
}

module.exports = {
  requestLogger
};