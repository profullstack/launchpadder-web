/**
 * Badge Management API Endpoints
 * 
 * Provides REST API endpoints for managing badges in the federation system.
 * Supports badge definitions, user badge assignments, analytics, and verification.
 */

import { json } from '@sveltejs/kit';
import { supabase } from '$lib/config/supabase.js';
import { BadgeService } from '$lib/services/badge-service.js';

const badgeService = new BadgeService(supabase);

/**
 * GET /api/badges
 * Get all badge definitions or filter by category/level
 */
export async function GET({ url, locals }) {
  try {
    const category = url.searchParams.get('category');
    const level = url.searchParams.get('level');
    const federationOnly = url.searchParams.get('federation') === 'true';

    const options = {};
    if (category) options.category = category;
    if (level) options.level = level;
    if (federationOnly) options.federationOnly = true;

    const result = await badgeService.getBadgeDefinitions(options);

    if (!result.success) {
      return json(
        { error: result.error },
        { status: 400 }
      );
    }

    return json({
      success: true,
      data: result.data,
      meta: {
        total: result.data.length,
        filters: { category, level, federationOnly }
      }
    });
  } catch (error) {
    console.error('Badge definitions fetch error:', error);
    return json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/badges
 * Create a new badge definition (admin only)
 */
export async function POST({ request, locals }) {
  try {
    // Check if user is authenticated and has admin privileges
    if (!locals.user) {
      return json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // TODO: Add proper admin role check
    // For now, we'll use a simple check
    const isAdmin = locals.user.email?.endsWith('@admin.com') || false;
    if (!isAdmin) {
      return json(
        { error: 'Admin privileges required' },
        { status: 403 }
      );
    }

    const badgeData = await request.json();

    // Validate required fields
    const requiredFields = ['slug', 'name', 'description', 'category'];
    for (const field of requiredFields) {
      if (!badgeData[field]) {
        return json(
          { error: `${field} is required` },
          { status: 400 }
        );
      }
    }

    // Insert badge definition
    const { data, error } = await supabase
      .from('badge_definitions')
      .insert([{
        slug: badgeData.slug,
        name: badgeData.name,
        description: badgeData.description,
        category: badgeData.category,
        level: badgeData.level || 'bronze',
        icon_url: badgeData.icon_url,
        color_hex: badgeData.color_hex || '#6B7280',
        visual_metadata: badgeData.visual_metadata || {},
        criteria: badgeData.criteria || {},
        requirements: badgeData.requirements || {},
        max_awards: badgeData.max_awards,
        is_federation_badge: badgeData.is_federation_badge || false,
        requires_verification: badgeData.requires_verification || false,
        verification_criteria: badgeData.verification_criteria || {},
        progression_rules: badgeData.progression_rules || {},
        sort_order: badgeData.sort_order || 0
      }])
      .select()
      .single();

    if (error) {
      return json(
        { error: `Failed to create badge: ${error.message}` },
        { status: 400 }
      );
    }

    return json({
      success: true,
      data,
      message: 'Badge definition created successfully'
    }, { status: 201 });

  } catch (error) {
    console.error('Badge creation error:', error);
    return json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}