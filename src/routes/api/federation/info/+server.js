/**
 * Federation Info API Endpoint
 * 
 * Provides detailed federation capabilities and configuration information
 * for other LaunchPadder instances to determine compatibility.
 */

import { json } from '@sveltejs/kit';

/**
 * GET /api/federation/info
 * Returns federation capabilities and configuration
 */
export async function GET() {
  try {
    const federationInfo = {
      federation_enabled: true,
      instance_name: 'LaunchPadder',
      instance_description: 'API-driven launch platform for federated directory submissions',
      version: '1.0.0',
      api_version: '1.0',
      supported_features: [
        'submissions',
        'directories',
        'metadata_extraction',
        'ai_enhancement',
        'crypto_payments',
        'moderation'
      ],
      api_endpoints: [
        '/api/federation/health',
        '/api/federation/info',
        '/api/federation/directories',
        '/api/federation/instances',
        '/api/federation/submit'
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
        'usdc'
      ],
      rate_limits: {
        submissions_per_hour: 100,
        api_calls_per_minute: 60
      },
      contact: {
        admin_email: process.env.ADMIN_EMAIL || 'admin@launchpadder.com',
        support_url: process.env.SUPPORT_URL || 'https://launchpadder.com/support'
      },
      federation: {
        accepts_submissions: true,
        shares_directories: true,
        requires_authentication: false,
        supports_webhooks: true
      },
      timestamp: new Date().toISOString()
    };

    return json(federationInfo, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  } catch (error) {
    console.error('Federation info error:', error);
    
    return json({
      error: 'Failed to retrieve federation information',
      timestamp: new Date().toISOString()
    }, {
      status: 500,
      headers: {
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

/**
 * OPTIONS /api/federation/info
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