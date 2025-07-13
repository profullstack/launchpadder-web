import os from 'os';
import fs from 'fs/promises';
import { performance } from 'perf_hooks';
import si from 'systeminformation';
import { logger } from './logger.js';

/**
 * Comprehensive application monitoring service
 */
export class MonitoringService {
  constructor(config = {}) {
    this.config = {
      logger: config.logger || logger,
      alertThresholds: {
        errorRate: config.errorRateThreshold || 0.05, // 5%
        responseTime: config.responseTimeThreshold || 2000, // 2 seconds
        memoryUsage: config.memoryThreshold || 90, // 90%
        cpuUsage: config.cpuThreshold || 80, // 80%
        diskUsage: config.diskThreshold || 85, // 85%
        ...config.alertThresholds
      },
      metricsRetention: config.metricsRetention || 24 * 60 * 60 * 1000, // 24 hours
      ...config
    };

    this.healthChecks = new Map();
    this.requestMetrics = {
      total: 0,
      byEndpoint: {},
      byMethod: {},
      byStatus: {},
      responseTimes: {},
      errors: {},
      timeSeries: []
    };
    this.customMetrics = {};
    this.counters = {};
    this.alertHandlers = [];
    this.startTime = Date.now();

    // Start periodic system monitoring
    this.startSystemMonitoring();
  }

  /**
   * Add a health check
   */
  addHealthCheck(name, checkFunction, timeout = 5000) {
    this.healthChecks.set(name, {
      check: checkFunction,
      timeout,
      lastCheck: null,
      lastResult: null
    });
  }

  /**
   * Remove a health check
   */
  removeHealthCheck(name) {
    this.healthChecks.delete(name);
  }

  /**
   * Get comprehensive health status
   */
  async getHealthStatus() {
    const checks = {};
    let overallStatus = 'healthy';

    // Run all health checks
    for (const [name, healthCheck] of this.healthChecks) {
      try {
        const startTime = performance.now();
        const result = await Promise.race([
          healthCheck.check(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), healthCheck.timeout)
          )
        ]);

        const duration = performance.now() - startTime;
        checks[name] = {
          status: 'healthy',
          duration: Math.round(duration),
          timestamp: new Date().toISOString()
        };

        healthCheck.lastCheck = Date.now();
        healthCheck.lastResult = 'healthy';
      } catch (error) {
        checks[name] = {
          status: 'unhealthy',
          error: error.message,
          timestamp: new Date().toISOString()
        };

        healthCheck.lastCheck = Date.now();
        healthCheck.lastResult = 'unhealthy';
        
        if (overallStatus === 'healthy') {
          overallStatus = 'degraded';
        }
      }
    }

    // If any critical checks fail, mark as unhealthy
    const unhealthyChecks = Object.values(checks).filter(check => check.status === 'unhealthy');
    if (unhealthyChecks.length > 0) {
      overallStatus = unhealthyChecks.length === Object.keys(checks).length ? 'unhealthy' : 'degraded';
    }

    // Get system metrics
    const systemMetrics = await this.getSystemMetrics();

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      system: systemMetrics,
      checks
    };
  }

  /**
   * Get system metrics (CPU, memory, disk)
   */
  async getSystemMetrics() {
    try {
      const [memInfo, cpuInfo, diskInfo, processInfo] = await Promise.all([
        si.mem(),
        si.currentLoad(),
        si.fsSize(),
        si.processes()
      ]);

      const totalDisk = diskInfo.reduce((acc, disk) => ({
        size: acc.size + disk.size,
        used: acc.used + disk.used,
        available: acc.available + disk.available
      }), { size: 0, used: 0, available: 0 });

      const currentProcess = processInfo.list.find(p => p.pid === process.pid) || {};

      return {
        memory: {
          total: memInfo.total,
          free: memInfo.free,
          used: memInfo.used,
          percentage: Math.round((memInfo.used / memInfo.total) * 100)
        },
        cpu: {
          usage: Math.round(cpuInfo.currentLoad),
          loadAverage: os.loadavg(),
          cores: os.cpus().length
        },
        disk: {
          total: totalDisk.size,
          used: totalDisk.used,
          free: totalDisk.available,
          percentage: Math.round((totalDisk.used / totalDisk.size) * 100)
        },
        process: {
          pid: process.pid,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: currentProcess.cpu || 0
        }
      };
    } catch (error) {
      this.config.logger.error('Failed to get system metrics', { error });
      return {
        memory: { total: 0, free: 0, used: 0, percentage: 0 },
        cpu: { usage: 0, loadAverage: [0, 0, 0], cores: 0 },
        disk: { total: 0, used: 0, free: 0, percentage: 0 },
        process: { pid: process.pid, uptime: process.uptime(), memory: process.memoryUsage(), cpu: 0 }
      };
    }
  }

  /**
   * Track HTTP request metrics
   */
  trackRequest(endpoint, method, statusCode, responseTime, timestamp = Date.now()) {
    this.requestMetrics.total++;

    // Track by endpoint
    if (!this.requestMetrics.byEndpoint[endpoint]) {
      this.requestMetrics.byEndpoint[endpoint] = { count: 0, totalTime: 0, errors: 0 };
    }
    this.requestMetrics.byEndpoint[endpoint].count++;
    this.requestMetrics.byEndpoint[endpoint].totalTime += responseTime;

    // Track by method
    this.requestMetrics.byMethod[method] = (this.requestMetrics.byMethod[method] || 0) + 1;

    // Track by status code
    this.requestMetrics.byStatus[statusCode] = (this.requestMetrics.byStatus[statusCode] || 0) + 1;

    // Track response times
    if (!this.requestMetrics.responseTimes[endpoint]) {
      this.requestMetrics.responseTimes[endpoint] = [];
    }
    this.requestMetrics.responseTimes[endpoint].push(responseTime);

    // Track errors
    if (statusCode >= 400) {
      this.requestMetrics.byEndpoint[endpoint].errors++;
      if (!this.requestMetrics.errors[endpoint]) {
        this.requestMetrics.errors[endpoint] = 0;
      }
      this.requestMetrics.errors[endpoint]++;
    }

    // Add to time series
    this.requestMetrics.timeSeries.push({
      timestamp,
      endpoint,
      method,
      statusCode,
      responseTime
    });

    // Clean up old time series data
    this.cleanupTimeSeries();

    // Check for alerts
    this.checkRequestAlerts(endpoint, statusCode, responseTime);

    // Log performance metrics
    this.config.logger.performance(`${method} ${endpoint}`, responseTime, {
      statusCode,
      endpoint,
      method
    });
  }

  /**
   * Get request metrics
   */
  getRequestMetrics() {
    return {
      total: this.requestMetrics.total,
      byEndpoint: { ...this.requestMetrics.byEndpoint },
      byMethod: { ...this.requestMetrics.byMethod },
      byStatus: { ...this.requestMetrics.byStatus }
    };
  }

  /**
   * Get response time statistics for an endpoint
   */
  getResponseTimeStats(endpoint) {
    const times = this.requestMetrics.responseTimes[endpoint] || [];
    if (times.length === 0) {
      return { average: 0, min: 0, max: 0, count: 0 };
    }

    const sorted = [...times].sort((a, b) => a - b);
    return {
      average: Math.round(times.reduce((sum, time) => sum + time, 0) / times.length),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      count: times.length
    };
  }

  /**
   * Get error rate for an endpoint
   */
  getErrorRate(endpoint) {
    const endpointData = this.requestMetrics.byEndpoint[endpoint];
    if (!endpointData || endpointData.count === 0) {
      return 0;
    }
    return endpointData.errors / endpointData.count;
  }

  /**
   * Start a performance timer
   */
  startTimer(operation) {
    const start = performance.now();
    return {
      start,
      end: (metadata = {}) => {
        const duration = performance.now() - start;
        this.config.logger.performance(operation, Math.round(duration), metadata);
        return duration;
      }
    };
  }

  /**
   * Record a custom metric
   */
  recordMetric(name, value, timestamp = Date.now()) {
    if (!this.customMetrics[name]) {
      this.customMetrics[name] = [];
    }
    this.customMetrics[name].push({ value, timestamp });
    
    // Keep only recent values
    const cutoff = timestamp - this.config.metricsRetention;
    this.customMetrics[name] = this.customMetrics[name].filter(m => m.timestamp > cutoff);
    
    // Store current value for quick access
    this.customMetrics[name].current = value;
  }

  /**
   * Get custom metrics
   */
  getCustomMetrics() {
    const current = {};
    for (const [name, values] of Object.entries(this.customMetrics)) {
      current[name] = values.current || (values.length > 0 ? values[values.length - 1].value : 0);
    }
    return current;
  }

  /**
   * Increment a counter
   */
  incrementCounter(name, value = 1) {
    this.counters[name] = (this.counters[name] || 0) + value;
  }

  /**
   * Get counters
   */
  getCounters() {
    return { ...this.counters };
  }

  /**
   * Add alert handler
   */
  onAlert(handler) {
    this.alertHandlers.push(handler);
  }

  /**
   * Trigger an alert
   */
  triggerAlert(type, message, data = {}) {
    const alert = {
      type,
      message,
      data,
      timestamp: new Date().toISOString(),
      severity: this.getAlertSeverity(type, data)
    };

    this.config.logger.warn(`Alert: ${type} - ${message}`, alert);

    for (const handler of this.alertHandlers) {
      try {
        handler(alert);
      } catch (error) {
        this.config.logger.error('Alert handler failed', { error });
      }
    }
  }

  /**
   * Get alert severity
   */
  getAlertSeverity(type, data) {
    switch (type) {
      case 'high_error_rate':
        return data.errorRate > 0.2 ? 'critical' : 'warning';
      case 'high_response_time':
        return data.responseTime > 5000 ? 'critical' : 'warning';
      case 'high_memory_usage':
        return data.percentage > 95 ? 'critical' : 'warning';
      case 'high_cpu_usage':
        return data.percentage > 90 ? 'critical' : 'warning';
      case 'high_disk_usage':
        return data.percentage > 95 ? 'critical' : 'warning';
      default:
        return 'info';
    }
  }

  /**
   * Check for request-based alerts
   */
  checkRequestAlerts(endpoint, statusCode, responseTime) {
    // Check error rate
    const errorRate = this.getErrorRate(endpoint);
    if (errorRate > this.config.alertThresholds.errorRate) {
      this.triggerAlert('high_error_rate', `High error rate for ${endpoint}`, {
        endpoint,
        errorRate,
        threshold: this.config.alertThresholds.errorRate
      });
    }

    // Check response time
    if (responseTime > this.config.alertThresholds.responseTime) {
      this.triggerAlert('high_response_time', `High response time for ${endpoint}`, {
        endpoint,
        responseTime,
        threshold: this.config.alertThresholds.responseTime
      });
    }
  }

  /**
   * Check for system-based alerts
   */
  async checkSystemAlerts() {
    try {
      const metrics = await this.getSystemMetrics();

      // Check memory usage
      if (metrics.memory.percentage > this.config.alertThresholds.memoryUsage) {
        this.triggerAlert('high_memory_usage', 'High memory usage detected', {
          percentage: metrics.memory.percentage,
          threshold: this.config.alertThresholds.memoryUsage
        });
      }

      // Check CPU usage
      if (metrics.cpu.usage > this.config.alertThresholds.cpuUsage) {
        this.triggerAlert('high_cpu_usage', 'High CPU usage detected', {
          percentage: metrics.cpu.usage,
          threshold: this.config.alertThresholds.cpuUsage
        });
      }

      // Check disk usage
      if (metrics.disk.percentage > this.config.alertThresholds.diskUsage) {
        this.triggerAlert('high_disk_usage', 'High disk usage detected', {
          percentage: metrics.disk.percentage,
          threshold: this.config.alertThresholds.diskUsage
        });
      }
    } catch (error) {
      this.config.logger.error('Failed to check system alerts', { error });
    }
  }

  /**
   * Start periodic system monitoring
   */
  startSystemMonitoring() {
    // Check system alerts every 30 seconds
    setInterval(() => {
      this.checkSystemAlerts();
    }, 30000);

    // Clean up old metrics every 5 minutes
    setInterval(() => {
      this.cleanupMetrics();
    }, 5 * 60 * 1000);
  }

  /**
   * Clean up old time series data
   */
  cleanupTimeSeries() {
    const cutoff = Date.now() - this.config.metricsRetention;
    this.requestMetrics.timeSeries = this.requestMetrics.timeSeries.filter(
      entry => entry.timestamp > cutoff
    );
  }

  /**
   * Clean up old metrics
   */
  cleanupMetrics() {
    const cutoff = Date.now() - this.config.metricsRetention;
    
    // Clean up custom metrics
    for (const [name, values] of Object.entries(this.customMetrics)) {
      if (Array.isArray(values)) {
        this.customMetrics[name] = values.filter(m => m.timestamp > cutoff);
      }
    }

    // Clean up response times (keep only recent ones)
    for (const [endpoint, times] of Object.entries(this.requestMetrics.responseTimes)) {
      if (times.length > 1000) {
        this.requestMetrics.responseTimes[endpoint] = times.slice(-1000);
      }
    }
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusMetrics() {
    let output = '';

    // HTTP request metrics
    output += '# HELP http_requests_total Total number of HTTP requests\n';
    output += '# TYPE http_requests_total counter\n';
    for (const [endpoint, data] of Object.entries(this.requestMetrics.byEndpoint)) {
      output += `http_requests_total{endpoint="${endpoint}"} ${data.count}\n`;
    }

    // HTTP request duration
    output += '# HELP http_request_duration_seconds HTTP request duration in seconds\n';
    output += '# TYPE http_request_duration_seconds histogram\n';
    for (const [endpoint, data] of Object.entries(this.requestMetrics.byEndpoint)) {
      const avgTime = data.totalTime / data.count / 1000; // Convert to seconds
      output += `http_request_duration_seconds{endpoint="${endpoint}"} ${avgTime}\n`;
    }

    // Custom metrics
    for (const [name, value] of Object.entries(this.getCustomMetrics())) {
      output += `# HELP ${name} Custom metric\n`;
      output += `# TYPE ${name} gauge\n`;
      output += `${name} ${value}\n`;
    }

    // Counters
    for (const [name, value] of Object.entries(this.counters)) {
      output += `# HELP ${name} Counter metric\n`;
      output += `# TYPE ${name} counter\n`;
      output += `${name} ${value}\n`;
    }

    return output;
  }

  /**
   * Export metrics as JSON
   */
  exportJsonMetrics() {
    return {
      timestamp: new Date().toISOString(),
      requests: this.getRequestMetrics(),
      customMetrics: this.getCustomMetrics(),
      counters: this.getCounters(),
      uptime: Date.now() - this.startTime
    };
  }

  /**
   * Get dashboard overview data
   */
  async getDashboardOverview() {
    const health = await this.getHealthStatus();
    const requests = this.getRequestMetrics();
    const system = await this.getSystemMetrics();

    // Calculate error rate
    const totalErrors = Object.values(this.requestMetrics.byStatus)
      .filter((_, index) => Object.keys(this.requestMetrics.byStatus)[index] >= '400')
      .reduce((sum, count) => sum + count, 0);
    const errorRate = requests.total > 0 ? totalErrors / requests.total : 0;

    return {
      health: {
        status: health.status,
        uptime: health.uptime,
        checks: Object.keys(health.checks).length
      },
      requests: {
        total: requests.total,
        errorRate: Math.round(errorRate * 100) / 100,
        endpoints: Object.keys(requests.byEndpoint).length
      },
      system: {
        memory: system.memory.percentage,
        cpu: system.cpu.usage,
        disk: system.disk.percentage
      },
      errors: {
        total: totalErrors,
        rate: errorRate
      }
    };
  }

  /**
   * Get time series data for charts
   */
  getTimeSeriesData(timeRange = '1h') {
    const now = Date.now();
    const ranges = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000
    };

    const cutoff = now - (ranges[timeRange] || ranges['1h']);
    return this.requestMetrics.timeSeries.filter(entry => entry.timestamp > cutoff);
  }

  /**
   * Reset all metrics
   */
  resetMetrics() {
    this.requestMetrics = {
      total: 0,
      byEndpoint: {},
      byMethod: {},
      byStatus: {},
      responseTimes: {},
      errors: {},
      timeSeries: []
    };
    this.customMetrics = {};
    this.counters = {};
  }
}

// Create default monitoring instance
export const monitoring = new MonitoringService();

// Export convenience functions
export const trackRequest = (endpoint, method, statusCode, responseTime) =>
  monitoring.trackRequest(endpoint, method, statusCode, responseTime);

export const startTimer = (operation) => monitoring.startTimer(operation);

export const recordMetric = (name, value) => monitoring.recordMetric(name, value);

export const incrementCounter = (name, value) => monitoring.incrementCounter(name, value);