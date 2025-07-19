import { detectLocaleFromPath, validateLocale, DEFAULT_LOCALE, SUPPORTED_LOCALES } from '$lib/i18n/index.js';
import { createRequestTracingMiddleware } from '$lib/middleware/request-tracing.js';
import { errorHandler } from '$lib/services/error-handler.js';
import { logger } from '$lib/services/logger.js';
import { createClient } from '@supabase/supabase-js';

// Create request tracing middleware
const requestTracing = createRequestTracingMiddleware({
  enableLogging: true,
  enableMetrics: true,
  enablePerformanceTracking: true,
  excludePaths: ['/favicon.ico', '/robots.txt', '/_app/', '/static/'],
  sensitiveHeaders: ['authorization', 'cookie', 'x-api-key', 'x-auth-token']
});

/**
 * Handle incoming requests with comprehensive logging, monitoring, and i18n routing
 * @param {Object} params - SvelteKit handle parameters
 * @param {Request} params.event - The request event
 * @param {Function} params.resolve - The resolve function
 * @returns {Promise<Response>} The response
 */
export async function handle({ event, resolve }) {
  // Apply request tracing middleware first
  return await requestTracing({ event, resolve: async (event) => {
    const { url, request } = event;
    const pathname = url.pathname;
    
    try {
      // Initialize Supabase client for server-side authentication
      const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.PUBLIC_SUPABASE_ANON_KEY;
      
      if (supabaseUrl && supabaseAnonKey) {
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        });
        
        // Get access token from cookies
        const accessToken = event.cookies.get('sb-access-token');
        const refreshToken = event.cookies.get('sb-refresh-token');
        
        if (accessToken && refreshToken) {
          try {
            // Set the session on the Supabase client
            const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken
            });
            
            if (!sessionError && sessionData.user) {
              // Store user in locals for use in load functions
              event.locals.user = sessionData.user;
              event.locals.session = sessionData.session;
              
              // Fetch user profile from users table
              try {
                const { data: profile } = await supabase
                  .from('users')
                  .select('*')
                  .eq('id', sessionData.user.id)
                  .single();
                
                if (profile) {
                  event.locals.userProfile = profile;
                }
              } catch (profileError) {
                // Profile fetch failed, but user is still authenticated
                logger.warn('Failed to fetch user profile', {
                  userId: sessionData.user.id,
                  error: profileError.message
                });
              }
            } else {
              // Session is invalid, clear cookies
              event.cookies.delete('sb-access-token', { path: '/' });
              event.cookies.delete('sb-refresh-token', { path: '/' });
            }
          } catch (authError) {
            // Authentication failed, clear any invalid cookies
            logger.warn('Server-side authentication failed', { error: authError.message });
            event.cookies.delete('sb-access-token', { path: '/' });
            event.cookies.delete('sb-refresh-token', { path: '/' });
          }
        }
      }
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
              location: newPath,
              'x-correlation-id': event.locals.correlationId
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
              location: localizedPath,
              'x-correlation-id': event.locals.correlationId
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
      
    } catch (error) {
      // Handle errors with our error handler
      const correlationId = event.locals.correlationId;
      logger.error('Request handling failed', {
        error,
        correlationId,
        pathname,
        method: request.method
      });
      
      // Return error response
      throw error;
    }
  }});
}

/**
 * Handle errors with comprehensive logging and error tracking
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
  
  // Get correlation ID from event locals
  const correlationId = event.locals?.correlationId;
  
  // Log error with our centralized error handler
  errorHandler.logError(error, correlationId, {
    url: event.url?.pathname,
    method: event.request?.method,
    userAgent: event.request?.headers?.get('user-agent'),
    ip: event.getClientAddress?.()
  });
  
  // Determine if we should expose error details
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isOperationalError = errorHandler.isOperationalError(error);
  
  return {
    message: (isDevelopment || isOperationalError) ? error.message : 'An unexpected error occurred',
    code: error?.code ?? 'UNKNOWN',
    correlationId
  };
}