/**
 * Badge Verification API Endpoint
 * 
 * Handles cryptographic verification of badges for cross-platform trust
 * and authenticity checking in the federation network.
 */

import { json } from '@sveltejs/kit';
import { supabase } from '$lib/config/supabase.js';
import { BadgeService } from '$lib/services/badge-service.js';

const badgeService = new BadgeService(supabase);

/**
 * POST /api/badges/verify
 * Verify a badge's cryptographic signature
 */
export async function POST({ request }) {
  try {
    const verificationData = await request.json();
    const { 
      userBadgeId, 
      signature, 
      payload, 
      publicKey,
      instanceUrl 
    } = verificationData;

    // Validate required fields
    if (!userBadgeId || !signature || !payload || !publicKey) {
      return json(
        { error: 'userBadgeId, signature, payload, and publicKey are required' },
        { status: 400 }
      );
    }

    // Validate the signature
    const validationResult = await badgeService.validateBadgeSignature(
      signature,
      payload,
      publicKey
    );

    if (!validationResult.success) {
      return json(
        { error: validationResult.error },
        { status: 400 }
      );
    }

    const isValid = validationResult.data.isValid;

    // If signature is valid, create verification record
    if (isValid) {
      const verificationRecord = await badgeService.verifyBadge(userBadgeId, {
        signature_hash: signature,
        public_key: publicKey,
        verification_payload: payload
      });

      if (!verificationRecord.success) {
        return json(
          { error: verificationRecord.error },
          { status: 400 }
        );
      }

      return json({
        success: true,
        data: {
          isValid: true,
          verificationId: verificationRecord.data.id,
          verifiedAt: new Date().toISOString(),
          instanceUrl,
          ...validationResult.data
        },
        message: 'Badge signature verified successfully'
      });
    } else {
      return json({
        success: true,
        data: {
          isValid: false,
          reason: 'Invalid signature',
          ...validationResult.data
        },
        message: 'Badge signature verification failed'
      });
    }

  } catch (error) {
    console.error('Badge verification error:', error);
    return json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/badges/verify
 * Get verification status for a badge
 */
export async function GET({ url }) {
  try {
    const userBadgeId = url.searchParams.get('userBadgeId');
    const signatureHash = url.searchParams.get('signature');

    if (!userBadgeId && !signatureHash) {
      return json(
        { error: 'userBadgeId or signature parameter is required' },
        { status: 400 }
      );
    }

    let query = supabase
      .from('badge_verifications')
      .select(`
        *,
        user_badges!inner(
          user_id,
          earned_at,
          badge_definitions!inner(slug, name, category, level)
        )
      `);

    if (userBadgeId) {
      query = query.eq('user_badge_id', userBadgeId);
    } else {
      query = query.eq('signature_hash', signatureHash);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      return json(
        { error: `Failed to fetch verification: ${error.message}` },
        { status: 400 }
      );
    }

    return json({
      success: true,
      data: data || [],
      meta: {
        userBadgeId,
        signatureHash,
        total: data?.length || 0
      }
    });

  } catch (error) {
    console.error('Badge verification fetch error:', error);
    return json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}