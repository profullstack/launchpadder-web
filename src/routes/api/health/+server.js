import { json } from '@sveltejs/kit';

/**
 * Health check endpoint for Docker container monitoring
 * @type {import('./$types').RequestHandler}
 */
export async function GET() {
	try {
		// Basic health check - can be extended with database connectivity checks
		const healthStatus = {
			status: 'healthy',
			timestamp: new Date().toISOString(),
			uptime: process.uptime(),
			environment: process.env.NODE_ENV || 'development',
			version: process.env.npm_package_version || '1.0.0'
		};

		return json(healthStatus, { status: 200 });
	} catch (error) {
		console.error('Health check failed:', error);
		
		return json(
			{
				status: 'unhealthy',
				timestamp: new Date().toISOString(),
				error: error.message
			},
			{ status: 503 }
		);
	}
}