import { browser } from '$app/environment';
import { initI18n, getCurrentLocale, setLocale } from '$lib/i18n/index.js';

/**
 * Initialize i18n on the client side
 */
if (browser) {
  // Get the initial locale from various sources
  const initialLocale = getCurrentLocale();
  
  // Initialize the i18n system
  initI18n(initialLocale);
  
  // Set the initial locale
  setLocale(initialLocale).catch(error => {
    console.error('Failed to set initial locale:', error);
  });
}

/**
 * Handle client-side errors
 * @param {Object} params - SvelteKit handleError parameters
 * @param {Error} params.error - The error object
 * @param {Object} params.event - The request event
 * @returns {Object} Error details
 */
export function handleError({ error, event }) {
  console.error('Client-side error:', error);
  
  return {
    message: 'An unexpected error occurred',
    code: error?.code ?? 'UNKNOWN'
  };
}