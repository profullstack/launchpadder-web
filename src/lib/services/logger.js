import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Centralized logging system with structured logging, security, and monitoring
 */
export class Logger {
  constructor(config = {}) {
    this.config = {
      level: config.level || process.env.LOG_LEVEL || 'info',
      service: config.service || 'launchpadder',
      environment: config.environment || process.env.NODE_ENV || 'development',
      enableFileTransport: config.enableFileTransport ?? true,
      enableConsoleTransport: config.enableConsoleTransport ?? true,
      logDir: config.logDir || path.join(process.cwd(), 'logs'),
      maxFiles: config.maxFiles || '14d',
      maxSize: config.maxSize || '20m',
      encryptLogs: config.encryptLogs ?? false,
      encryptionKey: config.encryptionKey || process.env.LOG_ENCRYPTION_KEY,
      ...config
    };

    this.correlationId = null;
    this.context = {};
    this.sensitiveFields = new Set([
      'password', 'confirmPassword', 'token', 'accessToken', 'refreshToken',
      'apiKey', 'secret', 'privateKey', 'cardNumber', 'cvv', 'ssn',
      'authorization', 'cookie', 'session'
    ]);

    this.logLevels = ['error', 'warn', 'info', 'debug'];
    
    if (!this.logLevels.includes(this.config.level)) {
      throw new Error(`Invalid log level: ${this.config.level}. Must be one of: ${this.logLevels.join(', ')}`);
    }

    this.initializeWinston();
  }

  /**
   * Initialize Winston logger with transports
   */
  initializeWinston() {
    const transports = [];

    // Console transport
    if (this.config.enableConsoleTransport) {
      transports.push(new winston.transports.Console({
        format: this.config.environment === 'production' 
          ? winston.format.json()
          : winston.format.combine(
              winston.format.colorize(),
              winston.format.timestamp(),
              winston.format.printf(this.formatConsoleLog.bind(this))
            )
      }));
    }

    // File transport with rotation
    if (this.config.enableFileTransport) {
      this.ensureLogDirectory();
      
      // Application logs
      transports.push(new DailyRotateFile({
        filename: path.join(this.config.logDir, 'application-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxFiles: this.config.maxFiles,
        maxSize: this.config.maxSize,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      }));

      // Error logs
      transports.push(new DailyRotateFile({
        filename: path.join(this.config.logDir, 'error-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        maxFiles: this.config.maxFiles,
        maxSize: this.config.maxSize,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      }));

      // Audit logs
      transports.push(new DailyRotateFile({
        filename: path.join(this.config.logDir, 'audit-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxFiles: '90d', // Keep audit logs longer
        maxSize: this.config.maxSize,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      }));
    }

    this.winston = winston.createLogger({
      level: this.config.level,
      defaultMeta: {
        service: this.config.service,
        environment: this.config.environment,
        hostname: process.env.HOSTNAME || 'localhost',
        pid: process.pid
      },
      transports
    });
  }

  /**
   * Ensure log directory exists
   */
  async ensureLogDirectory() {
    try {
      await fs.access(this.config.logDir);
    } catch {
      await fs.mkdir(this.config.logDir, { recursive: true });
    }
  }

  /**
   * Format console log output
   */
  formatConsoleLog(info) {
    const { timestamp, level, message, service, ...meta } = info;
    const correlationId = this.correlationId ? `[${this.correlationId}]` : '';
    const metaStr = Object.keys(meta).length > 0 ? `\n${JSON.stringify(meta, null, 2)}` : '';
    
    return `${timestamp} ${level} [${service}]${correlationId}: ${message}${metaStr}`;
  }

  /**
   * Set correlation ID for request tracing
   */
  setCorrelationId(id) {
    this.correlationId = id || uuidv4();
    return this.correlationId;
  }

  /**
   * Get current correlation ID
   */
  getCorrelationId() {
    return this.correlationId;
  }

  /**
   * Add context to all subsequent logs
   */
  addContext(context) {
    this.context = { ...this.context, ...context };
  }

  /**
   * Clear context
   */
  clearContext() {
    this.context = {};
  }

  /**
   * Redact sensitive data from log objects
   */
  redactSensitiveData(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    const redacted = Array.isArray(obj) ? [] : {};
    
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      
      if (this.sensitiveFields.has(lowerKey) || this.isSensitiveValue(value)) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = this.redactSensitiveData(value);
      } else {
        redacted[key] = value;
      }
    }
    
    return redacted;
  }

  /**
   * Check if a value appears to be sensitive
   */
  isSensitiveValue(value) {
    if (typeof value !== 'string') return false;
    
    // Credit card pattern
    if (/^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}$/.test(value)) return true;
    
    // JWT token pattern
    if (/^eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]*$/.test(value)) return true;
    
    // API key patterns
    if (/^(sk_|pk_|rk_)[a-zA-Z0-9_]{10,}$/.test(value)) return true;
    
    return false;
  }

  /**
   * Create structured log entry
   */
  createLogEntry(level, message, meta = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlationId: this.correlationId,
      ...this.context,
      ...this.redactSensitiveData(meta)
    };

    // Add error details if present
    if (meta.error && meta.error instanceof Error) {
      entry.error = {
        name: meta.error.name,
        message: meta.error.message,
        stack: meta.error.stack,
        code: meta.error.code,
        statusCode: meta.error.statusCode
      };
    }

    return entry;
  }

  /**
   * Debug level logging
   */
  debug(message, meta = {}) {
    const entry = this.createLogEntry('debug', message, meta);
    this.winston.debug(entry);
  }

  /**
   * Info level logging
   */
  info(message, meta = {}) {
    const entry = this.createLogEntry('info', message, meta);
    this.winston.info(entry);
  }

  /**
   * Warning level logging
   */
  warn(message, meta = {}) {
    const entry = this.createLogEntry('warn', message, meta);
    this.winston.warn(entry);
  }

  /**
   * Error level logging
   */
  error(message, meta = {}) {
    const entry = this.createLogEntry('error', message, meta);
    this.winston.error(entry);
  }

  /**
   * Performance logging
   */
  performance(operation, duration, meta = {}) {
    const entry = this.createLogEntry('info', `Performance: ${operation}`, {
      ...meta,
      performance: {
        operation,
        duration,
        unit: 'ms'
      }
    });
    this.winston.info(entry);
  }

  /**
   * Audit logging for compliance and security
   */
  audit(action, meta = {}) {
    const entry = this.createLogEntry('info', `Audit: ${action}`, {
      ...meta,
      audit: true,
      action,
      timestamp: new Date().toISOString()
    });
    this.winston.info(entry);
  }

  /**
   * Security event logging
   */
  security(event, meta = {}) {
    const entry = this.createLogEntry('warn', `Security: ${event}`, {
      ...meta,
      security: true,
      event,
      timestamp: new Date().toISOString()
    });
    this.winston.warn(entry);
  }

  /**
   * Create child logger with additional context
   */
  child(context = {}) {
    const childLogger = new Logger(this.config);
    childLogger.correlationId = this.correlationId;
    childLogger.context = { ...this.context, ...context };
    return childLogger;
  }

  /**
   * Encrypt log data if encryption is enabled
   */
  encryptLogData(data) {
    if (!this.config.encryptLogs || !this.config.encryptionKey) {
      return data;
    }
    
    try {
      return crypto.AES.encrypt(JSON.stringify(data), this.config.encryptionKey).toString();
    } catch (error) {
      this.winston.error('Failed to encrypt log data', { error: error.message });
      return data;
    }
  }

  /**
   * Decrypt log data
   */
  decryptLogData(encryptedData) {
    if (!this.config.encryptLogs || !this.config.encryptionKey) {
      return encryptedData;
    }
    
    try {
      const bytes = crypto.AES.decrypt(encryptedData, this.config.encryptionKey);
      return JSON.parse(bytes.toString(crypto.enc.Utf8));
    } catch (error) {
      this.winston.error('Failed to decrypt log data', { error: error.message });
      return encryptedData;
    }
  }

  /**
   * Get log statistics
   */
  async getLogStats() {
    try {
      const logFiles = await fs.readdir(this.config.logDir);
      const stats = {
        totalFiles: logFiles.length,
        files: []
      };

      for (const file of logFiles) {
        const filePath = path.join(this.config.logDir, file);
        const fileStat = await fs.stat(filePath);
        stats.files.push({
          name: file,
          size: fileStat.size,
          created: fileStat.birthtime,
          modified: fileStat.mtime
        });
      }

      return stats;
    } catch (error) {
      this.error('Failed to get log statistics', { error });
      return { totalFiles: 0, files: [] };
    }
  }

  /**
   * Clean up old log files
   */
  async cleanupLogs(retentionDays = 30) {
    try {
      const logFiles = await fs.readdir(this.config.logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      let deletedCount = 0;
      for (const file of logFiles) {
        const filePath = path.join(this.config.logDir, file);
        const fileStat = await fs.stat(filePath);
        
        if (fileStat.mtime < cutoffDate) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }

      this.info('Log cleanup completed', { deletedFiles: deletedCount, retentionDays });
      return deletedCount;
    } catch (error) {
      this.error('Failed to cleanup logs', { error });
      return 0;
    }
  }
}

// Create default logger instance
export const logger = new Logger();

// Export convenience methods
export const debug = (message, meta) => logger.debug(message, meta);
export const info = (message, meta) => logger.info(message, meta);
export const warn = (message, meta) => logger.warn(message, meta);
export const error = (message, meta) => logger.error(message, meta);
export const performance = (operation, duration, meta) => logger.performance(operation, duration, meta);
export const audit = (action, meta) => logger.audit(action, meta);
export const security = (event, meta) => logger.security(event, meta);