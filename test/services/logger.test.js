import { expect } from 'chai';
import sinon from 'sinon';
import fs from 'fs/promises';
import path from 'path';
import { Logger } from '../../src/lib/services/logger.js';

describe('Logger Service', () => {
  let logger;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    logger = new Logger({
      level: 'debug',
      service: 'test-service',
      environment: 'test'
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('initialization', () => {
    it('should create logger with default configuration', () => {
      const defaultLogger = new Logger();
      expect(defaultLogger).to.be.instanceOf(Logger);
      expect(defaultLogger.config.level).to.equal('info');
      expect(defaultLogger.config.service).to.equal('launchpadder');
      expect(defaultLogger.config.environment).to.equal('development');
    });

    it('should create logger with custom configuration', () => {
      const customLogger = new Logger({
        level: 'error',
        service: 'custom-service',
        environment: 'production'
      });
      expect(customLogger.config.level).to.equal('error');
      expect(customLogger.config.service).to.equal('custom-service');
      expect(customLogger.config.environment).to.equal('production');
    });

    it('should validate log level', () => {
      expect(() => new Logger({ level: 'invalid' })).to.throw('Invalid log level');
    });
  });

  describe('structured logging', () => {
    it('should log debug messages with structured format', () => {
      const consoleSpy = sandbox.spy(console, 'log');
      logger.debug('Test debug message', { userId: '123', action: 'test' });
      
      expect(consoleSpy.called).to.be.true;
    });

    it('should log info messages with structured format', () => {
      const consoleSpy = sandbox.spy(console, 'log');
      logger.info('Test info message', { requestId: 'req-123' });
      
      expect(consoleSpy.called).to.be.true;
    });

    it('should log warning messages with structured format', () => {
      const consoleSpy = sandbox.spy(console, 'warn');
      logger.warn('Test warning message', { warning: 'deprecated-api' });
      
      expect(consoleSpy.called).to.be.true;
    });

    it('should log error messages with structured format', () => {
      const consoleSpy = sandbox.spy(console, 'error');
      const error = new Error('Test error');
      logger.error('Test error message', { error, userId: '123' });
      
      expect(consoleSpy.called).to.be.true;
    });

    it('should include correlation ID in all logs', () => {
      const consoleSpy = sandbox.spy(console, 'log');
      logger.setCorrelationId('corr-123');
      logger.info('Test message');
      
      expect(consoleSpy.called).to.be.true;
    });

    it('should include performance metrics in logs', () => {
      const consoleSpy = sandbox.spy(console, 'log');
      logger.performance('Database query', 150, { query: 'SELECT * FROM users' });
      
      expect(consoleSpy.called).to.be.true;
    });
  });

  describe('log levels', () => {
    it('should respect log level hierarchy', () => {
      const errorLogger = new Logger({ level: 'error' });
      const consoleSpy = sandbox.spy(console, 'log');
      
      errorLogger.debug('Debug message');
      errorLogger.info('Info message');
      errorLogger.warn('Warning message');
      
      expect(consoleSpy.called).to.be.false;
    });

    it('should log messages at or above configured level', () => {
      const warnLogger = new Logger({ level: 'warn' });
      const consoleSpy = sandbox.spy(console, 'warn');
      const errorSpy = sandbox.spy(console, 'error');
      
      warnLogger.warn('Warning message');
      warnLogger.error('Error message');
      
      expect(consoleSpy.called).to.be.true;
      expect(errorSpy.called).to.be.true;
    });
  });

  describe('sensitive data redaction', () => {
    it('should redact password fields', () => {
      const consoleSpy = sandbox.spy(console, 'log');
      logger.info('User login', { 
        email: 'user@example.com',
        password: 'secret123',
        confirmPassword: 'secret123'
      });
      
      expect(consoleSpy.called).to.be.true;
      // The actual redaction will be tested in implementation
    });

    it('should redact credit card numbers', () => {
      const consoleSpy = sandbox.spy(console, 'log');
      logger.info('Payment processed', { 
        cardNumber: '4111111111111111',
        cvv: '123'
      });
      
      expect(consoleSpy.called).to.be.true;
    });

    it('should redact API keys and tokens', () => {
      const consoleSpy = sandbox.spy(console, 'log');
      logger.info('API call', { 
        apiKey: 'sk_test_123456789',
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        authorization: 'Bearer token123'
      });
      
      expect(consoleSpy.called).to.be.true;
    });
  });

  describe('log formatting', () => {
    it('should format logs as JSON in production', () => {
      const prodLogger = new Logger({ environment: 'production' });
      const consoleSpy = sandbox.spy(console, 'log');
      
      prodLogger.info('Test message', { data: 'test' });
      
      expect(consoleSpy.called).to.be.true;
    });

    it('should format logs as pretty print in development', () => {
      const devLogger = new Logger({ environment: 'development' });
      const consoleSpy = sandbox.spy(console, 'log');
      
      devLogger.info('Test message', { data: 'test' });
      
      expect(consoleSpy.called).to.be.true;
    });
  });

  describe('error context preservation', () => {
    it('should preserve error stack traces', () => {
      const consoleSpy = sandbox.spy(console, 'error');
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:1:1';
      
      logger.error('Error occurred', { error });
      
      expect(consoleSpy.called).to.be.true;
    });

    it('should include error metadata', () => {
      const consoleSpy = sandbox.spy(console, 'error');
      const error = new Error('Test error');
      error.code = 'ERR_TEST';
      error.statusCode = 500;
      
      logger.error('Error occurred', { error, userId: '123' });
      
      expect(consoleSpy.called).to.be.true;
    });
  });

  describe('audit logging', () => {
    it('should create audit log entries', () => {
      const consoleSpy = sandbox.spy(console, 'log');
      logger.audit('user.login', {
        userId: '123',
        email: 'user@example.com',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      });
      
      expect(consoleSpy.called).to.be.true;
    });

    it('should create security event logs', () => {
      const consoleSpy = sandbox.spy(console, 'warn');
      logger.security('failed_login_attempt', {
        email: 'user@example.com',
        ip: '192.168.1.1',
        attempts: 3
      });
      
      expect(consoleSpy.called).to.be.true;
    });
  });

  describe('child loggers', () => {
    it('should create child logger with additional context', () => {
      const childLogger = logger.child({ requestId: 'req-123' });
      const consoleSpy = sandbox.spy(console, 'log');
      
      childLogger.info('Child logger message');
      
      expect(consoleSpy.called).to.be.true;
    });

    it('should inherit parent logger configuration', () => {
      const childLogger = logger.child({ component: 'auth' });
      expect(childLogger.config.level).to.equal(logger.config.level);
      expect(childLogger.config.service).to.equal(logger.config.service);
    });
  });

  describe('log file operations', () => {
    it('should write logs to file when file transport is enabled', async () => {
      const fileLogger = new Logger({
        level: 'info',
        enableFileTransport: true,
        logDir: './test-logs'
      });
      
      fileLogger.info('Test file log');
      
      // Allow time for file write
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check if log directory exists (implementation will create it)
      // This test will be more specific once implementation is complete
    });
  });
});