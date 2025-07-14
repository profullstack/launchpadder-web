import { browser } from '$app/environment';
import { init, register, locale, waitLocale } from 'svelte-i18n';

// Supported languages
export const SUPPORTED_LOCALES = ['en', 'es', 'fr', 'de'];
export const DEFAULT_LOCALE = 'en';

// Language metadata
export const LOCALE_METADATA = {
  en: {
    name: 'English',
    nativeName: 'English',
    flag: '🇺🇸',
    dir: 'ltr'
  },
  es: {
    name: 'Spanish',
    nativeName: 'Español',
    flag: '🇪🇸',
    dir: 'ltr'
  },
  fr: {
    name: 'French',
    nativeName: 'Français',
    flag: '🇫🇷',
    dir: 'ltr'
  },
  de: {
    name: 'German',
    nativeName: 'Deutsch',
    flag: '🇩🇪',
    dir: 'ltr'
  }
};

// Register all locales
SUPPORTED_LOCALES.forEach((localeCode) => {
  register(localeCode, () => import(`./locales/${localeCode}.json`));
});

/**
 * Initialize i18n system
 * @param {string} initialLocale - The initial locale to use
 */
export function initI18n(initialLocale = DEFAULT_LOCALE) {
  init({
    fallbackLocale: DEFAULT_LOCALE,
    initialLocale: validateLocale(initialLocale)
  });
}

/**
 * Validate and normalize locale code
 * @param {string} localeCode - The locale code to validate
 * @returns {string} Valid locale code
 */
export function validateLocale(localeCode) {
  if (!localeCode || typeof localeCode !== 'string') {
    return DEFAULT_LOCALE;
  }
  
  // Extract language code from full locale (e.g., 'en-US' -> 'en')
  const languageCode = localeCode.toLowerCase().split('-')[0];
  
  return SUPPORTED_LOCALES.includes(languageCode) ? languageCode : DEFAULT_LOCALE;
}

/**
 * Set the current locale
 * @param {string} localeCode - The locale code to set
 * @returns {Promise<void>}
 */
export async function setLocale(localeCode) {
  const validLocale = validateLocale(localeCode);
  locale.set(validLocale);
  
  // Wait for locale to be loaded
  await waitLocale(validLocale);
  
  // Store in localStorage if in browser
  if (browser) {
    localStorage.setItem('locale', validLocale);
    document.documentElement.lang = validLocale;
    document.documentElement.dir = LOCALE_METADATA[validLocale]?.dir || 'ltr';
  }
}

/**
 * Get the current locale from various sources
 * @returns {string} Current locale code
 */
export function getCurrentLocale() {
  if (browser) {
    // 1. Check localStorage
    const storedLocale = localStorage.getItem('locale');
    if (storedLocale && SUPPORTED_LOCALES.includes(storedLocale)) {
      return storedLocale;
    }
    
    // 2. Check browser language
    const browserLocale = navigator.language || navigator.languages?.[0];
    if (browserLocale) {
      const validatedLocale = validateLocale(browserLocale);
      if (validatedLocale !== DEFAULT_LOCALE) {
        return validatedLocale;
      }
    }
  }
  
  return DEFAULT_LOCALE;
}

/**
 * Detect locale from URL path
 * @param {string} pathname - The URL pathname
 * @returns {string|null} Detected locale or null
 */
export function detectLocaleFromPath(pathname) {
  if (!pathname || pathname === '/') {
    return null;
  }
  
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0];
  
  return SUPPORTED_LOCALES.includes(firstSegment) ? firstSegment : null;
}

/**
 * Get localized path
 * @param {string} path - The path to localize
 * @param {string} localeCode - The locale code
 * @returns {string} Localized path
 */
export function getLocalizedPath(path, localeCode = DEFAULT_LOCALE) {
  const validLocale = validateLocale(localeCode);
  
  // Don't prefix default locale
  if (validLocale === DEFAULT_LOCALE) {
    return path;
  }
  
  // Remove existing locale prefix if present
  const cleanPath = path.replace(/^\/[a-z]{2}(\/|$)/, '/');
  
  // Add locale prefix
  return `/${validLocale}${cleanPath === '/' ? '' : cleanPath}`;
}

/**
 * Remove locale prefix from path
 * @param {string} path - The path to clean
 * @returns {string} Path without locale prefix
 */
export function removeLocaleFromPath(path) {
  return path.replace(/^\/[a-z]{2}(\/|$)/, '/');
}

/**
 * Get text direction for a locale
 * @param {string} localeCode - The locale code
 * @returns {string} Text direction ('ltr' or 'rtl')
 */
export function getTextDirection(localeCode = DEFAULT_LOCALE) {
  const validLocale = validateLocale(localeCode);
  return LOCALE_METADATA[validLocale]?.dir || 'ltr';
}