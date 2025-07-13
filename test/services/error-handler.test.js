import { expect } from 'chai';
import sinon from 'sinon';
import { ErrorHandler, AppError, ValidationError, AuthenticationError, AuthorizationError } from '../../src/lib/services/error-handler.js';

describe('Error Handler Service', () => {
  let errorHandler;
  let sandbox;
  let mockLogger;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    mockLogger = {
      error: sandbox.spy(),
      warn: sandbox.spy(),
      info: sandbox.spy(),
      security: sandbox.spy(),
      setCorrelationId: sandbox.spy()
    };
    errorHandler = new ErrorHandler({ logger: mockLogger });
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('Custom Error Classes', () => {
    it('should create AppError with correct properties', () => {
      const error = new AppError('Test error', 400, 'VALIDATION_ERROR');
      expect(error.message).to.equal('Test error');
      expect(error.statusCode).to.equal(400);
      expect(error.code).to.equal('VALIDATION_ERROR');
      expect(error.isOperational).to.be.true;
    });

    it('should create ValidationError with correct defaults', () => {
      const error = new ValidationError('Invalid input');
      expect(error.message).to.equal('Invalid input');
      expect(error.statusCode).to.equal(400);
      expect(error.code).to.equal('VALIDATION_ERROR');
    });

    it('should create AuthenticationError with correct defaults', () => {
      const error = new AuthenticationError('Invalid credentials');
      expect(error.message).to.equal('Invalid credentials');
      expect(error.statusCode).to.equal(401);
      expect(error.code).to.equal('AUTHENTICATION_ERROR');
    });

    it('should create AuthorizationError with correct defaults', () => {
      const error = new AuthorizationError('Access denied');
      expect(error.message).to.equal('Access denied');
      expect(error.statusCode).to.equal(403);
      expect(error.code).to.equal('AUTHORIZATION_ERROR');
    });
  });

  describe('Error Classification', () => {
    it('should classify operational errors correctly', () => {
      const operationalError = new AppError('Test error', 400);
      expect(errorHandler.isOperationalError(operationalError)).to.be.true;
    });

    it('should classify programming errors correctly', () => {
      const programmingError = new Error('Unexpected error');
      expect(errorHandler.isOperationalError(programmingError)).to.be.false;
    });

    it('should classify validation errors', () => {
      const validationError = new ValidationError('Invalid input');
      expect(errorHandler.getErrorCategory(validationError)).to.equal('validation');
    });

    it('should classify authentication errors', () => {
      const authError = new AuthenticationError('Invalid token');
      expect(errorHandler.getErrorCategory(authError)).to.equal('authentication');
    });

    it('should classify authorization errors', () => {
      const authzError = new AuthorizationError('Access denied');
      expect(errorHandler.getErrorCategory(authzError)).to.equal('authorization');
    });

    it('should classify system errors', () => {
      const systemError = new Error('Database connection failed');
      expect(errorHandler.getErrorCategory(systemError)).to.equal('system');
    });
  });

  describe('Error Response Standardization', () => {
    it('should create standardized error response for operational errors', () => {
      const error = new AppError('Test error', 400, 'TEST_ERROR');
      const response = errorHandler.createErrorResponse(error, 'req-123');

      expect(response).to.deep.include({
        success: false,
        error: {
          message: 'Test error',
          code: 'TEST_ERROR',
          statusCode: 400,
          category: 'application'
        }
      });
      expect(response.requestId).to.equal('req-123');
      expect(response.timestamp).to.be.a('string');
    });

    it('should create standardized error response for programming errors in production', () => {
      const prodErrorHandler = new ErrorHandler({ 
        logger: mockLogger, 
        environment: 'production' 
      });
      const error = new Error('Database connection failed');
      const response = prodErrorHandler.createErrorResponse(error, 'req-123');

      expect(response.error.message).to.equal('Internal server error');
      expect(response.error.statusCode).to.equal(500);
      expect(response.error.code).to.equal('INTERNAL_ERROR');
    });

    it('should include stack trace in development environment', () => {
      const devErrorHandler = new ErrorHandler({ 
        logger: mockLogger, 
        environment: 'development' 
      });
      const error = new Error('Test error');
      const response = devErrorHandler.createErrorResponse(error, 'req-123');

      expect(response.error.stack).to.be.a('string');
    });

    it('should not include stack trace in production environment', () => {
      const prodErrorHandler = new ErrorHandler({ 
        logger: mockLogger, 
        environment: 'production' 
      });
      const error = new Error('Test error');
      const response = prodErrorHandler.createErrorResponse(error, 'req-123');

      expect(response.error.stack).to.be.undefined;
    });
  });

  describe('Error Logging', () => {
    it('should log operational errors with appropriate level', () => {
      const error = new ValidationError('Invalid input');
      errorHandler.logError(error, 'req-123', { userId: '123' });

      expect(mockLogger.warn.called).to.be.true;
    });

    it('should log programming errors with error level', () => {
      const error = new Error('Unexpected error');
      errorHandler.logError(error, 'req-123', { userId: '123' });

      expect(mockLogger.error.called).to.be.true;
    });

    it('should log security-related errors', () => {
      const error = new AuthenticationError('Invalid token');
      errorHandler.logError(error, 'req-123', { ip: '192.168.1.1' });

      expect(mockLogger.security.called).to.be.true;
    });

    it('should include context in error logs', () => {
      const error = new AppError('Test error', 400);
      const context = { userId: '123', action: 'test' };
      errorHandler.logError(error, 'req-123', context);

      expect(mockLogger.error.calledWith(
        sinon.match.string,
        sinon.match.object
      )).to.be.true;
    });
  });

  describe('SvelteKit Error Handler', () => {
    it('should handle errors in SvelteKit format', () => {
      const error = new ValidationError('Invalid input');
      const result = errorHandler.handleSvelteKitError(error, 'req-123');

      expect(result.status).to.equal(400);
      expect(result.body).to.deep.include({
        success: false,
        error: {
          message: 'Invalid input',
          code: 'VALIDATION_ERROR'
        }
      });
    });

    it('should handle unexpected errors in SvelteKit', () => {
      const error = new Error('Unexpected error');
      const result = errorHandler.handleSvelteKitError(error, 'req-123');

      expect(result.status).to.equal(500);
      expect(result.body.error.message).to.equal('Internal server error');
    });
  });

  describe('Error Recovery', () => {
    it('should suggest recovery actions for validation errors', () => {
      const error = new ValidationError('Invalid email format');
      const recovery = errorHandler.getRecoveryActions(error);

      expect(recovery).to.include('Validate input data');
      expect(recovery).to.include('Check field formats');
    });

    it('should suggest recovery actions for authentication errors', () => {
      const error = new AuthenticationError('Token expired');
      const recovery = errorHandler.getRecoveryActions(error);

      expect(recovery).to.include('Refresh authentication token');
      expect(recovery).to.include('Re-authenticate user');
    });

    it('should suggest recovery actions for system errors', () => {
      const error = new Error('Database connection failed');
      const recovery = errorHandler.getRecoveryActions(error);

      expect(recovery).to.include('Check database connectivity');
      expect(recovery).to.include('Verify configuration');
    });
  });

  describe('Error Aggregation', () => {
    it('should track error occurrences', () => {
      const error1 = new ValidationError('Invalid input');
      const error2 = new ValidationError('Invalid input');
      
      errorHandler.trackError(error1);
      errorHandler.trackError(error2);
      
      const stats = errorHandler.getErrorStats();
      expect(stats.total).to.equal(2);
      expect(stats.byCategory.validation).to.equal(2);
    });

    it('should track error trends over time', () => {
      const error = new ValidationError('Invalid input');
      errorHandler.trackError(error);
      
      const trends = errorHandler.getErrorTrends();
      expect(trends).to.have.property('hourly');
      expect(trends).to.have.property('daily');
    });
  });

  describe('Global Error Handlers', () => {
    it('should handle uncaught exceptions', () => {
      const consoleSpy = sandbox.spy(console, 'error');
      const exitSpy = sandbox.stub(process, 'exit');
      
      errorHandler.setupGlobalHandlers();
      
      // Simulate uncaught exception
      process.emit('uncaughtException', new Error('Uncaught error'));
      
      expect(mockLogger.error.called).to.be.true;
      expect(exitSpy.calledWith(1)).to.be.true;
    });

    it('should handle unhandled promise rejections', () => {
      const consoleSpy = sandbox.spy(console, 'error');
      
      errorHandler.setupGlobalHandlers();
      
      // Simulate unhandled rejection
      process.emit('unhandledRejection', new Error('Unhandled rejection'));
      
      expect(mockLogger.error.called).to.be.true;
    });
  });
});