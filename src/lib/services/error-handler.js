import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger.js';

/**
 * Base application error class for operational errors
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'APP_ERROR', isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error for input validation failures
 */
export class ValidationError extends AppError {
  constructor(message, field = null, value = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.field = field;
    this.value = value;
  }
}

/**
 * Authentication error for auth failures
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

/**
 * Authorization error for access control failures
 */
export class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

/**
 * Not found error for missing resources
 */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', resource = null) {
    super(message, 404, 'NOT_FOUND_ERROR');
    this.resource = resource;
  }
}

/**
 * Rate limit error for too many requests
 */
export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded', retryAfter = null) {
    super(message, 429, 'RATE_LIMIT_ERROR');
    this.retryAfter = retryAfter;
  }
}

/**
 * Comprehensive error handling system
 */
export class ErrorHandler {
  constructor(config = {}) {
    this.config = {
      environment: config.environment || process.env.NODE_ENV || 'development',
      logger: config.logger || logger,
      enableGlobalHandlers: config.enableGlobalHandlers ?? true,
      enableErrorTracking: config.enableErrorTracking ?? true,
      enableRecovery: config.enableRecovery ?? true,
      ...config
    };

    this.errorStats = {
      total: 0,
      byCategory: {},
      byCode: {},
      trends: {
        hourly: new Map(),
        daily: new Map()
      }
    };

    this.errorCategories = {
      validation: ['VALIDATION_ERROR'],
      authentication: ['AUTHENTICATION_ERROR'],
      authorization: ['AUTHORIZATION_ERROR'],
      notFound: ['NOT_FOUND_ERROR'],
      rateLimit: ['RATE_LIMIT_ERROR'],
      application: ['APP_ERROR'],
      system: []
    };

    if (this.config.enableGlobalHandlers) {
      this.setupGlobalHandlers();
    }
  }

  /**
   * Check if error is operational (expected) or programming error
   */
  isOperationalError(error) {
    if (error instanceof AppError) {
      return error.isOperational;
    }
    return false;
  }

  /**
   * Get error category for classification
   */
  getErrorCategory(error) {
    if (error instanceof AppError) {
      for (const [category, codes] of Object.entries(this.errorCategories)) {
        if (codes.includes(error.code)) {
          return category;
        }
      }
      return 'application';
    }
    return 'system';
  }

  /**
   * Get error severity level
   */
  getErrorSeverity(error) {
    if (error instanceof AppError) {
      if (error.statusCode >= 500) return 'critical';
      if (error.statusCode >= 400) return 'warning';
      return 'info';
    }
    return 'critical';
  }

  /**
   * Create standardized error response
   */
  createErrorResponse(error, requestId = null, context = {}) {
    const isOperational = this.isOperationalError(error);
    const category = this.getErrorCategory(error);
    const severity = this.getErrorSeverity(error);

    const response = {
      success: false,
      error: {
        message: isOperational ? error.message : 'Internal server error',
        code: error.code || 'INTERNAL_ERROR',
        statusCode: error.statusCode || 500,
        category,
        severity
      },
      requestId: requestId || uuidv4(),
      timestamp: new Date().toISOString()
    };

    // Include additional error details in development
    if (this.config.environment === 'development') {
      response.error.stack = error.stack;
      if (error.field) response.error.field = error.field;
      if (error.value) response.error.value = error.value;
      if (error.resource) response.error.resource = error.resource;
    }

    // Include retry information for rate limits
    if (error instanceof RateLimitError && error.retryAfter) {
      response.error.retryAfter = error.retryAfter;
    }

    // Include recovery suggestions if enabled
    if (this.config.enableRecovery) {
      response.recovery = this.getRecoveryActions(error);
    }

    return response;
  }

  /**
   * Log error with appropriate level and context
   */
  logError(error, requestId = null, context = {}) {
    const category = this.getErrorCategory(error);
    const severity = this.getErrorSeverity(error);
    const isOperational = this.isOperationalError(error);

    const logContext = {
      error: {
        name: error.name,
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        stack: error.stack
      },
      category,
      severity,
      isOperational,
      requestId,
      ...context
    };

    // Set correlation ID if available
    if (requestId) {
      this.config.logger.setCorrelationId(requestId);
    }

    // Log with appropriate level based on severity and category
    if (category === 'authentication' || category === 'authorization') {
      this.config.logger.security(`${category}_error`, logContext);
    } else if (severity === 'critical' || !isOperational) {
      this.config.logger.error(`Error occurred: ${error.message}`, logContext);
    } else if (severity === 'warning') {
      this.config.logger.warn(`Warning: ${error.message}`, logContext);
    } else {
      this.config.logger.info(`Info: ${error.message}`, logContext);
    }

    // Track error for analytics
    if (this.config.enableErrorTracking) {
      this.trackError(error, context);
    }
  }

  /**
   * Handle errors in SvelteKit format
   */
  handleSvelteKitError(error, requestId = null, context = {}) {
    this.logError(error, requestId, context);
    const response = this.createErrorResponse(error, requestId, context);
    
    return {
      status: response.error.statusCode,
      body: response
    };
  }

  /**
   * Express.js error middleware
   */
  expressErrorMiddleware() {
    return (error, req, res, next) => {
      const requestId = req.headers['x-request-id'] || req.id || uuidv4();
      const context = {
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        userId: req.user?.id
      };

      this.logError(error, requestId, context);
      const response = this.createErrorResponse(error, requestId, context);
      
      res.status(response.error.statusCode).json(response);
    };
  }

  /**
   * Get recovery actions for different error types
   */
  getRecoveryActions(error) {
    const category = this.getErrorCategory(error);
    
    const recoveryMap = {
      validation: [
        'Validate input data',
        'Check field formats and requirements',
        'Ensure all required fields are provided'
      ],
      authentication: [
        'Refresh authentication token',
        'Re-authenticate user',
        'Check credentials'
      ],
      authorization: [
        'Verify user permissions',
        'Contact administrator for access',
        'Check role assignments'
      ],
      notFound: [
        'Verify resource identifier',
        'Check if resource exists',
        'Ensure correct endpoint'
      ],
      rateLimit: [
        'Wait before retrying',
        'Reduce request frequency',
        'Implement exponential backoff'
      ],
      system: [
        'Check system status',
        'Verify configuration',
        'Check database connectivity',
        'Review logs for details'
      ]
    };

    return recoveryMap[category] || recoveryMap.system;
  }

  /**
   * Track error for analytics and monitoring
   */
  trackError(error, context = {}) {
    const category = this.getErrorCategory(error);
    const code = error.code || 'UNKNOWN_ERROR';
    const now = new Date();
    const hour = now.getHours();
    const day = now.toDateString();

    // Update total count
    this.errorStats.total++;

    // Update category counts
    this.errorStats.byCategory[category] = (this.errorStats.byCategory[category] || 0) + 1;

    // Update code counts
    this.errorStats.byCode[code] = (this.errorStats.byCode[code] || 0) + 1;

    // Update hourly trends
    const hourlyKey = `${day}-${hour}`;
    this.errorStats.trends.hourly.set(
      hourlyKey,
      (this.errorStats.trends.hourly.get(hourlyKey) || 0) + 1
    );

    // Update daily trends
    this.errorStats.trends.daily.set(
      day,
      (this.errorStats.trends.daily.get(day) || 0) + 1
    );

    // Clean up old trend data (keep last 24 hours and 30 days)
    this.cleanupTrends();
  }

  /**
   * Clean up old trend data
   */
  cleanupTrends() {
    const now = new Date();
    
    // Clean hourly trends (keep last 24 hours)
    for (const [key] of this.errorStats.trends.hourly) {
      const [dateStr, hourStr] = key.split('-');
      const trendDate = new Date(dateStr);
      trendDate.setHours(parseInt(hourStr));
      
      if (now - trendDate > 24 * 60 * 60 * 1000) {
        this.errorStats.trends.hourly.delete(key);
      }
    }

    // Clean daily trends (keep last 30 days)
    for (const [key] of this.errorStats.trends.daily) {
      const trendDate = new Date(key);
      if (now - trendDate > 30 * 24 * 60 * 60 * 1000) {
        this.errorStats.trends.daily.delete(key);
      }
    }
  }

  /**
   * Get error statistics
   */
  getErrorStats() {
    return {
      total: this.errorStats.total,
      byCategory: { ...this.errorStats.byCategory },
      byCode: { ...this.errorStats.byCode }
    };
  }

  /**
   * Get error trends
   */
  getErrorTrends() {
    return {
      hourly: Object.fromEntries(this.errorStats.trends.hourly),
      daily: Object.fromEntries(this.errorStats.trends.daily)
    };
  }

  /**
   * Reset error statistics
   */
  resetStats() {
    this.errorStats = {
      total: 0,
      byCategory: {},
      byCode: {},
      trends: {
        hourly: new Map(),
        daily: new Map()
      }
    };
  }

  /**
   * Setup global error handlers for uncaught exceptions and unhandled rejections
   */
  setupGlobalHandlers() {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.config.logger.error('Uncaught Exception', {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        },
        severity: 'critical',
        category: 'system'
      });

      // Graceful shutdown
      console.error('Uncaught Exception. Shutting down...');
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.config.logger.error('Unhandled Promise Rejection', {
        reason: reason instanceof Error ? {
          name: reason.name,
          message: reason.message,
          stack: reason.stack
        } : reason,
        promise: promise.toString(),
        severity: 'critical',
        category: 'system'
      });

      // In production, you might want to exit the process
      if (this.config.environment === 'production') {
        console.error('Unhandled Promise Rejection. Shutting down...');
        process.exit(1);
      }
    });

    // Handle SIGTERM and SIGINT for graceful shutdown
    const gracefulShutdown = (signal) => {
      this.config.logger.info(`Received ${signal}. Starting graceful shutdown...`);
      
      // Perform cleanup operations here
      setTimeout(() => {
        this.config.logger.info('Graceful shutdown completed');
        process.exit(0);
      }, 5000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }

  /**
   * Create error from HTTP status code
   */
  static fromHttpStatus(statusCode, message = null) {
    const defaultMessages = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      409: 'Conflict',
      422: 'Unprocessable Entity',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
      504: 'Gateway Timeout'
    };

    const errorMessage = message || defaultMessages[statusCode] || 'Unknown Error';
    
    switch (statusCode) {
      case 400:
        return new ValidationError(errorMessage);
      case 401:
        return new AuthenticationError(errorMessage);
      case 403:
        return new AuthorizationError(errorMessage);
      case 404:
        return new NotFoundError(errorMessage);
      case 429:
        return new RateLimitError(errorMessage);
      default:
        return new AppError(errorMessage, statusCode);
    }
  }
}

// Create default error handler instance
export const errorHandler = new ErrorHandler();

// Export convenience functions
export const handleError = (error, requestId, context) => 
  errorHandler.handleSvelteKitError(error, requestId, context);

export const createErrorResponse = (error, requestId, context) => 
  errorHandler.createErrorResponse(error, requestId, context);

export const logError = (error, requestId, context) => 
  errorHandler.logError(error, requestId, context);