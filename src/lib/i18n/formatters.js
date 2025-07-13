import { locale } from 'svelte-i18n';
import { get } from 'svelte/store';
import { LOCALE_METADATA } from './index.js';

/**
 * Get the current locale from the store
 * @returns {string} Current locale code
 */
function getCurrentLocale() {
  return get(locale) || 'en';
}

/**
 * Format a date according to the current locale
 * @param {Date|string|number} date - The date to format
 * @param {Intl.DateTimeFormatOptions} options - Formatting options
 * @returns {string} Formatted date string
 */
export function formatDate(date, options = {}) {
  try {
    const currentLocale = getCurrentLocale();
    const dateObj = date instanceof Date ? date : new Date(date);
    
    if (isNaN(dateObj.getTime())) {
      return '';
    }
    
    const defaultOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    
    return new Intl.DateTimeFormat(currentLocale, { ...defaultOptions, ...options }).format(dateObj);
  } catch (error) {
    console.error('Error formatting date:', error);
    return String(date);
  }
}

/**
 * Format a time according to the current locale
 * @param {Date|string|number} date - The date/time to format
 * @param {Intl.DateTimeFormatOptions} options - Formatting options
 * @returns {string} Formatted time string
 */
export function formatTime(date, options = {}) {
  try {
    const currentLocale = getCurrentLocale();
    const dateObj = date instanceof Date ? date : new Date(date);
    
    if (isNaN(dateObj.getTime())) {
      return '';
    }
    
    const defaultOptions = {
      hour: '2-digit',
      minute: '2-digit'
    };
    
    return new Intl.DateTimeFormat(currentLocale, { ...defaultOptions, ...options }).format(dateObj);
  } catch (error) {
    console.error('Error formatting time:', error);
    return String(date);
  }
}

/**
 * Format a date and time according to the current locale
 * @param {Date|string|number} date - The date/time to format
 * @param {Intl.DateTimeFormatOptions} options - Formatting options
 * @returns {string} Formatted date and time string
 */
export function formatDateTime(date, options = {}) {
  try {
    const currentLocale = getCurrentLocale();
    const dateObj = date instanceof Date ? date : new Date(date);
    
    if (isNaN(dateObj.getTime())) {
      return '';
    }
    
    const defaultOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    
    return new Intl.DateTimeFormat(currentLocale, { ...defaultOptions, ...options }).format(dateObj);
  } catch (error) {
    console.error('Error formatting datetime:', error);
    return String(date);
  }
}

/**
 * Format a relative time (e.g., "2 hours ago", "in 3 days")
 * @param {Date|string|number} date - The date to compare
 * @param {Date|string|number} baseDate - The base date to compare against (defaults to now)
 * @returns {string} Formatted relative time string
 */
export function formatRelativeTime(date, baseDate = new Date()) {
  try {
    const currentLocale = getCurrentLocale();
    const dateObj = date instanceof Date ? date : new Date(date);
    const baseDateObj = baseDate instanceof Date ? baseDate : new Date(baseDate);
    
    if (isNaN(dateObj.getTime()) || isNaN(baseDateObj.getTime())) {
      return '';
    }
    
    const rtf = new Intl.RelativeTimeFormat(currentLocale, { numeric: 'auto' });
    const diffInSeconds = (dateObj.getTime() - baseDateObj.getTime()) / 1000;
    
    const intervals = [
      { unit: 'year', seconds: 31536000 },
      { unit: 'month', seconds: 2628000 },
      { unit: 'week', seconds: 604800 },
      { unit: 'day', seconds: 86400 },
      { unit: 'hour', seconds: 3600 },
      { unit: 'minute', seconds: 60 },
      { unit: 'second', seconds: 1 }
    ];
    
    for (const interval of intervals) {
      const count = Math.floor(Math.abs(diffInSeconds) / interval.seconds);
      if (count >= 1) {
        return rtf.format(diffInSeconds < 0 ? -count : count, interval.unit);
      }
    }
    
    return rtf.format(0, 'second');
  } catch (error) {
    console.error('Error formatting relative time:', error);
    return String(date);
  }
}

/**
 * Format a number according to the current locale
 * @param {number} number - The number to format
 * @param {Intl.NumberFormatOptions} options - Formatting options
 * @returns {string} Formatted number string
 */
export function formatNumber(number, options = {}) {
  try {
    const currentLocale = getCurrentLocale();
    
    if (typeof number !== 'number' || isNaN(number)) {
      return String(number);
    }
    
    return new Intl.NumberFormat(currentLocale, options).format(number);
  } catch (error) {
    console.error('Error formatting number:', error);
    return String(number);
  }
}

/**
 * Format a currency amount according to the current locale
 * @param {number} amount - The amount to format
 * @param {string} currency - The currency code (e.g., 'USD', 'EUR')
 * @param {Intl.NumberFormatOptions} options - Additional formatting options
 * @returns {string} Formatted currency string
 */
export function formatCurrency(amount, currency = 'USD', options = {}) {
  try {
    const currentLocale = getCurrentLocale();
    
    if (typeof amount !== 'number' || isNaN(amount)) {
      return String(amount);
    }
    
    const defaultOptions = {
      style: 'currency',
      currency: currency
    };
    
    return new Intl.NumberFormat(currentLocale, { ...defaultOptions, ...options }).format(amount);
  } catch (error) {
    console.error('Error formatting currency:', error);
    return String(amount);
  }
}

/**
 * Format a percentage according to the current locale
 * @param {number} value - The value to format as percentage (0.5 = 50%)
 * @param {Intl.NumberFormatOptions} options - Formatting options
 * @returns {string} Formatted percentage string
 */
export function formatPercent(value, options = {}) {
  try {
    const currentLocale = getCurrentLocale();
    
    if (typeof value !== 'number' || isNaN(value)) {
      return String(value);
    }
    
    const defaultOptions = {
      style: 'percent',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1
    };
    
    return new Intl.NumberFormat(currentLocale, { ...defaultOptions, ...options }).format(value);
  } catch (error) {
    console.error('Error formatting percent:', error);
    return String(value);
  }
}

/**
 * Format a file size in bytes to human readable format
 * @param {number} bytes - The size in bytes
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted file size string
 */
export function formatFileSize(bytes, decimals = 2) {
  try {
    if (typeof bytes !== 'number' || isNaN(bytes) || bytes === 0) {
      return '0 Bytes';
    }
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    
    return `${formatNumber(value, { minimumFractionDigits: 0, maximumFractionDigits: dm })} ${sizes[i]}`;
  } catch (error) {
    console.error('Error formatting file size:', error);
    return String(bytes);
  }
}

/**
 * Format a compact number (e.g., 1.2K, 3.4M)
 * @param {number} number - The number to format
 * @param {Intl.NumberFormatOptions} options - Formatting options
 * @returns {string} Formatted compact number string
 */
export function formatCompactNumber(number, options = {}) {
  try {
    const currentLocale = getCurrentLocale();
    
    if (typeof number !== 'number' || isNaN(number)) {
      return String(number);
    }
    
    const defaultOptions = {
      notation: 'compact',
      compactDisplay: 'short'
    };
    
    return new Intl.NumberFormat(currentLocale, { ...defaultOptions, ...options }).format(number);
  } catch (error) {
    console.error('Error formatting compact number:', error);
    return String(number);
  }
}

/**
 * Get the text direction for the current locale
 * @returns {string} 'ltr' or 'rtl'
 */
export function getTextDirection() {
  const currentLocale = getCurrentLocale();
  return LOCALE_METADATA[currentLocale]?.dir || 'ltr';
}

/**
 * Check if the current locale uses right-to-left text direction
 * @returns {boolean} True if RTL, false if LTR
 */
export function isRTL() {
  return getTextDirection() === 'rtl';
}

/**
 * Format a list of items according to the current locale
 * @param {Array} items - Array of items to format
 * @param {Intl.ListFormatOptions} options - Formatting options
 * @returns {string} Formatted list string
 */
export function formatList(items, options = {}) {
  try {
    const currentLocale = getCurrentLocale();
    
    if (!Array.isArray(items) || items.length === 0) {
      return '';
    }
    
    const defaultOptions = {
      style: 'long',
      type: 'conjunction'
    };
    
    return new Intl.ListFormat(currentLocale, { ...defaultOptions, ...options }).format(items);
  } catch (error) {
    console.error('Error formatting list:', error);
    return items.join(', ');
  }
}

/**
 * Format a duration in milliseconds to human readable format
 * @param {number} milliseconds - Duration in milliseconds
 * @param {object} options - Formatting options
 * @param {boolean} options.short - Use short format (default: false)
 * @param {number} options.maxUnits - Maximum number of units to show (default: 2)
 * @returns {string} Formatted duration string
 */
export function formatDuration(milliseconds, options = {}) {
  try {
    const { short = false, maxUnits = 2 } = options;
    
    if (typeof milliseconds !== 'number' || isNaN(milliseconds) || milliseconds < 0) {
      return '0s';
    }
    
    const units = [
      { name: short ? 'd' : 'day', plural: short ? 'd' : 'days', value: 86400000 },
      { name: short ? 'h' : 'hour', plural: short ? 'h' : 'hours', value: 3600000 },
      { name: short ? 'm' : 'minute', plural: short ? 'm' : 'minutes', value: 60000 },
      { name: short ? 's' : 'second', plural: short ? 's' : 'seconds', value: 1000 }
    ];
    
    const parts = [];
    let remaining = milliseconds;
    
    for (const unit of units) {
      if (remaining >= unit.value && parts.length < maxUnits) {
        const count = Math.floor(remaining / unit.value);
        remaining %= unit.value;
        
        if (short) {
          parts.push(`${count}${unit.name}`);
        } else {
          parts.push(`${count} ${count === 1 ? unit.name : unit.plural}`);
        }
      }
    }
    
    if (parts.length === 0) {
      return short ? '0s' : '0 seconds';
    }
    
    return short ? parts.join(' ') : formatList(parts);
  } catch (error) {
    console.error('Error formatting duration:', error);
    return String(milliseconds);
  }
}