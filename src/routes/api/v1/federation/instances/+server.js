/**
 * API v1 Federation Instances Endpoint
 * 
 * Provides information about known federation instances in the network.
 */

import { json } from '@sveltejs/kit';
import { createSupabaseClient } from '../../../../../lib/config/supabase.js';

/**
 * GET /api/v1/federation/instances
 * Returns list of known federation instances
 */
export async function GET({ url }) {
  try {
    // Parse query parameters
    const limit = Math.min(parseInt(url.searchParams.get('limit')) || 50, 100);
    const offset = Math.max(parseInt(url.searchParams.get('offset')) || 0, 0);
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search');

    const supabase = createSupabaseClient();

    // Build query for federation instances
    let query = supabase
      .from('federation_instances')
      .select(`
        id,
        name,
        url,
        status,
        last_seen,
        capabilities,
        trust_score,
        api_version,
        supported_features,
        contact_info,
        created_at,
        updated_at
      `)
      .order('trust_score', { ascending: false });

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,url.ilike.%${search}%`);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: instances, error: instancesError } = await query;

    if (instancesError) {
      throw instancesError;
    }

    // Get total count
    let countQuery = supabase
      .from('federation_instances')
      .select('*', { count: 'exact', head: true });

    if (status) {
      countQuery = countQuery.eq('status', status);
    }

    if (search) {
      countQuery = countQuery.or(`name.ilike.%${search}%,url.ilike.%${search}%`);
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      throw countError;
    }

    // Transform instances to API format
    const formattedInstances = (instances || []).map(instance => ({
      id: instance.id,
      name: instance.name,
      url: instance.url,
      status: instance.status,
      last_seen: instance.last_seen,
      capabilities: instance.capabilities || [],
      trust_score: instance.trust_score || 0,
      api_version: instance.api_version || '1.0',
      supported_features: instance.supported_features || [],
      contact_info: instance.contact_info || {},
      federation_compatible: true,
      last_health_check: instance.last_seen,
      response_time_ms: Math.floor(Math.random() * 500) + 100, // Mock response time
      uptime_percentage: instance.status === 'active' ? 99.9 : 0
    }));

    // Calculate network statistics
    const networkStats = {
      total_instances: count || 0,
      active_instances: formattedInstances.filter(i => i.status === 'active').length,
      average_trust_score: formattedInstances.length > 0 
        ? formattedInstances.reduce((sum, i) => sum + i.trust_score, 0) / formattedInstances.length 
        : 0,
      supported_features: [...new Set(formattedInstances.flatMap(i => i.supported_features))],
      api_versions: [...new Set(formattedInstances.map(i => i.api_version))]
    };

    const response = {
      success: true,
      instances: formattedInstances,
      pagination: {
        total: count || 0,
        limit,
        offset,
        has_more: offset + limit < (count || 0)
      },
      network_stats: networkStats,
      filters: {
        available_statuses: ['active', 'inactive', 'error', 'maintenance'],
        search_supported: true,
        sort_options: ['trust_score', 'last_seen', 'name']
      },
      timestamp: new Date().toISOString()
    };

    return json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Federation instances error:', error);
    
    return json({
      success: false,
      error: 'Failed to retrieve federation instances',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * POST /api/v1/federation/instances
 * Register a new federation instance (requires authentication)
 */
export async function POST({ request, locals }) {
  try {
    // Check authentication
    if (!locals.auth) {
      return json({
        success: false,
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
        timestamp: new Date().toISOString()
      }, { status: 401 });
    }

    const { name, url, capabilities, contact_info } = await request.json();

    // Validate required fields
    if (!name || !url) {
      return json({
        success: false,
        error: 'Name and URL are required',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString()
      }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return json({
        success: false,
        error: 'Invalid URL format',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString()
      }, { status: 400 });
    }

    const supabase = createSupabaseClient();

    // Check if instance already exists
    const { data: existing } = await supabase
      .from('federation_instances')
      .select('id')
      .eq('url', url)
      .single();

    if (existing) {
      return json({
        success: false,
        error: 'Federation instance with this URL already exists',
        code: 'CONFLICT',
        timestamp: new Date().toISOString()
      }, { status: 409 });
    }

    // Create new federation instance
    const { data: instance, error: createError } = await supabase
      .from('federation_instances')
      .insert({
        name,
        url,
        status: 'active',
        capabilities: capabilities || [],
        contact_info: contact_info || {},
        trust_score: 5.0, // Default trust score
        api_version: '1.0',
        supported_features: ['submissions'],
        last_seen: new Date().toISOString(),
        created_by: locals.auth.type === 'federation_partner' 
          ? locals.auth.partner.id 
          : locals.auth.user.id
      })
      .select()
      .single();

    if (createError) {
      throw createError;
    }

    return json({
      success: true,
      instance: {
        id: instance.id,
        name: instance.name,
        url: instance.url,
        status: instance.status,
        capabilities: instance.capabilities,
        trust_score: instance.trust_score,
        created_at: instance.created_at
      },
      timestamp: new Date().toISOString()
    }, { status: 201 });

  } catch (error) {
    console.error('Create federation instance error:', error);
    
    return json({
      success: false,
      error: 'Failed to create federation instance',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * OPTIONS /api/v1/federation/instances
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
      'Access-Control-Max-Age': '86400'
    }
  });
}