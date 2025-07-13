/**
 * Federation Health Check API Endpoint
 * 
 * Provides health status and basic information about this LaunchPadder instance
 * for federation discovery and compatibility checking.
 */

import { json } from '@sveltejs/kit';

/**
 * GET /api/federation/health
 * Returns health status and instance information
 */
export async function GET() {
  try {
    const healthData = {
      status: 'healthy',
      version: '1.0.0',
      api_version: '1.0',
      instance_name: 'LaunchPadder',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      federation_enabled: true
    };

    return json(healthData, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  } catch (error) {
    console.error('Health check error:', error);
    
    return json({
      status: 'unhealthy',
      error: 'Internal server error',
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
 * OPTIONS /api/federation/health
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