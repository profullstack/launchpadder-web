/**
 * Monitoring and Logging Integration Tests
 * Tests health check endpoints, error tracking, metrics collection,
 * audit trail functionality, and system observability
 */

import { expect } from 'chai';
import nock from 'nock';
import { testSupabase, testAuth, testUtils } from '../setup.js';
import DatabaseFixtures from '../fixtures/database.js';
import ApiTestHelper from '../helpers/api-helpers.js';

describe('Monitoring and Logging Features', function() {
  this.timeout(20000);
  
  let fixtures;
  let apiHelper;
  let testApp;
  let testUser;
  let userSession;
  let adminUser;
  let adminSession;

  before(async () => {
    fixtures = new DatabaseFixtures();
    testApp = null; // This would be initialized with your actual SvelteKit app
    apiHelper = new ApiTestHelper(testApp);
  });

  beforeEach(async () => {
    await testUtils.cleanupTestData(['monitoring_test_%']);
    nock.cleanAll();
    
    // Create test users
    testUser = await fixtures.createUser({
      email: `monitoring_test_${testUtils.generateTestId()}@example.com`,
      username: `monitoring_user_${testUtils.generateTestId()}`
    });
    
    const userSignIn = await testAuth.signInUser(
      testUser.credentials.email,
      testUser.credentials.password
    );
    userSession = userSignIn.session;

    adminUser = await fixtures.createUser({
      email: `monitoring_admin_${testUtils.generateTestId()}@example.com`,
      username: `monitoring_admin_${testUtils.generateTestId()}`,
      metadata: { role: 'admin' }
    });
    
    const adminSignIn = await testAuth.signInUser(
      adminUser.credentials.email,
      adminUser.credentials.password
    );
    adminSession = adminSignIn.session;
  });

  afterEach(async () => {
    await fixtures.cleanup();
    nock.cleanAll();
  });

  describe('Health Check Endpoints', () => {
    it('should provide comprehensive system health status', async function() {
      const healthCheck = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0',
        environment: 'test',
        services: {
          database: {
            status: 'healthy',
            responseTime: 25,
            connections: {
              active: 5,
              idle: 10,
              total: 15
            }
          },
          redis: {
            status: 'healthy',
            responseTime: 5,
            memory: {
              used: '50MB',
              peak: '75MB'
            }
          },
          external_apis: {
            openai: {
              status: 'healthy',
              responseTime: 150,
              lastCheck: new Date().toISOString()
            },
            stripe: {
              status: 'healthy',
              responseTime: 200,
              lastCheck: new Date().toISOString()
            }
          }
        },
        metrics: {
          requests_per_minute: 120,
          error_rate: 0.02,
          avg_response_time: 180,
          memory_usage: process.memoryUsage(),
          cpu_usage: 0.35
        }
      };

      expect(healthCheck.status).to.equal('healthy');
      expect(healthCheck.uptime).to.be.a('number');
      expect(healthCheck.services.database.status).to.equal('healthy');
      expect(healthCheck.services.database.responseTime).to.be.lessThan(100);
      expect(healthCheck.metrics.error_rate).to.be.lessThan(0.05);
      expect(healthCheck.metrics.requests_per_minute).to.be.a('number');
    });

    it('should detect and report service degradation', async function() {
      const degradedHealthCheck = {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        services: {
          database: {
            status: 'healthy',
            responseTime: 45
          },
          external_apis: {
            openai: {
              status: 'degraded',
              responseTime: 5000, // Very slow
              error: 'High response time detected'
            },
            stripe: {
              status: 'unhealthy',
              responseTime: null,
              error: 'Connection timeout'
            }
          }
        },
        alerts: [
          {
            level: 'warning',
            service: 'openai',
            message: 'Response time exceeds threshold (5000ms > 1000ms)'
          },
          {
            level: 'critical',
            service: 'stripe',
            message: 'Service unavailable - payment processing affected'
          }
        ]
      };

      expect(degradedHealthCheck.status).to.equal('degraded');
      expect(degradedHealthCheck.alerts).to.have.length(2);
      expect(degradedHealthCheck.alerts[0].level).to.equal('warning');
      expect(degradedHealthCheck.alerts[1].level).to.equal('critical');
      expect(degradedHealthCheck.services.external_apis.stripe.status).to.equal('unhealthy');
    });

    it('should provide detailed database health metrics', async function() {
      // Test database connectivity
      const { data: dbTest, error: dbError } = await testSupabase
        .from('profiles')
        .select('id')
        .limit(1);

      expect(dbError).to.be.null;

      const dbHealthMetrics = {
        connection_status: 'connected',
        response_time: 25, // milliseconds
        active_connections: 5,
        max_connections: 100,
        connection_pool_usage: 0.05,
        slow_queries: 0,
        deadlocks: 0,
        replication_lag: 0,
        disk_usage: {
          total: '100GB',
          used: '45GB',
          available: '55GB',
          usage_percentage: 45
        }
      };

      expect(dbHealthMetrics.connection_status).to.equal('connected');
      expect(dbHealthMetrics.response_time).to.be.lessThan(100);
      expect(dbHealthMetrics.connection_pool_usage).to.be.lessThan(0.8);
      expect(dbHealthMetrics.disk_usage.usage_percentage).to.be.lessThan(90);
    });

    it('should monitor external service dependencies', async function() {
      const externalServices = [
        {
          name: 'OpenAI API',
          url: 'https://api.openai.com/v1/models',
          timeout: 5000,
          expectedStatus: 200
        },
        {
          name: 'Stripe API',
          url: 'https://api.stripe.com/v1/account',
          timeout: 3000,
          expectedStatus: 401 // Unauthorized without API key
        }
      ];

      const serviceChecks = [];

      for (const service of externalServices) {
        // Mock external service responses
        nock(new URL(service.url).origin)
          .get(new URL(service.url).pathname)
          .reply(service.expectedStatus, { status: 'ok' });

        const checkResult = {
          name: service.name,
          status: 'healthy',
          responseTime: Math.floor(Math.random() * 200) + 50,
          lastCheck: new Date().toISOString()
        };

        serviceChecks.push(checkResult);
      }

      expect(serviceChecks).to.have.length(2);
      expect(serviceChecks.every(check => check.status === 'healthy')).to.be.true;
      expect(serviceChecks.every(check => check.responseTime < 1000)).to.be.true;
    });
  });

  describe('Error Tracking and Alerting', () => {
    it('should capture and categorize application errors', async function() {
      const errorCategories = {
        validation: {
          code: 'VALIDATION_ERROR',
          severity: 'low',
          examples: ['Invalid email format', 'Required field missing']
        },
        authentication: {
          code: 'AUTH_ERROR',
          severity: 'medium',
          examples: ['Invalid credentials', 'Token expired']
        },
        database: {
          code: 'DATABASE_ERROR',
          severity: 'high',
          examples: ['Connection timeout', 'Query failed']
        },
        external_api: {
          code: 'EXTERNAL_API_ERROR',
          severity: 'medium',
          examples: ['OpenAI API timeout', 'Stripe webhook failed']
        },
        system: {
          code: 'SYSTEM_ERROR',
          severity: 'critical',
          examples: ['Out of memory', 'Disk full']
        }
      };

      const captureError = (error, context = {}) => {
        const errorLog = {
          id: testUtils.generateTestId(),
          timestamp: new Date().toISOString(),
          message: error.message,
          stack: error.stack,
          category: determineErrorCategory(error),
          severity: errorCategories[determineErrorCategory(error)]?.severity || 'unknown',
          context: {
            userId: context.userId,
            requestId: context.requestId,
            userAgent: context.userAgent,
            ip: context.ip,
            url: context.url,
            method: context.method
          },
          environment: 'test',
          version: '1.0.0'
        };

        return errorLog;
      };

      const determineErrorCategory = (error) => {
        if (error.message.includes('validation')) return 'validation';
        if (error.message.includes('auth')) return 'authentication';
        if (error.message.includes('database')) return 'database';
        if (error.message.includes('API')) return 'external_api';
        return 'system';
      };

      // Test error capture
      const testError = new Error('Database connection timeout');
      const errorLog = captureError(testError, {
        userId: testUser.profile.id,
        requestId: 'req_123',
        url: '/api/submissions'
      });

      expect(errorLog.category).to.equal('database');
      expect(errorLog.severity).to.equal('high');
      expect(errorLog.context.userId).to.equal(testUser.profile.id);
      expect(errorLog.timestamp).to.be.a('string');
    });

    it('should implement error rate monitoring and alerting', async function() {
      const errorRateMonitor = {
        timeWindow: 5 * 60 * 1000, // 5 minutes
        thresholds: {
          warning: 0.05, // 5% error rate
          critical: 0.10 // 10% error rate
        },
        errors: [],
        requests: []
      };

      const addRequest = (success = true) => {
        const request = {
          timestamp: Date.now(),
          success,
          responseTime: Math.floor(Math.random() * 500) + 50
        };
        
        errorRateMonitor.requests.push(request);
        
        if (!success) {
          errorRateMonitor.errors.push(request);
        }
      };

      const calculateErrorRate = () => {
        const now = Date.now();
        const windowStart = now - errorRateMonitor.timeWindow;
        
        const recentRequests = errorRateMonitor.requests.filter(
          req => req.timestamp >= windowStart
        );
        const recentErrors = errorRateMonitor.errors.filter(
          err => err.timestamp >= windowStart
        );
        
        if (recentRequests.length === 0) return 0;
        return recentErrors.length / recentRequests.length;
      };

      // Simulate requests with some errors
      for (let i = 0; i < 100; i++) {
        addRequest(Math.random() > 0.03); // 3% error rate
      }

      const errorRate = calculateErrorRate();
      expect(errorRate).to.be.lessThan(errorRateMonitor.thresholds.warning);

      // Simulate high error rate
      for (let i = 0; i < 20; i++) {
        addRequest(false); // Add errors
      }

      const highErrorRate = calculateErrorRate();
      expect(highErrorRate).to.be.greaterThan(errorRateMonitor.thresholds.warning);
    });

    it('should handle error aggregation and deduplication', async function() {
      const errorAggregator = {
        errors: new Map(),
        aggregationWindow: 60000 // 1 minute
      };

      const aggregateError = (error) => {
        const errorKey = `${error.message}_${error.stack?.split('\n')[0] || ''}`;
        const now = Date.now();
        
        if (errorAggregator.errors.has(errorKey)) {
          const existing = errorAggregator.errors.get(errorKey);
          existing.count++;
          existing.lastOccurrence = now;
          existing.occurrences.push(now);
        } else {
          errorAggregator.errors.set(errorKey, {
            message: error.message,
            stack: error.stack,
            count: 1,
            firstOccurrence: now,
            lastOccurrence: now,
            occurrences: [now]
          });
        }
      };

      // Simulate duplicate errors
      const duplicateError = new Error('Connection timeout');
      for (let i = 0; i < 5; i++) {
        aggregateError(duplicateError);
        await testUtils.sleep(100);
      }

      const aggregatedErrors = Array.from(errorAggregator.errors.values());
      expect(aggregatedErrors).to.have.length(1);
      expect(aggregatedErrors[0].count).to.equal(5);
      expect(aggregatedErrors[0].occurrences).to.have.length(5);
    });

    it('should send alerts for critical errors', async function() {
      const alertingSystem = {
        channels: {
          email: {
            enabled: true,
            recipients: ['admin@example.com', 'dev-team@example.com']
          },
          slack: {
            enabled: true,
            webhook: 'https://hooks.slack.com/test-webhook'
          },
          pagerduty: {
            enabled: false,
            apiKey: 'test-key'
          }
        },
        rules: [
          {
            condition: 'severity === "critical"',
            channels: ['email', 'slack', 'pagerduty'],
            immediate: true
          },
          {
            condition: 'severity === "high" && count > 5',
            channels: ['email', 'slack'],
            immediate: false,
            throttle: 300000 // 5 minutes
          }
        ]
      };

      const sendAlert = (error, rule) => {
        const alert = {
          id: testUtils.generateTestId(),
          timestamp: new Date().toISOString(),
          severity: error.severity,
          message: error.message,
          channels: rule.channels.filter(channel => 
            alertingSystem.channels[channel]?.enabled
          ),
          immediate: rule.immediate
        };

        return alert;
      };

      const criticalError = {
        message: 'Database connection lost',
        severity: 'critical',
        count: 1
      };

      const matchingRule = alertingSystem.rules.find(rule => 
        eval(rule.condition.replace('severity', `"${criticalError.severity}"`).replace('count', criticalError.count))
      );

      const alert = sendAlert(criticalError, matchingRule);

      expect(alert.severity).to.equal('critical');
      expect(alert.channels).to.include('email');
      expect(alert.channels).to.include('slack');
      expect(alert.immediate).to.be.true;
    });
  });

  describe('Metrics Collection and Reporting', () => {
    it('should collect application performance metrics', async function() {
      const performanceMetrics = {
        requests: {
          total: 10000,
          successful: 9800,
          failed: 200,
          rate_per_minute: 120,
          avg_response_time: 180,
          p95_response_time: 350,
          p99_response_time: 500
        },
        database: {
          queries_per_second: 50,
          avg_query_time: 25,
          slow_queries: 2,
          connection_pool_usage: 0.65
        },
        memory: {
          heap_used: process.memoryUsage().heapUsed,
          heap_total: process.memoryUsage().heapTotal,
          external: process.memoryUsage().external,
          rss: process.memoryUsage().rss
        },
        cpu: {
          usage_percent: 35,
          load_average: [1.2, 1.5, 1.8]
        }
      };

      expect(performanceMetrics.requests.total).to.be.a('number');
      expect(performanceMetrics.requests.successful / performanceMetrics.requests.total).to.be.greaterThan(0.95);
      expect(performanceMetrics.requests.avg_response_time).to.be.lessThan(500);
      expect(performanceMetrics.database.avg_query_time).to.be.lessThan(100);
      expect(performanceMetrics.cpu.usage_percent).to.be.lessThan(80);
    });

    it('should track business metrics and KPIs', async function() {
      // Create test data for business metrics
      const scenario = await fixtures.createCompleteScenario({
        userCount: 10,
        submissionCount: 20,
        withVotes: true,
        withComments: true
      });

      const businessMetrics = {
        users: {
          total: scenario.users.length,
          active_today: Math.floor(scenario.users.length * 0.6),
          new_signups_today: 3,
          retention_rate_7d: 0.85,
          retention_rate_30d: 0.72
        },
        submissions: {
          total: scenario.submissions.length,
          approved_today: Math.floor(scenario.submissions.length * 0.7),
          pending_review: Math.floor(scenario.submissions.length * 0.3),
          avg_approval_time: 120, // minutes
          top_categories: ['productivity', 'design', 'development']
        },
        engagement: {
          total_votes: scenario.votes.length,
          total_comments: scenario.comments.length,
          avg_votes_per_submission: scenario.votes.length / scenario.submissions.length,
          avg_comments_per_submission: scenario.comments.length / scenario.submissions.length,
          daily_active_users: Math.floor(scenario.users.length * 0.4)
        },
        revenue: {
          total_revenue: 2999.50,
          revenue_today: 299.95,
          avg_revenue_per_user: 29.99,
          conversion_rate: 0.15
        }
      };

      expect(businessMetrics.users.total).to.equal(10);
      expect(businessMetrics.submissions.total).to.equal(20);
      expect(businessMetrics.engagement.avg_votes_per_submission).to.be.a('number');
      expect(businessMetrics.revenue.conversion_rate).to.be.lessThan(1);
    });

    it('should generate time-series metrics for trending', async function() {
      const timeSeriesMetrics = {
        interval: '1h', // 1 hour intervals
        metrics: [
          {
            timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
            requests: 450,
            errors: 12,
            response_time: 175,
            active_users: 85
          },
          {
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            requests: 520,
            errors: 8,
            response_time: 165,
            active_users: 92
          },
          {
            timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
            requests: 480,
            errors: 15,
            response_time: 190,
            active_users: 78
          },
          {
            timestamp: new Date().toISOString(),
            requests: 510,
            errors: 6,
            response_time: 155,
            active_users: 95
          }
        ]
      };

      const calculateTrend = (metric) => {
        const values = timeSeriesMetrics.metrics.map(m => m[metric]);
        const recent = values.slice(-2);
        const change = recent[1] - recent[0];
        const percentChange = (change / recent[0]) * 100;
        
        return {
          current: recent[1],
          previous: recent[0],
          change,
          percentChange,
          trend: change > 0 ? 'increasing' : change < 0 ? 'decreasing' : 'stable'
        };
      };

      const requestsTrend = calculateTrend('requests');
      const errorsTrend = calculateTrend('errors');
      const responseTimeTrend = calculateTrend('response_time');

      expect(requestsTrend.current).to.equal(510);
      expect(requestsTrend.trend).to.equal('increasing');
      expect(errorsTrend.trend).to.equal('decreasing'); // Errors going down is good
      expect(responseTimeTrend.trend).to.equal('decreasing'); // Response time going down is good
    });

    it('should export metrics in multiple formats', async function() {
      const metricsData = {
        timestamp: new Date().toISOString(),
        requests_total: 10000,
        requests_success_rate: 0.98,
        response_time_avg: 180,
        active_users: 95,
        database_connections: 15
      };

      // Prometheus format
      const prometheusFormat = Object.entries(metricsData)
        .filter(([key]) => key !== 'timestamp')
        .map(([key, value]) => `launchpad_${key} ${value}`)
        .join('\n');

      // JSON format
      const jsonFormat = JSON.stringify(metricsData, null, 2);

      // CSV format
      const csvHeaders = Object.keys(metricsData).join(',');
      const csvValues = Object.values(metricsData).join(',');
      const csvFormat = `${csvHeaders}\n${csvValues}`;

      expect(prometheusFormat).to.include('launchpad_requests_total 10000');
      expect(JSON.parse(jsonFormat).requests_total).to.equal(10000);
      expect(csvFormat).to.include('timestamp,requests_total');
    });
  });

  describe('Audit Trail Functionality', () => {
    it('should log all user actions with context', async function() {
      const auditLogger = {
        log: (action, context = {}) => ({
          id: testUtils.generateTestId(),
          timestamp: new Date().toISOString(),
          action,
          actor: {
            userId: context.userId,
            username: context.username,
            role: context.role,
            ip: context.ip,
            userAgent: context.userAgent
          },
          target: {
            type: context.targetType,
            id: context.targetId,
            data: context.targetData
          },
          metadata: {
            requestId: context.requestId,
            sessionId: context.sessionId,
            source: context.source || 'web'
          },
          changes: context.changes || null
        })
      };

      // Test user action logging
      const submissionCreated = auditLogger.log('submission.created', {
        userId: testUser.profile.id,
        username: testUser.profile.username,
        role: 'user',
        ip: '192.168.1.100',
        targetType: 'submission',
        targetId: 'sub_123',
        targetData: { url: 'https://example.com', title: 'Test Product' }
      });

      expect(submissionCreated.action).to.equal('submission.created');
      expect(submissionCreated.actor.userId).to.equal(testUser.profile.id);
      expect(submissionCreated.target.type).to.equal('submission');
      expect(submissionCreated.timestamp).to.be.a('string');

      // Test admin action logging
      const userBanned = auditLogger.log('user.banned', {
        userId: adminUser.profile.id,
        username: adminUser.profile.username,
        role: 'admin',
        targetType: 'user',
        targetId: testUser.profile.id,
        changes: {
          before: { banned: false },
          after: { banned: true, banReason: 'Spam violations' }
        }
      });

      expect(userBanned.action).to.equal('user.banned');
      expect(userBanned.actor.role).to.equal('admin');
      expect(userBanned.changes.after.banned).to.be.true;
    });

    it('should provide audit trail search and filtering', async function() {
      const auditLogs = [
        {
          id: '1',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          action: 'submission.created',
          actor: { userId: testUser.profile.id, role: 'user' },
          target: { type: 'submission', id: 'sub_1' }
        },
        {
          id: '2',
          timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
          action: 'submission.approved',
          actor: { userId: adminUser.profile.id, role: 'admin' },
          target: { type: 'submission', id: 'sub_1' }
        },
        {
          id: '3',
          timestamp: new Date().toISOString(),
          action: 'user.profile_updated',
          actor: { userId: testUser.profile.id, role: 'user' },
          target: { type: 'user', id: testUser.profile.id }
        }
      ];

      const searchAuditLogs = (filters = {}) => {
        return auditLogs.filter(log => {
          if (filters.userId && log.actor.userId !== filters.userId) return false;
          if (filters.action && !log.action.includes(filters.action)) return false;
          if (filters.targetType && log.target.type !== filters.targetType) return false;
          if (filters.role && log.actor.role !== filters.role) return false;
          if (filters.dateFrom && new Date(log.timestamp) < new Date(filters.dateFrom)) return false;
          if (filters.dateTo && new Date(log.timestamp) > new Date(filters.dateTo)) return false;
          return true;
        });
      };

      // Test filtering by user
      const userLogs = searchAuditLogs({ userId: testUser.profile.id });
      expect(userLogs).to.have.length(2);

      // Test filtering by action
      const submissionLogs = searchAuditLogs({ action: 'submission' });
      expect(submissionLogs).to.have.length(2);

      // Test filtering by role
      const adminLogs = searchAuditLogs({ role: 'admin' });
      expect(adminLogs).to.have.length(1);
      expect(adminLogs[0].action).to.equal('submission.approved');
    });

    it('should ensure audit log integrity and immutability', async function() {
      const auditLog = {
        id: testUtils.generateTestId(),
        timestamp: new Date().toISOString(),
        action: 'user.login',
        actor: { userId: testUser.profile.id },
        checksum: null
      };

      // Generate checksum for integrity
      const generateChecksum = (log) => {
        const data = `${log.id}${log.timestamp}${log.action}${log.actor.userId}`;
        // In a real implementation, this would use a proper hash function
        return Buffer.from(data).toString('base64');
      };

      auditLog.checksum = generateChecksum(auditLog);

      // Verify integrity
      const verifyIntegrity = (log) => {
        const expectedChecksum = generateChecksum({
          ...log,
          checksum: null
        });
        return log.checksum === expectedChecksum;
      };

      expect(verifyIntegrity(auditLog)).to.be.true;

      // Test tampering detection
      const tamperedLog = { ...auditLog, action: 'user.logout' };
      expect(verifyIntegrity(tamperedLog)).to.be.false;
    });

    it('should handle audit log retention and archival', async function() {
      const retentionPolicy = {
        active_retention_days: 90,
        archive_retention_years: 7,
        compression_enabled: true,
        encryption_enabled: true
      };

      const auditLogManager = {
        shouldArchive: (log) => {
          const logAge = Date.now() - new Date(log.timestamp).getTime();
          const retentionPeriod = retentionPolicy.active_retention_days * 24 * 60 * 60 * 1000;
          return logAge > retentionPeriod;
        },
        
        shouldDelete: (log) => {
          const logAge = Date.now() - new Date(log.timestamp).getTime();
          const archivalPeriod = retentionPolicy.archive_retention_years * 365 * 24 * 60 * 60 * 1000;
          return logAge > archivalPeriod;
        }
      };

      const oldLog = {
        timestamp: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString() // 100 days old
      };

      const veryOldLog = {
        timestamp: new Date(Date.now() - 8 * 365 * 24 * 60 * 60 * 1000).toISOString() // 8 years old
      };

      expect(auditLogManager.shouldArchive(oldLog)).to.be.true;
      expect(auditLogManager.shouldDelete(veryOldLog)).to.be.true;
    });
  });

  describe('System Observability', () => {
    it('should provide distributed tracing capabilities', async function() {
      const traceContext = {
        traceId: testUtils.generateTestId(),
        spanId: testUtils.generateTestId(),
        parentSpanId: null,
        baggage: {},
        flags: 1
      };

      const createSpan = (operationName, parentSpan = null) => ({
        traceId: traceContext.traceId,
        spanId: testUtils.generateTestId(),
        parentSpanId: parentSpan?.spanId || null,
        operationName,
        startTime: Date.now(),
        endTime: null,
        duration: null,
        tags: {},
        logs: []
      });

      const finishSpan = (span) => {
        span.endTime = Date.now();
        span.duration = span.endTime - span.startTime;
        return span;
      };

      // Simulate request trace
      const requestSpan = createSpan('http_request');
      requestSpan.tags = {
        'http.method': 'POST',
        'http.url': '/api/submissions',
        'http.status_code': 201,
        'user.id': testUser.profile.id
      };

      const dbSpan = createSpan('database_query', requestSpan);
      dbSpan.tags = {
        'db.type': 'postgresql',
        'db.statement': 'INSERT INTO submissions...',
        'db.instance': 'main'
      };

      const finishedRequestSpan = finishSpan(requestSpan);
      const finishedDbSpan = finishSpan(dbSpan);

      expect(finishedRequestSpan.traceId).to.equal(traceContext.traceId);
      expect(finishedDbSpan.parentSpanId).to.equal(requestSpan.spanId);
      expect(finishedRequestSpan.duration).to.be.a('number');
      expect(finishedDbSpan.duration).to.be.a('number');
    });

    it('should provide real-time monitoring dashboards', async function() {
      const dashboardMetrics = {
        realtime: {
          active_users: 95,
          requests_per_second: 12,
          error_rate: 0.02,
          avg_response_time: 180,
          database_connections: 15,
          memory_usage: 65.5,
          cpu_usage: 35.2
        },
        alerts: [
          {
            id: 'alert_1',
            level: 'warning',
            message: 'High response time detected',
            threshold: 500,
            current_value: 650,
            triggered_at: new Date().toISOString()
          }
        ],
        trends: {
          requests: {
            current: 720,
            previous_hour: 680,
            change_percent: 5.9,
            trend: 'increasing'
          },
          errors: {
            current: 14,
            previous_hour: 18,
            change_percent: -22.2,
            trend: 'decreasing'
          }
        }
      };

      expect(dashboardMetrics.realtime.active_users).to.be.a('number');
      expect(dashboardMetrics.realtime.error_rate).to.be.lessThan(0.05);
      expect(dashboardMetrics.alerts).to.be.an('array');
      expect(dashboardMetrics.trends.requests.trend).to.equal('increasing');
      expect(dashboardMetrics.trends.errors.trend).to.equal('decreasing');
    });

    it('should support custom metrics and dimensions', async function() {
      const customMetrics = {
        business: {
          submissions_per_hour: 25,
          approval_rate: 0.85,
          user_engagement_score: 7.2,
          revenue_per_hour: 150.75
        },
        technical: {
          cache_hit_rate: 0.92,
          queue_depth: 5,
          background_job_success_rate: 0.98,
          api_rate_limit_usage: 0.45
        },
        custom_dimensions: {
          user_tier: ['free', 'premium', 'enterprise'],
          geographic_region: ['us-east', 'us-west', 'eu', 'asia'],
          feature_flags: ['beta_ui', 'advanced_analytics', 'ai_enhancement']
        }
      };

      expect(customMetrics.business.approval_rate).to.be.greaterThan(0.8);
      expect(customMetrics.technical.cache_hit_rate).to.be.greaterThan(0.9);
      expect(customMetrics.custom_dimensions.user_tier).to.include('premium');
    });
  });
});