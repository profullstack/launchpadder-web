/**
 * API v1 Layout Server
 * 
 * Handles API versioning, authentication, rate limiting, and common middleware
 * for all v1 API endpoints.
 */

import { json } from '@sveltejs/kit';
import jwt from 'jsonwebtoken';
import { supabase } from '../../../lib/config/supabase.js';

/**
 * Rate limiting store (in production, use Redis or similar)
 */
const rateLimitStore = new Map();

/**
 * Rate limiting configuration by tier
 */
const RATE_LIMITS = {
  basic: { requests: 100, window: 3600000 }, // 100 requests per hour
  premium: { requests: 1000, window: 3600000 }, // 1000 requests per hour
  enterprise: { requests: 10000, window: 3600000 }, // 10000 requests per hour
  public: { requests: 60, window: 60000 } // 60 requests per minute for public endpoints
};

/**
 * Check rate limit for a given key and tier
 */
function checkRateLimit(key, tier = 'public') {
  const limit = RATE_LIMITS[tier];
  if (!limit) return { allowed: false, error: 'Invalid tier' };

  const now = Date.now();
  const windowStart = now - limit.window;

  // Get or create rate limit data for this key
  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, []);
  }

  const requests = rateLimitStore.get(key);
  
  // Remove old requests outside the window
  const validRequests = requests.filter(timestamp => timestamp > windowStart);
  
  // Check if limit exceeded
  if (validRequests.length >= limit.requests) {
    return {
      allowed: false,
      error: 'Rate limit exceeded',
      limit: limit.requests,
      remaining: 0,
      reset: Math.ceil((validRequests[0] + limit.window) / 1000)
    };
  }

  // Add current request
  validRequests.push(now);
  rateLimitStore.set(key, validRequests);

  return {
    allowed: true,
    limit: limit.requests,
    remaining: limit.requests - validRequests.length,
    reset: Math.ceil((now + limit.window) / 1000)
  };
}

/**
 * Verify JWT token and get user/partner info
 */
async function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    // Use imported supabase client directly
    
    if (decoded.type === 'federation_partner') {
      // Get federation partner info
      const { data: partner, error } = await supabase
        .from('federation_partners')
        .select('*')
        .eq('id', decoded.partner_id)
        .eq('status', 'active')
        .single();

      if (error || !partner) {
        return { error: 'Invalid partner token' };
      }

      return {
        type: 'federation_partner',
        partner,
        tier: partner.tier || 'basic'
      };
    } else {
      // Get user info
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error || !user) {
        return { error: 'Invalid user token' };
      }

      return {
        type: 'user',
        user,
        tier: 'basic' // Users get basic tier by default
      };
    }
  } catch (error) {
    return { error: 'Invalid token' };
  }
}

/**
 * Handle API v1 requests with common middleware
 */
export async function handle({ event, resolve }) {
  const { request, url } = event;
  
  // Skip middleware for OPTIONS requests
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  // Add CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key'
  };

  try {
    // Determine if endpoint requires authentication
    const publicEndpoints = [
      '/api/v1/federation/info',
      '/api/v1/federation/directories',
      '/api/v1/federation/instances',
      '/api/v1/auth/token'
    ];

    const isPublicEndpoint = publicEndpoints.some(endpoint => 
      url.pathname.startsWith(endpoint)
    );

    let authInfo = null;
    let rateLimitKey = request.headers.get('x-forwarded-for') || 'anonymous';
    let tier = 'public';

    // Handle authentication for protected endpoints
    if (!isPublicEndpoint) {
      const authHeader = request.headers.get('authorization');
      const apiKey = request.headers.get('x-api-key');

      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        authInfo = await verifyToken(token);
        
        if (authInfo.error) {
          return json({
            success: false,
            error: authInfo.error,
            code: 'UNAUTHORIZED',
            timestamp: new Date().toISOString()
          }, {
            status: 401,
            headers: corsHeaders
          });
        }

        rateLimitKey = authInfo.type === 'federation_partner' 
          ? `partner:${authInfo.partner.id}`
          : `user:${authInfo.user.id}`;
        tier = authInfo.tier;
      } else if (apiKey) {
        // Handle API key authentication (for direct API key usage)
        // Use imported supabase client directly
        const { data: partner, error } = await supabase
          .from('federation_partners')
          .select('*')
          .eq('api_key', apiKey)
          .eq('status', 'active')
          .single();

        if (error || !partner) {
          return json({
            success: false,
            error: 'Invalid API key',
            code: 'UNAUTHORIZED',
            timestamp: new Date().toISOString()
          }, {
            status: 401,
            headers: corsHeaders
          });
        }

        authInfo = {
          type: 'federation_partner',
          partner,
          tier: partner.tier || 'basic'
        };
        rateLimitKey = `partner:${partner.id}`;
        tier = partner.tier || 'basic';
      } else {
        return json({
          success: false,
          error: 'Authentication required',
          code: 'UNAUTHORIZED',
          timestamp: new Date().toISOString()
        }, {
          status: 401,
          headers: corsHeaders
        });
      }
    }

    // Apply rate limiting
    const rateLimit = checkRateLimit(rateLimitKey, tier);
    
    if (!rateLimit.allowed) {
      return json({
        success: false,
        error: rateLimit.error,
        code: 'RATE_LIMITED',
        timestamp: new Date().toISOString()
      }, {
        status: 429,
        headers: {
          ...corsHeaders,
          'X-RateLimit-Limit': rateLimit.limit?.toString() || '0',
          'X-RateLimit-Remaining': rateLimit.remaining?.toString() || '0',
          'X-RateLimit-Reset': rateLimit.reset?.toString() || '0'
        }
      });
    }

    // Add auth info and rate limit info to event locals
    event.locals.auth = authInfo;
    event.locals.rateLimit = rateLimit;

    // Continue with the request
    const response = await resolve(event);

    // Add rate limit headers to successful responses
    if (response.status < 400) {
      const headers = new Headers(response.headers);
      headers.set('X-RateLimit-Limit', rateLimit.limit?.toString() || '0');
      headers.set('X-RateLimit-Remaining', rateLimit.remaining?.toString() || '0');
      headers.set('X-RateLimit-Reset', rateLimit.reset?.toString() || '0');
      
      // Add CORS headers
      Object.entries(corsHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }

    return response;

  } catch (error) {
    console.error('API v1 middleware error:', error);
    
    return json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    }, {
      status: 500,
      headers: corsHeaders
    });
  }
}