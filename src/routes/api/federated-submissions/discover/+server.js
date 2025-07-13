import { json } from '@sveltejs/kit';
import { createSupabaseClient } from '../../../../lib/config/supabase.js';
import { FederationDiscoveryService } from '../../../../lib/services/federation-discovery-service.js';
import { FederatedSubmissionService } from '../../../../lib/services/federated-submission-service.js';

/**
 * POST /api/federated-submissions/discover
 * Discover available directories across the federation network
 */
export async function POST({ request }) {
  try {
    // Get request body
    const { category, pricing_tier } = await request.json();

    // Create Supabase client
    const supabase = createSupabaseClient();

    // Verify authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Initialize services
    const federationDiscoveryService = new FederationDiscoveryService(supabase);
    const federatedSubmissionService = new FederatedSubmissionService(
      supabase,
      federationDiscoveryService
    );

    // Discover available directories
    const directories = await federatedSubmissionService.discoverAvailableDirectories({
      category,
      pricing_tier
    });

    return json({
      success: true,
      directories,
      total_count: directories.length
    });

  } catch (error) {
    console.error('Error discovering federated directories:', error);
    return json(
      { 
        success: false, 
        error: `Failed to discover directories: ${error.message}` 
      },
      { status: 500 }
    );
  }
}