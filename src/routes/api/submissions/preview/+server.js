/**
 * Preview API Endpoint
 * Provides metadata preview for URL submissions without creating a submission
 */

import { json } from '@sveltejs/kit';
import { createSubmissionService } from '$lib/services/submission-service.js';
import { supabase } from '$lib/config/supabase.js';

export async function POST({ request }) {
  try {
    console.log('[Preview API] Received request');
    
    let requestBody;
    try {
      requestBody = await request.json();
      console.log('[Preview API] Request body:', requestBody);
    } catch (parseError) {
      console.error('[Preview API] JSON parse error:', parseError);
      return json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    const { url } = requestBody;

    // Validate URL
    if (!url || typeof url !== 'string') {
      console.error('[Preview API] Invalid URL:', url);
      return json({ error: 'URL is required' }, { status: 400 });
    }

    try {
      new URL(url);
    } catch {
      console.error('[Preview API] Invalid URL format:', url);
      return json({ error: 'Invalid URL format' }, { status: 400 });
    }

    console.log('[Preview API] Creating submission service for URL:', url);

    // For preview, we don't need Supabase or AI - create a minimal service
    let submissionService;
    try {
      // Try to create with Supabase first, but disable AI components
      submissionService = createSubmissionService({
        supabase,
        useEnhancedAI: false, // Disable AI for faster preview
        aiRewriter: null, // Explicitly disable AI rewriter
        enhancedAIService: null // Explicitly disable enhanced AI service
      });
      console.log('[Preview API] Submission service created successfully with Supabase');
    } catch (serviceError) {
      console.warn('[Preview API] Failed to create submission service with Supabase:', serviceError.message);
      
      // Fallback: create service without Supabase and AI for preview-only functionality
      try {
        submissionService = createSubmissionService({
          supabase: null, // No database needed for preview
          useEnhancedAI: false,
          aiRewriter: null, // Explicitly disable AI rewriter
          enhancedAIService: null // Explicitly disable enhanced AI service
        });
        console.log('[Preview API] Submission service created successfully without Supabase and AI');
      } catch (fallbackError) {
        console.error('[Preview API] Failed to create fallback submission service:', fallbackError);
        return json({ error: 'Service initialization failed' }, { status: 500 });
      }
    }

    try {
      console.log('[Preview API] Fetching metadata for URL:', url);
      
      // Fetch metadata only (no database insertion)
      const originalMetadata = await submissionService.fetchMetadataWithRetry(url);
      console.log('[Preview API] Metadata fetched successfully');
      
      // For preview, we'll use the original metadata directly (no AI enhancement for speed)
      const preview = {
        url,
        title: originalMetadata.title || 'Untitled Product',
        description: originalMetadata.description || 'No description available',
        images: {
          main: originalMetadata.images?.primary || originalMetadata.images?.sources?.[0]?.url || originalMetadata.image,
          favicon: originalMetadata.favicons?.[0]?.url || originalMetadata.favicon
        },
        aiEnhancements: null, // No AI enhancements for preview
        metadata: {
          original: originalMetadata,
          enhanced: null
        },
        fetchMethod: originalMetadata.fetchMethod || 'unknown'
      };
      
      console.log('[Preview API] Preview prepared successfully');

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
    console.error('[Preview API] Outer catch - Unexpected error:', error);
    console.error('[Preview API] Error stack:', error.stack);
    
    // Provide more specific error information
    if (error.message.includes('Missing Supabase environment variables')) {
      return json({ error: 'Service configuration error' }, { status: 500 });
    }
    
    if (error.name === 'SyntaxError') {
      return json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }
    
    return json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}