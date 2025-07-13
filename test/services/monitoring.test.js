import { expect } from 'chai';
import sinon from 'sinon';
import { MonitoringService } from '../../src/lib/services/monitoring.js';

describe('Monitoring Service', () => {
  let monitoring;
  let sandbox;
  let mockLogger;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    mockLogger = {
      info: sandbox.spy(),
      warn: sandbox.spy(),
      error: sandbox.spy(),
      performance: sandbox.spy()
    };
    monitoring = new MonitoringService({ logger: mockLogger });
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('Health Checks', () => {
    it('should perform basic health check', async () => {
      const health = await monitoring.getHealthStatus();
      
      expect(health).to.have.property('status');
      expect(health).to.have.property('timestamp');
      expect(health).to.have.property('uptime');
      expect(health).to.have.property('version');
      expect(health).to.have.property('environment');
    });

    it('should include system metrics in health check', async () => {
      const health = await monitoring.getHealthStatus();
      
      expect(health).to.have.property('system');
      expect(health.system).to.have.property('memory');
      expect(health.system).to.have.property('cpu');
      expect(health.system).to.have.property('disk');
    });

    it('should check database connectivity', async () => {
      const mockDbCheck = sandbox.stub().resolves(true);
      monitoring.addHealthCheck('database', mockDbCheck);
      
      const health = await monitoring.getHealthStatus();
      
      expect(health.checks).to.have.property('database');
      expect(health.checks.database.status).to.equal('healthy');
    });

    it('should handle failed health checks', async () => {
      const mockDbCheck = sandbox.stub().rejects(new Error('Connection failed'));
      monitoring.addHealthCheck('database', mockDbCheck);
      
      const health = await monitoring.getHealthStatus();
      
      expect(health.checks.database.status).to.equal('unhealthy');
      expect(health.checks.database.error).to.equal('Connection failed');
    });

    it('should determine overall health status', async () => {
      const mockHealthyCheck = sandbox.stub().resolves(true);
      const mockUnhealthyCheck = sandbox.stub().rejects(new Error('Failed'));
      
      monitoring.addHealthCheck('service1', mockHealthyCheck);
      monitoring.addHealthCheck('service2', mockUnhealthyCheck);
      
      const health = await monitoring.getHealthStatus();
      
      expect(health.status).to.equal('degraded');
    });
  });

  describe('System Metrics', () => {
    it('should collect memory metrics', async () => {
      const metrics = await monitoring.getSystemMetrics();
      
      expect(metrics.memory).to.have.property('used');
      expect(metrics.memory).to.have.property('free');
      expect(metrics.memory).to.have.property('total');
      expect(metrics.memory).to.have.property('percentage');
    });

    it('should collect CPU metrics', async () => {
      const metrics = await monitoring.getSystemMetrics();
      
      expect(metrics.cpu).to.have.property('usage');
      expect(metrics.cpu).to.have.property('loadAverage');
      expect(metrics.cpu).to.have.property('cores');
    });

    it('should collect disk metrics', async () => {
      const metrics = await monitoring.getSystemMetrics();
      
      expect(metrics.disk).to.have.property('used');
      expect(metrics.disk).to.have.property('free');
      expect(metrics.disk).to.have.property('total');
      expect(metrics.disk).to.have.property('percentage');
    });

    it('should collect process metrics', async () => {
      const metrics = await monitoring.getSystemMetrics();
      
      expect(metrics.process).to.have.property('pid');
      expect(metrics.process).to.have.property('uptime');
      expect(metrics.process).to.have.property('memory');
      expect(metrics.process).to.have.property('cpu');
    });
  });

  describe('Performance Monitoring', () => {
    it('should track request metrics', () => {
      monitoring.trackRequest('/api/users', 'GET', 200, 150);
      monitoring.trackRequest('/api/users', 'GET', 200, 200);
      monitoring.trackRequest('/api/users', 'POST', 201, 300);
      
      const metrics = monitoring.getRequestMetrics();
      
      expect(metrics.total).to.equal(3);
      expect(metrics.byEndpoint['/api/users']).to.exist;
      expect(metrics.byMethod.GET).to.equal(2);
      expect(metrics.byStatus['200']).to.equal(2);
    });

    it('should calculate response time statistics', () => {
      monitoring.trackRequest('/api/test', 'GET', 200, 100);
      monitoring.trackRequest('/api/test', 'GET', 200, 200);
      monitoring.trackRequest('/api/test', 'GET', 200, 300);
      
      const stats = monitoring.getResponseTimeStats('/api/test');
      
      expect(stats.average).to.equal(200);
      expect(stats.min).to.equal(100);
      expect(stats.max).to.equal(300);
      expect(stats.count).to.equal(3);
    });

    it('should track error rates', () => {
      monitoring.trackRequest('/api/test', 'GET', 200, 100);
      monitoring.trackRequest('/api/test', 'GET', 500, 150);
      monitoring.trackRequest('/api/test', 'GET', 404, 50);
      
      const errorRate = monitoring.getErrorRate('/api/test');
      
      expect(errorRate).to.be.closeTo(0.67, 0.01); // 2 errors out of 3 requests
    });
  });

  describe('Application Performance Monitoring', () => {
    it('should start and end performance measurements', () => {
      const timer = monitoring.startTimer('database_query');
      
      expect(timer).to.have.property('start');
      expect(timer).to.have.property('end');
      expect(typeof timer.end).to.equal('function');
    });

    it('should record performance measurements', () => {
      const timer = monitoring.startTimer('test_operation');
      timer.end({ query: 'SELECT * FROM users' });
      
      expect(mockLogger.performance.called).to.be.true;
    });

    it('should track custom metrics', () => {
      monitoring.recordMetric('active_users', 150);
      monitoring.recordMetric('queue_size', 25);
      
      const metrics = monitoring.getCustomMetrics();
      
      expect(metrics.active_users).to.equal(150);
      expect(metrics.queue_size).to.equal(25);
    });

    it('should increment counters', () => {
      monitoring.incrementCounter('login_attempts');
      monitoring.incrementCounter('login_attempts');
      monitoring.incrementCounter('failed_logins');
      
      const counters = monitoring.getCounters();
      
      expect(counters.login_attempts).to.equal(2);
      expect(counters.failed_logins).to.equal(1);
    });
  });

  describe('Alerting', () => {
    it('should trigger alerts for high error rates', () => {
      const alertSpy = sandbox.spy();
      monitoring.onAlert(alertSpy);
      
      // Simulate high error rate
      for (let i = 0; i < 10; i++) {
        monitoring.trackRequest('/api/test', 'GET', 500, 100);
      }
      
      expect(alertSpy.called).to.be.true;
    });

    it('should trigger alerts for high response times', () => {
      const alertSpy = sandbox.spy();
      monitoring.onAlert(alertSpy);
      
      // Simulate high response times
      monitoring.trackRequest('/api/test', 'GET', 200, 5000);
      
      expect(alertSpy.called).to.be.true;
    });

    it('should trigger alerts for system resource usage', async () => {
      const alertSpy = sandbox.spy();
      monitoring.onAlert(alertSpy);
      
      // Mock high memory usage
      sandbox.stub(monitoring, 'getSystemMetrics').resolves({
        memory: { percentage: 95 },
        cpu: { usage: 50 },
        disk: { percentage: 60 }
      });
      
      await monitoring.checkSystemAlerts();
      
      expect(alertSpy.called).to.be.true;
    });
  });

  describe('Metrics Export', () => {
    it('should export metrics in Prometheus format', () => {
      monitoring.trackRequest('/api/users', 'GET', 200, 150);
      monitoring.recordMetric('active_users', 100);
      monitoring.incrementCounter('requests_total');
      
      const prometheus = monitoring.exportPrometheusMetrics();
      
      expect(prometheus).to.include('http_requests_total');
      expect(prometheus).to.include('http_request_duration_seconds');
      expect(prometheus).to.include('active_users');
      expect(prometheus).to.include('requests_total');
    });

    it('should export metrics as JSON', () => {
      monitoring.trackRequest('/api/users', 'GET', 200, 150);
      monitoring.recordMetric('active_users', 100);
      
      const json = monitoring.exportJsonMetrics();
      
      expect(json).to.have.property('requests');
      expect(json).to.have.property('customMetrics');
      expect(json).to.have.property('counters');
      expect(json).to.have.property('timestamp');
    });
  });

  describe('Monitoring Dashboard Data', () => {
    it('should provide dashboard overview', async () => {
      monitoring.trackRequest('/api/users', 'GET', 200, 150);
      monitoring.trackRequest('/api/posts', 'POST', 201, 200);
      
      const overview = await monitoring.getDashboardOverview();
      
      expect(overview).to.have.property('health');
      expect(overview).to.have.property('requests');
      expect(overview).to.have.property('system');
      expect(overview).to.have.property('errors');
    });

    it('should provide time-series data', () => {
      const now = Date.now();
      monitoring.trackRequest('/api/test', 'GET', 200, 100, now - 60000);
      monitoring.trackRequest('/api/test', 'GET', 200, 150, now - 30000);
      monitoring.trackRequest('/api/test', 'GET', 500, 200, now);
      
      const timeSeries = monitoring.getTimeSeriesData('1h');
      
      expect(timeSeries).to.be.an('array');
      expect(timeSeries.length).to.be.greaterThan(0);
    });
  });
});