/**
 * Federation Instances Management API Endpoint
 * 
 * Manages federation instances for discovery and registration.
 * Provides endpoints for registering new instances and retrieving known instances.
 */

import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { FederationDiscoveryService } from '../../../../lib/services/federation-discovery-service.js';

// Initialize Supabase client
const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize federation discovery service
const federationService = new FederationDiscoveryService(supabase);

/**
 * GET /api/federation/instances
 * Returns list of known federation instances
 */
export async function GET({ url }) {
  try {
    // Parse query parameters
    const status = url.searchParams.get('status');
    const limit = parseInt(url.searchParams.get('limit')) || 50;

    // Get known instances
    const instances = await federationService.getKnownInstances({
      status,
      limit
    });

    // Filter sensitive information for public API
    const publicInstances = instances.map(instance => ({
      id: instance.id,
      name: instance.name,
      base_url: instance.base_url,
      description: instance.description,
      status: instance.status,
      last_seen: instance.last_seen,
      created_at: instance.created_at
      // Exclude admin_email and other sensitive fields
    }));

    return json({
      instances: publicInstances,
      total: publicInstances.length,
      timestamp: new Date().toISOString()
    }, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  } catch (error) {
    console.error('Federation instances GET error:', error);
    
    return json({
      error: 'Failed to retrieve federation instances',
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
 * POST /api/federation/instances
 * Register a new federation instance
 */
export async function POST({ request }) {
  try {
    const body = await request.json();
    
    // Validate required fields
    const { name, base_url, description, admin_email } = body;
    
    if (!name || !base_url || !admin_email) {
      return json({
        error: 'Missing required fields: name, base_url, admin_email',
        timestamp: new Date().toISOString()
      }, {
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Register the instance
    const result = await federationService.registerInstance({
      name,
      base_url,
      description: description || '',
      admin_email
    });

    if (result.success) {
      // Verify the instance after registration
      const verification = await federationService.verifyInstance(base_url);
      
      // Update status based on verification
      const status = verification.healthy && verification.compatible ? 'active' : 'pending';
      await federationService.updateInstanceStatus(result.instance.id, status);

      // Return public information only
      const publicInstance = {
        id: result.instance.id,
        name: result.instance.name,
        base_url: result.instance.base_url,
        description: result.instance.description,
        status,
        created_at: result.instance.created_at,
        verification: {
          healthy: verification.healthy,
          compatible: verification.compatible,
          federation_enabled: verification.federation_enabled
        }
      };

      return json({
        success: true,
        instance: publicInstance,
        message: 'Federation instance registered successfully',
        timestamp: new Date().toISOString()
      }, {
        status: 201,
        headers: {
          'Access-Control-Allow-Origin': '*'
        }
      });
    } else {
      return json({
        error: 'Failed to register federation instance',
        timestamp: new Date().toISOString()
      }, {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  } catch (error) {
    console.error('Federation instances POST error:', error);
    
    return json({
      error: error.message || 'Failed to register federation instance',
      timestamp: new Date().toISOString()
    }, {
      status: 400,
      headers: {
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

/**
 * OPTIONS /api/federation/instances
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    }
  });
}