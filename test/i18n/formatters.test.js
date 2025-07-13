import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';

// Mock svelte-i18n locale store
const mockLocale = {
  subscribe: sinon.stub(),
  set: sinon.stub(),
  update: sinon.stub()
};

// Mock the get function from svelte/store
const mockGet = sinon.stub().returns('en');

// Mock the imports
const mockSvelteI18n = { locale: mockLocale };
const mockSvelteStore = { get: mockGet };

// Import the functions to test
import {
  formatDate,
  formatTime,
  formatDateTime,
  formatRelativeTime,
  formatNumber,
  formatCurrency,
  formatPercent,
  formatFileSize,
  formatCompactNumber,
  formatList,
  formatDuration,
  getTextDirection,
  isRTL
} from '../../src/lib/i18n/formatters.js';

describe('i18n Formatters', () => {
  beforeEach(() => {
    // Reset all stubs
    mockGet.reset();
    mockGet.returns('en');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('formatDate', () => {
    it('should format date correctly for English locale', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const result = formatDate(date);
      expect(result).to.be.a('string');
      expect(result).to.include('January');
      expect(result).to.include('15');
      expect(result).to.include('2024');
    });

    it('should handle string date input', () => {
      const result = formatDate('2024-01-15');
      expect(result).to.be.a('string');
      expect(result).to.include('January');
    });

    it('should handle timestamp input', () => {
      const timestamp = Date.now();
      const result = formatDate(timestamp);
      expect(result).to.be.a('string');
      expect(result.length).to.be.greaterThan(0);
    });

    it('should handle invalid date input', () => {
      const result = formatDate('invalid-date');
      expect(result).to.equal('');
    });

    it('should accept custom options', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const result = formatDate(date, { month: 'short', day: 'numeric' });
      expect(result).to.be.a('string');
      expect(result).to.include('Jan');
    });
  });

  describe('formatTime', () => {
    it('should format time correctly', () => {
      const date = new Date('2024-01-15T14:30:00Z');
      const result = formatTime(date);
      expect(result).to.be.a('string');
      expect(result).to.match(/\d{1,2}:\d{2}/);
    });

    it('should handle invalid time input', () => {
      const result = formatTime('invalid-time');
      expect(result).to.equal('');
    });

    it('should accept custom options', () => {
      const date = new Date('2024-01-15T14:30:00Z');
      const result = formatTime(date, { hour12: true });
      expect(result).to.be.a('string');
    });
  });

  describe('formatDateTime', () => {
    it('should format date and time together', () => {
      const date = new Date('2024-01-15T14:30:00Z');
      const result = formatDateTime(date);
      expect(result).to.be.a('string');
      expect(result).to.include('Jan');
      expect(result).to.match(/\d{1,2}:\d{2}/);
    });

    it('should handle invalid datetime input', () => {
      const result = formatDateTime('invalid-datetime');
      expect(result).to.equal('');
    });
  });

  describe('formatRelativeTime', () => {
    it('should format relative time correctly', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const result = formatRelativeTime(oneHourAgo, now);
      expect(result).to.be.a('string');
      expect(result).to.include('hour');
    });

    it('should handle future dates', () => {
      const now = new Date();
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
      const result = formatRelativeTime(oneHourLater, now);
      expect(result).to.be.a('string');
    });

    it('should handle invalid dates', () => {
      const result = formatRelativeTime('invalid', new Date());
      expect(result).to.equal('');
    });
  });

  describe('formatNumber', () => {
    it('should format numbers correctly', () => {
      const result = formatNumber(1234.56);
      expect(result).to.be.a('string');
      expect(result).to.include('1,234');
    });

    it('should handle invalid number input', () => {
      const result = formatNumber('not-a-number');
      expect(result).to.equal('not-a-number');
    });

    it('should accept custom options', () => {
      const result = formatNumber(1234.56, { minimumFractionDigits: 3 });
      expect(result).to.be.a('string');
    });
  });

  describe('formatCurrency', () => {
    it('should format currency correctly', () => {
      const result = formatCurrency(1234.56, 'USD');
      expect(result).to.be.a('string');
      expect(result).to.include('$');
      expect(result).to.include('1,234');
    });

    it('should handle different currencies', () => {
      const result = formatCurrency(1234.56, 'EUR');
      expect(result).to.be.a('string');
      expect(result).to.include('€');
    });

    it('should handle invalid amount', () => {
      const result = formatCurrency('invalid', 'USD');
      expect(result).to.equal('invalid');
    });
  });

  describe('formatPercent', () => {
    it('should format percentage correctly', () => {
      const result = formatPercent(0.1234);
      expect(result).to.be.a('string');
      expect(result).to.include('12');
      expect(result).to.include('%');
    });

    it('should handle invalid percentage', () => {
      const result = formatPercent('invalid');
      expect(result).to.equal('invalid');
    });

    it('should accept custom options', () => {
      const result = formatPercent(0.1234, { minimumFractionDigits: 2 });
      expect(result).to.be.a('string');
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes correctly', () => {
      expect(formatFileSize(0)).to.equal('0 Bytes');
      expect(formatFileSize(1024)).to.include('1 KB');
      expect(formatFileSize(1024 * 1024)).to.include('1 MB');
      expect(formatFileSize(1024 * 1024 * 1024)).to.include('1 GB');
    });

    it('should handle decimal places', () => {
      const result = formatFileSize(1536, 1);
      expect(result).to.include('1.5 KB');
    });

    it('should handle invalid input', () => {
      const result = formatFileSize('invalid');
      expect(result).to.equal('invalid');
    });

    it('should handle zero bytes', () => {
      const result = formatFileSize(0);
      expect(result).to.equal('0 Bytes');
    });
  });

  describe('formatCompactNumber', () => {
    it('should format large numbers compactly', () => {
      const result = formatCompactNumber(1234567);
      expect(result).to.be.a('string');
      expect(result).to.include('M');
    });

    it('should handle small numbers', () => {
      const result = formatCompactNumber(123);
      expect(result).to.equal('123');
    });

    it('should handle invalid input', () => {
      const result = formatCompactNumber('invalid');
      expect(result).to.equal('invalid');
    });
  });

  describe('formatList', () => {
    it('should format list correctly', () => {
      const items = ['apple', 'banana', 'cherry'];
      const result = formatList(items);
      expect(result).to.be.a('string');
      expect(result).to.include('apple');
      expect(result).to.include('banana');
      expect(result).to.include('cherry');
    });

    it('should handle empty array', () => {
      const result = formatList([]);
      expect(result).to.equal('');
    });

    it('should handle single item', () => {
      const result = formatList(['apple']);
      expect(result).to.equal('apple');
    });

    it('should handle invalid input', () => {
      const result = formatList('not-an-array');
      expect(result).to.equal('');
    });

    it('should accept custom options', () => {
      const items = ['apple', 'banana'];
      const result = formatList(items, { type: 'disjunction' });
      expect(result).to.be.a('string');
    });
  });

  describe('formatDuration', () => {
    it('should format duration correctly', () => {
      const oneHour = 60 * 60 * 1000;
      const result = formatDuration(oneHour);
      expect(result).to.include('hour');
    });

    it('should format short duration', () => {
      const oneHour = 60 * 60 * 1000;
      const result = formatDuration(oneHour, { short: true });
      expect(result).to.include('h');
    });

    it('should handle zero duration', () => {
      const result = formatDuration(0);
      expect(result).to.include('second');
    });

    it('should handle invalid input', () => {
      const result = formatDuration('invalid');
      expect(result).to.equal('invalid');
    });

    it('should limit number of units', () => {
      const duration = 90 * 60 * 1000 + 30 * 1000; // 1h 30m 30s
      const result = formatDuration(duration, { maxUnits: 2 });
      expect(result).to.be.a('string');
    });
  });

  describe('getTextDirection', () => {
    it('should return ltr for English', () => {
      mockGet.returns('en');
      const result = getTextDirection();
      expect(result).to.equal('ltr');
    });

    it('should return ltr for Spanish', () => {
      mockGet.returns('es');
      const result = getTextDirection();
      expect(result).to.equal('ltr');
    });

    it('should return ltr for unknown locale', () => {
      mockGet.returns('unknown');
      const result = getTextDirection();
      expect(result).to.equal('ltr');
    });
  });

  describe('isRTL', () => {
    it('should return false for LTR languages', () => {
      mockGet.returns('en');
      const result = isRTL();
      expect(result).to.be.false;
    });

    it('should return false for unknown locale', () => {
      mockGet.returns('unknown');
      const result = isRTL();
      expect(result).to.be.false;
    });
  });
});