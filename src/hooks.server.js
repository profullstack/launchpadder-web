import { detectLocaleFromPath, validateLocale, DEFAULT_LOCALE, SUPPORTED_LOCALES } from '$lib/i18n/index.js';

/**
 * Handle incoming requests and set up i18n routing
 * @param {Object} params - SvelteKit handle parameters
 * @param {Request} params.event - The request event
 * @param {Function} params.resolve - The resolve function
 * @returns {Promise<Response>} The response
 */
export async function handle({ event, resolve }) {
  const { url, request } = event;
  const pathname = url.pathname;
  
  // Detect locale from URL path
  const detectedLocale = detectLocaleFromPath(pathname);
  
  // If we detected a locale from the path, validate it
  if (detectedLocale) {
    const validLocale = validateLocale(detectedLocale);
    
    // If the detected locale is invalid, redirect to default locale
    if (validLocale !== detectedLocale) {
      const newPath = pathname.replace(`/${detectedLocale}`, `/${validLocale}`);
      return new Response(null, {
        status: 302,
        headers: {
          location: newPath
        }
      });
    }
    
    // Set the locale in the event locals for use in load functions
    event.locals.locale = validLocale;
  } else {
    // No locale in path - check if we should redirect to a localized path
    
    // Skip locale detection for API routes, static assets, and special routes
    if (
      pathname.startsWith('/api/') ||
      pathname.startsWith('/_app/') ||
      pathname.startsWith('/static/') ||
      pathname.includes('.') ||
      pathname === '/favicon.ico' ||
      pathname === '/robots.txt' ||
      pathname === '/sitemap.xml'
    ) {
      event.locals.locale = DEFAULT_LOCALE;
      return resolve(event);
    }
    
    // Try to detect locale from Accept-Language header
    let preferredLocale = DEFAULT_LOCALE;
    
    const acceptLanguage = request.headers.get('accept-language');
    if (acceptLanguage) {
      // Parse Accept-Language header
      const languages = acceptLanguage
        .split(',')
        .map(lang => {
          const [code, q = '1'] = lang.trim().split(';q=');
          return {
            code: code.toLowerCase().split('-')[0], // Extract language code
            quality: parseFloat(q)
          };
        })
        .sort((a, b) => b.quality - a.quality);
      
      // Find the first supported language
      for (const lang of languages) {
        if (SUPPORTED_LOCALES.includes(lang.code)) {
          preferredLocale = lang.code;
          break;
        }
      }
    }
    
    // If preferred locale is not default, redirect to localized path
    if (preferredLocale !== DEFAULT_LOCALE) {
      const localizedPath = `/${preferredLocale}${pathname}`;
      return new Response(null, {
        status: 302,
        headers: {
          location: localizedPath
        }
      });
    }
    
    // Set default locale
    event.locals.locale = DEFAULT_LOCALE;
  }
  
  // Resolve the request with locale information
  const response = await resolve(event, {
    transformPageChunk: ({ html, done }) => {
      // Only transform the final chunk
      if (done) {
        const locale = event.locals.locale || DEFAULT_LOCALE;
        
        // Set the lang attribute on the html element
        return html.replace('<html', `<html lang="${locale}"`);
      }
      return html;
    }
  });
  
  // Add locale information to response headers for client-side use
  response.headers.set('X-Locale', event.locals.locale || DEFAULT_LOCALE);
  
  return response;
}

/**
 * Handle errors and ensure locale is available
 * @param {Object} params - SvelteKit handleError parameters
 * @param {Error} params.error - The error object
 * @param {Object} params.event - The request event
 * @returns {Object} Error details
 */
export function handleError({ error, event }) {
  // Ensure locale is set even in error cases
  if (!event.locals.locale) {
    event.locals.locale = DEFAULT_LOCALE;
  }
  
  console.error('SvelteKit error:', error);
  
  return {
    message: 'An unexpected error occurred',
    code: error?.code ?? 'UNKNOWN'
  };
}