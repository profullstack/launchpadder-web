/**
 * API v1 Authentication Token Endpoint
 * 
 * Handles API key to JWT token exchange for federation partners.
 */

import { json } from '@sveltejs/kit';
import jwt from 'jsonwebtoken';
import { supabase } from '../../../../../lib/config/supabase.js';

/**
 * POST /api/v1/auth/token
 * Exchange API key for JWT token
 */
export async function POST({ request }) {
  try {
    const { api_key } = await request.json();

    // Validate required fields
    if (!api_key) {
      return json({
        success: false,
        error: 'API key is required',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString()
      }, { status: 400 });
    }

    // Validate API key format
    if (!api_key.startsWith('fed_key_')) {
      return json({
        success: false,
        error: 'Invalid API key format',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString()
      }, { status: 400 });
    }

    // Use imported supabase client directly

    // Find federation partner by API key
    const { data: partner, error: partnerError } = await supabase
      .from('federation_partners')
      .select('*')
      .eq('api_key', api_key)
      .eq('status', 'active')
      .single();

    if (partnerError || !partner) {
      return json({
        success: false,
        error: 'Invalid API key',
        code: 'UNAUTHORIZED',
        timestamp: new Date().toISOString()
      }, { status: 401 });
    }

    // Update last active timestamp
    await supabase
      .from('federation_partners')
      .update({ last_active: new Date().toISOString() })
      .eq('id', partner.id);

    // Generate JWT token
    const tokenPayload = {
      type: 'federation_partner',
      partner_id: partner.id,
      tier: partner.tier || 'basic',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour expiration
    };

    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET || 'your-secret-key',
      { algorithm: 'HS256' }
    );

    // Prepare partner info (without sensitive data)
    const partnerInfo = {
      id: partner.id,
      name: partner.name,
      organization: partner.organization,
      tier: partner.tier || 'basic',
      rate_limit: partner.rate_limit || 100,
      status: partner.status
    };

    return json({
      success: true,
      token,
      expires_in: 3600, // 1 hour in seconds
      partner_info: partnerInfo,
      timestamp: new Date().toISOString()
    }, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });

  } catch (error) {
    console.error('Token generation error:', error);
    
    return json({
      success: false,
      error: 'Failed to generate token',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * OPTIONS /api/v1/auth/token
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    }
  });
}