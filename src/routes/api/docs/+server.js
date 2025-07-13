/**
 * API Documentation Endpoint
 * 
 * Serves interactive Swagger UI documentation for the LaunchPadder Federation API.
 */

import { json } from '@sveltejs/kit';
import swaggerJSDoc from 'swagger-jsdoc';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * GET /api/docs
 * Returns the OpenAPI specification as JSON
 */
export async function GET({ url }) {
  try {
    const format = url.searchParams.get('format') || 'json';
    
    // Read the OpenAPI YAML file
    const openApiPath = path.join(__dirname, '../../../docs/api/openapi.yaml');
    const openApiContent = fs.readFileSync(openApiPath, 'utf8');
    
    if (format === 'yaml') {
      return new Response(openApiContent, {
        status: 200,
        headers: {
          'Content-Type': 'application/x-yaml',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }
    
    // Convert YAML to JSON using swagger-jsdoc
    const options = {
      definition: {},
      apis: [] // We're reading from file instead
    };
    
    // Parse YAML content
    const YAML = await import('yamljs');
    const openApiSpec = YAML.parse(openApiContent);
    
    return json(openApiSpec, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=3600'
      }
    });
    
  } catch (error) {
    console.error('API docs error:', error);
    
    return json({
      success: false,
      error: 'Failed to load API documentation',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}