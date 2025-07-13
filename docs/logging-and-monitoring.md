# Comprehensive Logging and Monitoring System

This document describes the comprehensive error handling, logging, and monitoring system implemented for the Launchpadder application.

## Overview

The system provides:
- **Centralized Logging**: Structured logging with multiple levels and formats
- **Error Handling**: Global error management with classification and recovery
- **Application Monitoring**: Health checks, metrics collection, and performance tracking
- **Request Tracing**: Correlation IDs for distributed tracing
- **Security**: Sensitive data redaction and log encryption
- **Alerting**: Real-time notifications for critical issues
- **Analytics**: Dashboard and metrics export capabilities

## Architecture

### Core Components

1. **Logger Service** (`src/lib/services/logger.js`)
   - Winston-based structured logging
   - Multiple transports (console, file, rotation)
   - Sensitive data redaction
   - Log encryption support

2. **Error Handler** (`src/lib/services/error-handler.js`)
   - Custom error classes
   - Error classification and categorization
   - Recovery suggestions
   - Error tracking and aggregation

3. **Monitoring Service** (`src/lib/services/monitoring.js`)
   - Health checks
   - System metrics (CPU, memory, disk)
   - Request tracking
   - Performance monitoring
   - Alerting system

4. **Request Tracing Middleware** (`src/lib/middleware/request-tracing.js`)
   - Correlation ID generation
   - Request/response logging
   - Performance tracking
   - Metrics collection

## Usage

### Basic Logging

```javascript
import { logger } from '$lib/services/logger.js';

// Different log levels
logger.debug('Debug information', { userId: '123' });
logger.info('User logged in', { userId: '123', email: 'user@example.com' });
logger.warn('Deprecated API used', { endpoint: '/api/old' });
logger.error('Database connection failed', { error: dbError });

// Performance logging
logger.performance('Database query', 150, { query: 'SELECT * FROM users' });

// Audit logging
logger.audit('user.login', { userId: '123', ip: '192.168.1.1' });

// Security logging
logger.security('failed_login_attempt', { email: 'user@example.com', attempts: 3 });
```

### Error Handling

```javascript
import { 
  AppError, 
  ValidationError, 
  AuthenticationError,
  errorHandler 
} from '$lib/services/error-handler.js';

// Throw custom errors
throw new ValidationError('Invalid email format', 'email', 'invalid-email');
throw new AuthenticationError('Token expired');

// Handle errors in API routes
export async function POST({ request }) {
  try {
    // Your logic here
  } catch (error) {
    const requestId = request.headers.get('x-request-id');
    return errorHandler.handleSvelteKitError(error, requestId, {
      endpoint: '/api/users',
      method: 'POST'
    });
  }
}
```

### Monitoring and Metrics

```javascript
import { monitoring } from '$lib/services/monitoring.js';

// Add health checks
monitoring.addHealthCheck('database', async () => {
  const result = await db.query('SELECT 1');
  return result.rows.length > 0;
});

// Track custom metrics
monitoring.recordMetric('active_users', 150);
monitoring.incrementCounter('login_attempts');

// Performance timing
const timer = monitoring.startTimer('expensive_operation');
await performExpensiveOperation();
timer.end({ operation: 'data_processing' });

// Get metrics
const health = await monitoring.getHealthStatus();
const metrics = await monitoring.getSystemMetrics();
```

### Request Tracing

```javascript
import { getCorrelationId, createRequestLogger } from '$lib/middleware/request-tracing.js';

// In API routes
export async function GET({ event }) {
  const correlationId = getCorrelationId(event);
  const requestLogger = createRequestLogger(event);
  
  requestLogger.info('Processing request', { action: 'get_user' });
  
  // Your logic here
}
```

## API Endpoints

### Health Check

```
GET /api/health
GET /api/health?details=true
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-13T12:00:00.000Z",
  "uptime": 3600000,
  "version": "1.0.0",
  "environment": "production",
  "system": {
    "memory": { "percentage": 45 },
    "cpu": { "usage": 25 },
    "disk": { "percentage": 60 }
  },
  "checks": {
    "database": { "status": "healthy", "duration": 15 },
    "memory": { "status": "healthy" }
  }
}
```

### Metrics

```
GET /api/metrics
GET /api/metrics?format=prometheus
GET /api/metrics?range=1h
POST /api/metrics
```

Response (JSON format):
```json
{
  "timestamp": "2025-01-13T12:00:00.000Z",
  "requestId": "req-123",
  "system": {
    "memory": { "total": 8589934592, "used": 3865470976, "percentage": 45 },
    "cpu": { "usage": 25, "cores": 8 },
    "disk": { "total": 1000000000000, "used": 600000000000, "percentage": 60 }
  },
  "requests": {
    "total": 1500,
    "byEndpoint": {
      "/api/users": { "count": 500, "totalTime": 75000, "errors": 5 }
    },
    "byMethod": { "GET": 1200, "POST": 300 },
    "byStatus": { "200": 1400, "404": 50, "500": 50 }
  },
  "custom": {
    "active_users": 150,
    "queue_size": 25
  },
  "counters": {
    "login_attempts": 1000,
    "failed_logins": 50
  }
}
```

## Configuration

### Environment Variables

```bash
# Logging
LOG_LEVEL=info
LOG_ENCRYPTION_KEY=your-encryption-key-here

# Monitoring
ALERT_ERROR_RATE_THRESHOLD=0.05
ALERT_RESPONSE_TIME_THRESHOLD=2000
ALERT_MEMORY_THRESHOLD=90
ALERT_CPU_THRESHOLD=80
ALERT_DISK_THRESHOLD=85

# Application
NODE_ENV=production
```

### Logger Configuration

```javascript
import { Logger } from '$lib/services/logger.js';

const logger = new Logger({
  level: 'info',
  service: 'my-service',
  environment: 'production',
  enableFileTransport: true,
  enableConsoleTransport: true,
  logDir: './logs',
  maxFiles: '14d',
  maxSize: '20m',
  encryptLogs: true,
  encryptionKey: process.env.LOG_ENCRYPTION_KEY
});
```

### Error Handler Configuration

```javascript
import { ErrorHandler } from '$lib/services/error-handler.js';

const errorHandler = new ErrorHandler({
  environment: 'production',
  enableGlobalHandlers: true,
  enableErrorTracking: true,
  enableRecovery: true
});
```

### Monitoring Configuration

```javascript
import { MonitoringService } from '$lib/services/monitoring.js';

const monitoring = new MonitoringService({
  alertThresholds: {
    errorRate: 0.05,
    responseTime: 2000,
    memoryUsage: 90,
    cpuUsage: 80,
    diskUsage: 85
  },
  metricsRetention: 24 * 60 * 60 * 1000 // 24 hours
});
```

## Log Formats

### Structured Log Entry

```json
{
  "timestamp": "2025-01-13T12:00:00.000Z",
  "level": "info",
  "message": "User logged in",
  "service": "launchpadder",
  "environment": "production",
  "correlationId": "req-123",
  "userId": "user-456",
  "email": "[REDACTED]",
  "ip": "192.168.1.1"
}
```

### Error Log Entry

```json
{
  "timestamp": "2025-01-13T12:00:00.000Z",
  "level": "error",
  "message": "Database connection failed",
  "service": "launchpadder",
  "environment": "production",
  "correlationId": "req-123",
  "error": {
    "name": "ConnectionError",
    "message": "Connection timeout",
    "stack": "Error: Connection timeout\n    at ...",
    "code": "ECONNRESET"
  },
  "category": "system",
  "severity": "critical"
}
```

### Performance Log Entry

```json
{
  "timestamp": "2025-01-13T12:00:00.000Z",
  "level": "info",
  "message": "Performance: Database query",
  "service": "launchpadder",
  "environment": "production",
  "correlationId": "req-123",
  "performance": {
    "operation": "Database query",
    "duration": 150,
    "unit": "ms"
  },
  "query": "SELECT * FROM users WHERE id = $1"
}
```

## Security Features

### Sensitive Data Redaction

The system automatically redacts sensitive information:

- **Passwords**: `password`, `confirmPassword`
- **Tokens**: `token`, `accessToken`, `refreshToken`, `apiKey`
- **Payment Info**: `cardNumber`, `cvv`, `ssn`
- **Headers**: `authorization`, `cookie`, `session`

### Log Encryption

Logs can be encrypted using AES encryption:

```javascript
const logger = new Logger({
  encryptLogs: true,
  encryptionKey: process.env.LOG_ENCRYPTION_KEY
});
```

### Compliance

- **Data Protection**: Automatic PII redaction
- **Retention Policies**: Configurable log retention
- **Audit Trails**: Comprehensive audit logging
- **Access Control**: Secure log storage

## Alerting

### Alert Types

1. **High Error Rate**: When error rate exceeds threshold
2. **High Response Time**: When response time exceeds threshold
3. **High Memory Usage**: When memory usage exceeds threshold
4. **High CPU Usage**: When CPU usage exceeds threshold
5. **High Disk Usage**: When disk usage exceeds threshold
6. **Health Check Failures**: When health checks fail

### Alert Configuration

```javascript
monitoring.onAlert((alert) => {
  console.log('Alert triggered:', alert);
  
  // Send to external alerting system
  if (alert.severity === 'critical') {
    sendToSlack(alert);
    sendToEmail(alert);
  }
});
```

## Dashboard Integration

### Prometheus Metrics

```
GET /api/metrics?format=prometheus
```

### Grafana Integration

The system exports metrics in Prometheus format for Grafana dashboards:

- Request rates and response times
- Error rates by endpoint
- System resource usage
- Custom application metrics

### Log Analysis

Logs are structured for easy analysis with:

- **ELK Stack**: Elasticsearch, Logstash, Kibana
- **Splunk**: Enterprise log analysis
- **CloudWatch**: AWS log monitoring
- **Custom Solutions**: JSON-structured logs

## Best Practices

### Logging

1. **Use Appropriate Log Levels**:
   - `debug`: Detailed diagnostic information
   - `info`: General application flow
   - `warn`: Potentially harmful situations
   - `error`: Error events that might still allow the application to continue

2. **Include Context**: Always include relevant context (user ID, request ID, etc.)

3. **Avoid Logging Sensitive Data**: Use the built-in redaction features

4. **Use Correlation IDs**: Track requests across services

### Error Handling

1. **Use Custom Error Classes**: Provide specific error types for different scenarios

2. **Include Recovery Information**: Help users understand how to fix issues

3. **Log Errors Appropriately**: Use the right log level for different error types

4. **Provide User-Friendly Messages**: Don't expose internal error details to users

### Monitoring

1. **Set Appropriate Thresholds**: Configure alerts based on your application's normal behavior

2. **Monitor Key Metrics**: Focus on metrics that indicate user experience

3. **Regular Health Checks**: Implement comprehensive health checks for all dependencies

4. **Performance Tracking**: Monitor response times and resource usage

## Troubleshooting

### Common Issues

1. **High Memory Usage**: Check for memory leaks in application code
2. **High Error Rates**: Review recent deployments and external dependencies
3. **Slow Response Times**: Analyze database queries and external API calls
4. **Failed Health Checks**: Verify service dependencies and configurations

### Debug Mode

Enable debug logging for troubleshooting:

```bash
LOG_LEVEL=debug npm start
```

### Log Analysis

Use correlation IDs to trace requests:

```bash
grep "req-123" logs/application-*.log
```

## Performance Considerations

### Log Volume

- Configure appropriate log levels for production
- Use log rotation to manage disk space
- Consider log sampling for high-traffic applications

### Metrics Collection

- Metrics are stored in memory with configurable retention
- Old metrics are automatically cleaned up
- Consider external metrics storage for long-term analysis

### Resource Usage

- Monitoring adds minimal overhead (~1-2% CPU)
- Log file I/O is asynchronous
- Health checks run on separate intervals

## Migration Guide

### From Basic Logging

1. Replace `console.log` with structured logging:
   ```javascript
   // Before
   console.log('User logged in:', userId);
   
   // After
   logger.info('User logged in', { userId });
   ```

2. Add error handling:
   ```javascript
   // Before
   throw new Error('Invalid input');
   
   // After
   throw new ValidationError('Invalid email format', 'email');
   ```

3. Add monitoring:
   ```javascript
   // Before
   // No monitoring
   
   // After
   const timer = monitoring.startTimer('operation');
   await performOperation();
   timer.end();
   ```

### Integration Steps

1. Install dependencies
2. Update `hooks.server.js` with middleware
3. Add health checks for your services
4. Configure alerting
5. Set up dashboard integration
6. Update existing error handling

## Support

For questions or issues with the logging and monitoring system:

1. Check this documentation
2. Review the source code comments
3. Check the test files for usage examples
4. Create an issue in the project repository

## License

This logging and monitoring system is part of the Launchpadder project and is licensed under the MIT License.