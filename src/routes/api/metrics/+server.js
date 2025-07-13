import { json } from '@sveltejs/kit';
import { monitoring } from '../../../lib/services/monitoring.js';
import { logger } from '../../../lib/services/logger.js';
import { errorHandler } from '../../../lib/services/error-handler.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ url, request }) {
  try {
    const format = url.searchParams.get('format') || 'json';
    const timeRange = url.searchParams.get('range') || '1h';
    const requestId = request.headers.get('x-request-id') || crypto.randomUUID();

    logger.setCorrelationId(requestId);
    logger.info('Metrics requested', { format, timeRange, requestId });

    // Get comprehensive metrics
    const [systemMetrics, requestMetrics, customMetrics, counters] = await Promise.all([
      monitoring.getSystemMetrics(),
      monitoring.getRequestMetrics(),
      monitoring.getCustomMetrics(),
      monitoring.getCounters()
    ]);

    const dashboardOverview = await monitoring.getDashboardOverview();
    const timeSeries = monitoring.getTimeSeriesData(timeRange);

    if (format === 'prometheus') {
      const prometheusMetrics = monitoring.exportPrometheusMetrics();
      return new Response(prometheusMetrics, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Request-ID': requestId
        }
      });
    }

    const response = {
      timestamp: new Date().toISOString(),
      requestId,
      system: systemMetrics,
      requests: requestMetrics,
      custom: customMetrics,
      counters,
      overview: dashboardOverview,
      timeSeries: timeSeries.slice(-100), // Limit to last 100 entries
      errorStats: errorHandler.getErrorStats(),
      errorTrends: errorHandler.getErrorTrends()
    };

    return json(response, {
      headers: {
        'X-Request-ID': requestId,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });

  } catch (error) {
    const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
    return errorHandler.handleSvelteKitError(error, requestId, {
      endpoint: '/api/metrics',
      method: 'GET'
    });
  }
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
  try {
    const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
    const body = await request.json();

    logger.setCorrelationId(requestId);
    logger.info('Custom metric recorded', { metric: body, requestId });

    // Record custom metric
    if (body.name && typeof body.value === 'number') {
      monitoring.recordMetric(body.name, body.value);
      
      return json({
        success: true,
        message: 'Metric recorded successfully',
        requestId
      });
    }

    // Increment counter
    if (body.counter) {
      monitoring.incrementCounter(body.counter, body.value || 1);
      
      return json({
        success: true,
        message: 'Counter incremented successfully',
        requestId
      });
    }

    throw new Error('Invalid metric data. Expected {name, value} or {counter, value}');

  } catch (error) {
    const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
    return errorHandler.handleSvelteKitError(error, requestId, {
      endpoint: '/api/metrics',
      method: 'POST'
    });
  }
}