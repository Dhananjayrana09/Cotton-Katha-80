/**
 * Main server file for Cotton Trading Application
 * Sets up Express server with all routes and middleware
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { supabase } = require('./config/supabase');
const { authenticateToken } = require('./middleware/auth');
const { asyncHandler } = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/authRoutes');
const allocationRoutes = require('./routes/allocationRoutes');
const procurementRoutes = require('./routes/procurementRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const contractRoutes = require('./routes/contractRoutes');
const samplingRoutes = require('./routes/samplingRoutes');
const salesRoutes = require('./routes/salesRoutes');
const customerLotsRoutes = require('./routes/customerLotsRoutes');
const n8nWebhookRoutes = require('./routes/n8nWebhookRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/requestLogger');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: (process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000, // 15 minutes
  max: process.env.RATE_LIMIT_MAX_REQUESTS || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-frontend-domain.com'] 
    : ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
  optionsSuccessStatus: 200
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}
app.use(requestLogger);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: '1.0.0'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/allocations', allocationRoutes);
app.use('/api/procurement', procurementRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/utr', paymentRoutes); // UTR routes are part of payment routes
app.use('/api/contract', contractRoutes);
app.use('/api/sampling', samplingRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/customer', customerLotsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/webhook/n8n', n8nWebhookRoutes);

// GET /api/customer-info
app.get('/api/customer-info', authenticateToken, asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('customer_info')
    .select('*')
    .order('customer_name', { ascending: true });
  if (error) return res.status(500).json({ success: false, message: 'Failed to fetch customers', error: error.message });
  res.json({ data: { customers: data } });
}));

// GET /api/broker-info
app.get('/api/broker-info', authenticateToken, asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('broker_info')
    .select('*')
    .order('broker_name', { ascending: true });
  if (error) return res.status(500).json({ success: false, message: 'Failed to fetch brokers', error: error.message });
  res.json({ data: { brokers: data } });
}));

//backend health check
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Hello World'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`
🚀 Cotton Trading API Server is running!
📡 Port: ${PORT}
🌍 Environment: ${process.env.NODE_ENV}
📅 Started at: ${new Date().toISOString()}
🔗 Health check: http://localhost:${PORT}/health
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

module.exports = app;