/**
 * Preview API Endpoint
 * Provides metadata preview for URL submissions without creating a submission
 */

import { json } from '@sveltejs/kit';
import { createSubmissionService } from '$lib/services/submission-service.js';
import { supabase } from '$lib/config/supabase.js';

export async function POST({ request }) {
  try {
    const { url } = await request.json();

    // Validate URL
    if (!url || typeof url !== 'string') {
      return json({ error: 'URL is required' }, { status: 400 });
    }

    try {
      new URL(url);
    } catch {
      return json({ error: 'Invalid URL format' }, { status: 400 });
    }

    // Create submission service for metadata fetching
    const submissionService = createSubmissionService({
      supabase,
      useEnhancedAI: true
    });

    try {
      // Fetch metadata only (no database insertion)
      const originalMetadata = await submissionService.fetchMetadataWithRetry(url);
      
      // Generate enhanced metadata for preview
      const enhancedMetadata = await submissionService.enhanceMetadataWithRetry(originalMetadata);

      // Prepare preview response
      const preview = {
        url,
        title: enhancedMetadata.title || originalMetadata.title || 'Untitled Product',
        description: enhancedMetadata.description || originalMetadata.description || 'No description available',
        images: {
          main: originalMetadata.images?.[0]?.url || originalMetadata.image,
          favicon: originalMetadata.favicons?.[0]?.url || originalMetadata.favicon
        },
        aiEnhancements: enhancedMetadata.aiEnhancements || null,
        metadata: {
          original: originalMetadata,
          enhanced: enhancedMetadata
        }
      };

      // Cleanup resources
      await submissionService.cleanup();

      return json(preview);

    } catch (error) {
      // Cleanup on error
      await submissionService.cleanup();
      
      console.error('Preview generation error:', error);
      
      // Return user-friendly error messages
      if (error.message.includes('Invalid URL')) {
        return json({ error: 'Unable to access the provided URL' }, { status: 400 });
      }
      
      if (error.message.includes('timeout')) {
        return json({ error: 'The website took too long to respond' }, { status: 408 });
      }
      
      if (error.message.includes('not allowed')) {
        return json({ error: 'This URL cannot be accessed for security reasons' }, { status: 403 });
      }

      return json({ 
        error: 'Unable to fetch preview. The URL may be inaccessible or the site may be down.' 
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Preview API error:', error);
    return json({ error: 'Invalid request format' }, { status: 400 });
  }
}