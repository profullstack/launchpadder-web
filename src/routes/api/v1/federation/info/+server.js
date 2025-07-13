/**
 * API v1 Federation Info Endpoint
 * 
 * Provides detailed federation capabilities and configuration information
 * for other LaunchPadder instances to determine compatibility.
 */

import { json } from '@sveltejs/kit';

/**
 * GET /api/v1/federation/info
 * Returns federation capabilities and configuration
 */
export async function GET() {
  try {
    const federationInfo = {
      federation_enabled: true,
      instance_name: process.env.INSTANCE_NAME || 'LaunchPadder',
      instance_description: 'API-driven launch platform for federated directory submissions',
      version: '1.0.0',
      api_version: '1.0',
      supported_features: [
        'submissions',
        'directories',
        'metadata_extraction',
        'ai_enhancement',
        'crypto_payments',
        'moderation',
        'webhooks',
        'analytics',
        'partner_management'
      ],
      api_endpoints: [
        '/api/v1/federation/health',
        '/api/v1/federation/info',
        '/api/v1/federation/directories',
        '/api/v1/federation/instances',
        '/api/v1/federation/submit',
        '/api/v1/submissions',
        '/api/v1/analytics/overview',
        '/api/v1/analytics/federation',
        '/api/v1/partners',
        '/api/v1/webhooks'
      ],
      submission_formats: [
        'url',
        'metadata',
        'enhanced_metadata'
      ],
      payment_methods: [
        'stripe',
        'crypto'
      ],
      supported_cryptocurrencies: [
        'bitcoin',
        'ethereum',
        'solana',
        'usdc',
        'usdt'
      ],
      rate_limits: {
        public: {
          requests_per_minute: 60
        },
        basic: {
          requests_per_hour: 100,
          submissions_per_day: 50
        },
        premium: {
          requests_per_hour: 1000,
          submissions_per_day: 500
        },
        enterprise: {
          requests_per_hour: 10000,
          submissions_per_day: 5000
        }
      },
      contact: {
        admin_email: process.env.ADMIN_EMAIL || 'admin@launchpadder.com',
        support_url: process.env.SUPPORT_URL || 'https://launchpadder.com/support',
        api_docs_url: process.env.API_DOCS_URL || 'https://launchpadder.com/api/docs'
      },
      federation: {
        accepts_submissions: true,
        shares_directories: true,
        requires_authentication: false,
        supports_webhooks: true,
        supports_real_time: true,
        max_batch_size: 100
      },
      security: {
        https_required: true,
        api_key_required: true,
        jwt_supported: true,
        webhook_signatures: true
      },
      capabilities: {
        ai_enhancement: true,
        metadata_extraction: true,
        image_processing: true,
        content_moderation: true,
        analytics: true,
        real_time_updates: true
      },
      limits: {
        max_submission_size: '10MB',
        max_description_length: 5000,
        max_tags: 20,
        supported_file_types: ['image/jpeg', 'image/png', 'image/webp']
      },
      timestamp: new Date().toISOString()
    };

    return json(federationInfo, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Federation info error:', error);
    
    return json({
      success: false,
      error: 'Failed to retrieve federation information',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * OPTIONS /api/v1/federation/info
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    }
  });
}