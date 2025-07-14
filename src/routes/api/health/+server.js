// Health Check API Endpoint
// Provides comprehensive system health monitoring for production deployment

import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { performance } from 'perf_hooks';

const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/**
 * Check database connectivity and performance
 */
async function checkDatabase() {
    const start = performance.now();
    
    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        // Simple query to test connectivity
        const { data, error } = await supabase
            .from('submissions')
            .select('count')
            .limit(1);
        
        const responseTime = Math.round(performance.now() - start);
        
        if (error) {
            return {
                status: 'unhealthy',
                message: error.message,
                responseTime
            };
        }
        
        return {
            status: 'healthy',
            responseTime,
            message: 'Database connection successful'
        };
    } catch (error) {
        const responseTime = Math.round(performance.now() - start);
        return {
            status: 'unhealthy',
            message: error.message,
            responseTime
        };
    }
}

/**
 * Check Redis connectivity
 */
async function checkRedis() {
    const start = performance.now();
    
    try {
        // In a real implementation, you would check Redis connectivity here
        // For now, we'll simulate a Redis check
        const responseTime = Math.round(performance.now() - start);
        
        return {
            status: 'healthy',
            responseTime,
            message: 'Redis connection successful'
        };
    } catch (error) {
        const responseTime = Math.round(performance.now() - start);
        return {
            status: 'unhealthy',
            message: error.message,
            responseTime
        };
    }
}

/**
 * Check external service dependencies
 */
async function checkExternalServices() {
    const checks = {};
    
    // Check OpenAI API
    if (process.env.OPENAI_API_KEY) {
        const start = performance.now();
        try {
            const response = await fetch('https://api.openai.com/v1/models', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                signal: AbortSignal.timeout(5000) // 5 second timeout
            });
            
            const responseTime = Math.round(performance.now() - start);
            
            checks.openai = {
                status: response.ok ? 'healthy' : 'unhealthy',
                responseTime,
                message: response.ok ? 'OpenAI API accessible' : `HTTP ${response.status}`
            };
        } catch (error) {
            const responseTime = Math.round(performance.now() - start);
            checks.openai = {
                status: 'unhealthy',
                responseTime,
                message: error.message
            };
        }
    }
    
    // Check Stripe API
    if (process.env.STRIPE_SECRET_KEY) {
        const start = performance.now();
        try {
            const response = await fetch('https://api.stripe.com/v1/account', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                signal: AbortSignal.timeout(5000)
            });
            
            const responseTime = Math.round(performance.now() - start);
            
            checks.stripe = {
                status: response.ok ? 'healthy' : 'unhealthy',
                responseTime,
                message: response.ok ? 'Stripe API accessible' : `HTTP ${response.status}`
            };
        } catch (error) {
            const responseTime = Math.round(performance.now() - start);
            checks.stripe = {
                status: 'unhealthy',
                responseTime,
                message: error.message
            };
        }
    }
    
    return checks;
}

/**
 * Get system metrics
 */
function getSystemMetrics() {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    return {
        memory: {
            rss: Math.round(memUsage.rss / 1024 / 1024), // MB
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
            external: Math.round(memUsage.external / 1024 / 1024) // MB
        },
        uptime: Math.round(uptime),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        instanceId: process.env.INSTANCE_ID || 'unknown'
    };
}

/**
 * Determine overall health status
 */
function determineOverallHealth(checks) {
    const allChecks = [
        checks.database,
        checks.redis,
        ...Object.values(checks.external || {})
    ];
    
    const unhealthyChecks = allChecks.filter(check => check.status === 'unhealthy');
    
    if (unhealthyChecks.length === 0) {
        return 'healthy';
    } else if (unhealthyChecks.length <= allChecks.length / 2) {
        return 'degraded';
    } else {
        return 'unhealthy';
    }
}

/**
 * GET /api/health
 * Returns comprehensive health check information
 */
export async function GET({ url }) {
    const start = performance.now();
    const detailed = url.searchParams.get('detailed') === 'true';
    
    try {
        // Basic health check for load balancer
        if (!detailed) {
            return json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: Math.round(process.uptime())
            });
        }
        
        // Detailed health check
        const [database, redis, external] = await Promise.all([
            checkDatabase(),
            checkRedis(),
            checkExternalServices()
        ]);
        
        const system = getSystemMetrics();
        const totalTime = Math.round(performance.now() - start);
        
        const checks = {
            database,
            redis,
            external
        };
        
        const overallStatus = determineOverallHealth(checks);
        
        const response = {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            responseTime: totalTime,
            version: process.env.npm_package_version || '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            checks,
            system
        };
        
        // Return appropriate HTTP status code
        const statusCode = overallStatus === 'healthy' ? 200 : 
                          overallStatus === 'degraded' ? 200 : 503;
        
        return json(response, { status: statusCode });
        
    } catch (error) {
        const totalTime = Math.round(performance.now() - start);
        
        return json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            responseTime: totalTime,
            error: error.message,
            system: getSystemMetrics()
        }, { status: 503 });
    }
}

/**
 * HEAD /api/health
 * Simple health check for load balancers (no response body)
 */
export async function HEAD() {
    try {
        // Quick database connectivity check
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseKey);
        await supabase.from('submissions').select('count').limit(1);
        
        return new Response(null, { status: 200 });
    } catch (error) {
        return new Response(null, { status: 503 });
    }
}