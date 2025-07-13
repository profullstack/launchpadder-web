/**
 * Federation Directories API Endpoint
 * 
 * Provides information about available directories on this LaunchPadder instance
 * for other federation instances to discover submission targets.
 */

import { json } from '@sveltejs/kit';

/**
 * GET /api/federation/directories
 * Returns list of available directories for federation submissions
 */
export async function GET({ url }) {
  try {
    // Parse query parameters
    const category = url.searchParams.get('category');
    const limit = parseInt(url.searchParams.get('limit')) || 50;
    const offset = parseInt(url.searchParams.get('offset')) || 0;

    // Mock directories data - in a real implementation, this would come from the database
    let directories = [
      {
        id: 'main',
        name: 'Main Directory',
        description: 'Primary product and service directory',
        category: 'products',
        submission_count: 1250,
        last_updated: new Date().toISOString(),
        submission_fee: {
          usd: 5.00,
          crypto_supported: true
        },
        requirements: {
          url_required: true,
          description_min_length: 50,
          moderation_required: true
        },
        tags: ['products', 'services', 'startups'],
        status: 'active'
      },
      {
        id: 'startups',
        name: 'Startup Showcase',
        description: 'Directory for early-stage startups and new ventures',
        category: 'startups',
        submission_count: 890,
        last_updated: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        submission_fee: {
          usd: 10.00,
          crypto_supported: true
        },
        requirements: {
          url_required: true,
          description_min_length: 100,
          moderation_required: true
        },
        tags: ['startups', 'ventures', 'funding'],
        status: 'active'
      },
      {
        id: 'tools',
        name: 'Developer Tools',
        description: 'Directory for developer tools and productivity software',
        category: 'tools',
        submission_count: 567,
        last_updated: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
        submission_fee: {
          usd: 3.00,
          crypto_supported: true
        },
        requirements: {
          url_required: true,
          description_min_length: 30,
          moderation_required: false
        },
        tags: ['tools', 'development', 'productivity'],
        status: 'active'
      },
      {
        id: 'ai',
        name: 'AI & Machine Learning',
        description: 'Directory for AI tools, models, and ML platforms',
        category: 'ai',
        submission_count: 423,
        last_updated: new Date(Date.now() - 259200000).toISOString(), // 3 days ago
        submission_fee: {
          usd: 7.50,
          crypto_supported: true
        },
        requirements: {
          url_required: true,
          description_min_length: 75,
          moderation_required: true
        },
        tags: ['ai', 'machine-learning', 'automation'],
        status: 'active'
      },
      {
        id: 'design',
        name: 'Design Resources',
        description: 'Directory for design tools, assets, and creative resources',
        category: 'design',
        submission_count: 334,
        last_updated: new Date(Date.now() - 345600000).toISOString(), // 4 days ago
        submission_fee: {
          usd: 4.00,
          crypto_supported: true
        },
        requirements: {
          url_required: true,
          description_min_length: 40,
          moderation_required: false
        },
        tags: ['design', 'creative', 'assets'],
        status: 'active'
      }
    ];

    // Filter by category if specified
    if (category) {
      directories = directories.filter(dir => dir.category === category);
    }

    // Sort by submission count (most active first)
    directories.sort((a, b) => b.submission_count - a.submission_count);

    // Apply pagination
    const total = directories.length;
    directories = directories.slice(offset, offset + limit);

    const response = {
      directories,
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + limit < total
      },
      federation_info: {
        instance_name: 'LaunchPadder',
        accepts_submissions: true,
        submission_endpoint: '/api/federation/submit',
        supported_formats: ['url', 'metadata', 'enhanced_metadata'],
        payment_methods: ['stripe', 'crypto']
      },
      timestamp: new Date().toISOString()
    };

    return json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=1800', // Cache for 30 minutes
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  } catch (error) {
    console.error('Federation directories error:', error);
    
    return json({
      error: 'Failed to retrieve directories',
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
 * OPTIONS /api/federation/directories
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