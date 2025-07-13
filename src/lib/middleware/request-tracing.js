import { v4 as uuidv4 } from 'uuid';
import { logger } from '../services/logger.js';
import { monitoring } from '../services/monitoring.js';
import { performance } from 'perf_hooks';

/**
 * Request tracing middleware for SvelteKit
 * Adds correlation IDs, tracks performance, and logs requests
 */
export function createRequestTracingMiddleware(config = {}) {
  const {
    enableLogging = true,
    enableMetrics = true,
    enablePerformanceTracking = true,
    logLevel = 'info',
    excludePaths = ['/favicon.ico', '/robots.txt'],
    sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'],
    ...options
  } = config;

  return async ({ event, resolve }) => {
    const startTime = performance.now();
    const timestamp = Date.now();
    
    // Generate or extract correlation ID
    const correlationId = event.request.headers.get('x-correlation-id') || 
                         event.request.headers.get('x-request-id') || 
                         uuidv4();

    // Set correlation ID in logger
    logger.setCorrelationId(correlationId);

    // Extract request information
    const requestInfo = {
      method: event.request.method,
      url: event.url.pathname + event.url.search,
      pathname: event.url.pathname,
      userAgent: event.request.headers.get('user-agent'),
      ip: event.getClientAddress(),
      correlationId,
      timestamp
    };

    // Skip tracking for excluded paths
    const shouldTrack = !excludePaths.some(path => requestInfo.pathname.startsWith(path));

    // Add correlation ID to event locals for use in handlers
    event.locals.correlationId = correlationId;
    event.locals.requestStartTime = startTime;
    event.locals.requestInfo = requestInfo;

    // Log incoming request
    if (enableLogging && shouldTrack) {
      const sanitizedHeaders = sanitizeHeaders(
        Object.fromEntries(event.request.headers.entries()),
        sensitiveHeaders
      );

      logger.info('Incoming request', {
        ...requestInfo,
        headers: sanitizedHeaders
      });
    }

    let response;
    let error = null;

    try {
      // Resolve the request
      response = await resolve(event);
      
      // Calculate response time
      const responseTime = performance.now() - startTime;
      const statusCode = response.status;

      // Track metrics
      if (enableMetrics && shouldTrack) {
        monitoring.trackRequest(
          requestInfo.pathname,
          requestInfo.method,
          statusCode,
          Math.round(responseTime),
          timestamp
        );
      }

      // Log response
      if (enableLogging && shouldTrack) {
        const logLevel = getLogLevel(statusCode);
        const responseInfo = {
          ...requestInfo,
          statusCode,
          responseTime: Math.round(responseTime),
          contentLength: response.headers.get('content-length')
        };

        logger[logLevel]('Request completed', responseInfo);
      }

      // Add correlation ID to response headers
      response.headers.set('x-correlation-id', correlationId);
      response.headers.set('x-response-time', Math.round(performance.now() - startTime).toString());

      return response;

    } catch (err) {
      error = err;
      const responseTime = performance.now() - startTime;
      const statusCode = err.status || 500;

      // Track error metrics
      if (enableMetrics && shouldTrack) {
        monitoring.trackRequest(
          requestInfo.pathname,
          requestInfo.method,
          statusCode,
          Math.round(responseTime),
          timestamp
        );
      }

      // Log error
      if (enableLogging && shouldTrack) {
        logger.error('Request failed', {
          ...requestInfo,
          error: {
            name: err.name,
            message: err.message,
            stack: err.stack,
            statusCode
          },
          responseTime: Math.round(responseTime)
        });
      }

      // Re-throw the error to be handled by error handlers
      throw err;
    }
  };
}

/**
 * Sanitize headers by redacting sensitive information
 */
function sanitizeHeaders(headers, sensitiveHeaders) {
  const sanitized = { ...headers };
  
  for (const header of sensitiveHeaders) {
    if (sanitized[header]) {
      sanitized[header] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

/**
 * Get appropriate log level based on status code
 */
function getLogLevel(statusCode) {
  if (statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warn';
  return 'info';
}

/**
 * Express.js style middleware for non-SvelteKit applications
 */
export function expressRequestTracing(config = {}) {
  const {
    enableLogging = true,
    enableMetrics = true,
    logLevel = 'info',
    excludePaths = ['/favicon.ico', '/robots.txt'],
    sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'],
    ...options
  } = config;

  return (req, res, next) => {
    const startTime = performance.now();
    const timestamp = Date.now();
    
    // Generate or extract correlation ID
    const correlationId = req.headers['x-correlation-id'] || 
                         req.headers['x-request-id'] || 
                         uuidv4();

    // Set correlation ID in logger
    logger.setCorrelationId(correlationId);

    // Add correlation ID to request
    req.correlationId = correlationId;
    req.requestStartTime = startTime;

    // Extract request information
    const requestInfo = {
      method: req.method,
      url: req.originalUrl || req.url,
      pathname: req.path || req.url.split('?')[0],
      userAgent: req.get('user-agent'),
      ip: req.ip || req.connection.remoteAddress,
      correlationId,
      timestamp
    };

    // Skip tracking for excluded paths
    const shouldTrack = !excludePaths.some(path => requestInfo.pathname.startsWith(path));

    // Log incoming request
    if (enableLogging && shouldTrack) {
      const sanitizedHeaders = sanitizeHeaders(req.headers, sensitiveHeaders);
      logger.info('Incoming request', {
        ...requestInfo,
        headers: sanitizedHeaders
      });
    }

    // Override res.end to capture response
    const originalEnd = res.end;
    res.end = function(chunk, encoding) {
      const responseTime = performance.now() - startTime;
      const statusCode = res.statusCode;

      // Track metrics
      if (enableMetrics && shouldTrack) {
        monitoring.trackRequest(
          requestInfo.pathname,
          requestInfo.method,
          statusCode,
          Math.round(responseTime),
          timestamp
        );
      }

      // Log response
      if (enableLogging && shouldTrack) {
        const logLevel = getLogLevel(statusCode);
        const responseInfo = {
          ...requestInfo,
          statusCode,
          responseTime: Math.round(responseTime),
          contentLength: res.get('content-length')
        };

        logger[logLevel]('Request completed', responseInfo);
      }

      // Add correlation ID to response headers
      res.set('x-correlation-id', correlationId);
      res.set('x-response-time', Math.round(responseTime));

      // Call original end
      originalEnd.call(this, chunk, encoding);
    };

    next();
  };
}

/**
 * Utility function to get correlation ID from SvelteKit event
 */
export function getCorrelationId(event) {
  return event?.locals?.correlationId || 
         event?.request?.headers?.get('x-correlation-id') ||
         uuidv4();
}

/**
 * Utility function to get request info from SvelteKit event
 */
export function getRequestInfo(event) {
  return event?.locals?.requestInfo || {
    method: event?.request?.method || 'UNKNOWN',
    url: event?.url?.pathname || 'unknown',
    correlationId: getCorrelationId(event),
    timestamp: Date.now()
  };
}

/**
 * Create a child logger with request context
 */
export function createRequestLogger(event) {
  const correlationId = getCorrelationId(event);
  const requestInfo = getRequestInfo(event);
  
  return logger.child({
    correlationId,
    method: requestInfo.method,
    url: requestInfo.url
  });
}