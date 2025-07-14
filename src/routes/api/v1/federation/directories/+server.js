/**
 * API v1 Federation Directories Endpoint
 * 
 * Provides information about available directories on this LaunchPadder instance
 * for other federation instances to discover submission targets.
 */

import { json } from '@sveltejs/kit';
import { supabase } from '../../../../../lib/config/supabase.js';

/**
 * GET /api/v1/federation/directories
 * Returns list of available directories for federation submissions
 */
export async function GET({ url }) {
  try {
    // Parse query parameters
    const category = url.searchParams.get('category');
    const limit = Math.min(parseInt(url.searchParams.get('limit')) || 50, 100);
    const offset = Math.max(parseInt(url.searchParams.get('offset')) || 0, 0);
    const status = url.searchParams.get('status') || 'active';
    const search = url.searchParams.get('search');

    // Use imported supabase client directly

    // Build query for directories from database
    let query = supabase
      .from('directories')
      .select(`
        id,
        name,
        description,
        category,
        submission_count,
        last_updated,
        submission_fee_usd,
        crypto_supported,
        url_required,
        description_min_length,
        moderation_required,
        tags,
        status,
        created_at
      `)
      .eq('status', status)
      .order('submission_count', { ascending: false });

    // Apply filters
    if (category) {
      query = query.eq('category', category);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: directories, error: directoriesError } = await query;

    if (directoriesError) {
      throw directoriesError;
    }

    // Get total count for pagination
    let countQuery = supabase
      .from('directories')
      .select('*', { count: 'exact', head: true })
      .eq('status', status);

    if (category) {
      countQuery = countQuery.eq('category', category);
    }

    if (search) {
      countQuery = countQuery.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      throw countError;
    }

    // Transform directories to API format
    const formattedDirectories = (directories || []).map(dir => ({
      id: dir.id,
      name: dir.name,
      description: dir.description,
      category: dir.category,
      submission_count: dir.submission_count || 0,
      last_updated: dir.last_updated || dir.created_at,
      submission_fee: {
        usd: dir.submission_fee_usd || 5.00,
        crypto_supported: dir.crypto_supported || true
      },
      requirements: {
        url_required: dir.url_required !== false,
        description_min_length: dir.description_min_length || 50,
        moderation_required: dir.moderation_required !== false
      },
      tags: dir.tags || [],
      status: dir.status,
      federation_compatible: true,
      api_submission_url: `/api/v1/federation/submit`,
      webhook_supported: true
    }));

    // Get available categories
    const { data: categories } = await supabase
      .from('directories')
      .select('category')
      .eq('status', 'active')
      .not('category', 'is', null);

    const uniqueCategories = [...new Set(categories?.map(c => c.category) || [])];

    const response = {
      success: true,
      directories: formattedDirectories,
      pagination: {
        total: count || 0,
        limit,
        offset,
        has_more: offset + limit < (count || 0)
      },
      filters: {
        available_categories: uniqueCategories,
        available_statuses: ['active', 'maintenance'],
        search_supported: true
      },
      federation_info: {
        instance_name: process.env.INSTANCE_NAME || 'LaunchPadder',
        accepts_submissions: true,
        submission_endpoint: '/api/v1/federation/submit',
        supported_formats: ['url', 'metadata', 'enhanced_metadata'],
        payment_methods: ['stripe', 'crypto'],
        real_time_updates: true,
        webhook_notifications: true
      },
      timestamp: new Date().toISOString()
    };

    return json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=1800', // Cache for 30 minutes
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Federation directories error:', error);
    
    return json({
      success: false,
      error: 'Failed to retrieve directories',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * OPTIONS /api/v1/federation/directories
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