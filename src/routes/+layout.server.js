import { detectLocaleFromPath, validateLocale, DEFAULT_LOCALE, initI18n } from '$lib/i18n/index.js';

/**
 * Load function for the root layout (server-side)
 * Sets up locale information for the entire application
 * @param {Object} params - SvelteKit load parameters
 * @param {Object} params.url - The current URL
 * @param {Object} params.locals - Server locals (includes locale from hooks)
 * @returns {Object} Layout data
 */
export async function load({ url, locals }) {
  // Get locale from server locals (set in hooks.server.js)
  const serverLocale = locals.locale || DEFAULT_LOCALE;
  
  // Validate the locale
  const locale = validateLocale(serverLocale);
  
  // Initialize i18n system on the server side
  initI18n(locale);
  
  // Detect if we're on a localized route
  const detectedLocale = detectLocaleFromPath(url.pathname);
  const isLocalizedRoute = detectedLocale !== null;
  
  return {
    locale,
    isLocalizedRoute,
    pathname: url.pathname
  };
}