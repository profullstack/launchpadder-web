<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';

  let swaggerContainer;

  onMount(async () => {
    // Dynamically import Swagger UI
    const SwaggerUI = (await import('swagger-ui-dist/swagger-ui-bundle.js')).default;
    
    // Initialize Swagger UI
    SwaggerUI({
      url: '/api/docs',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [
        SwaggerUI.presets.apis,
        SwaggerUI.presets.standalone
      ],
      plugins: [
        SwaggerUI.plugins.DownloadUrl
      ],
      layout: "StandaloneLayout",
      tryItOutEnabled: true,
      requestInterceptor: (request) => {
        // Add any custom headers or modifications here
        return request;
      },
      responseInterceptor: (response) => {
        // Handle responses here if needed
        return response;
      }
    });
  });
</script>

<svelte:head>
  <title>LaunchPadder Federation API Documentation</title>
  <meta name="description" content="Interactive API documentation for the LaunchPadder Federation API" />
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.0.1/swagger-ui.css" />
  <style>
    body {
      margin: 0;
      background: #fafafa;
    }
    
    .swagger-ui .topbar {
      background-color: #2c3e50;
    }
    
    .swagger-ui .topbar .download-url-wrapper {
      display: none;
    }
    
    .api-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 2rem;
      text-align: center;
      margin-bottom: 0;
    }
    
    .api-header h1 {
      margin: 0 0 0.5rem 0;
      font-size: 2.5rem;
      font-weight: 300;
    }
    
    .api-header p {
      margin: 0;
      font-size: 1.1rem;
      opacity: 0.9;
    }
    
    .api-info {
      background: white;
      padding: 1.5rem;
      margin: 0;
      border-bottom: 1px solid #e0e0e0;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
      max-width: 1200px;
      margin: 0 auto;
    }
    
    .info-card {
      background: #f8f9fa;
      padding: 1rem;
      border-radius: 8px;
      border-left: 4px solid #667eea;
    }
    
    .info-card h3 {
      margin: 0 0 0.5rem 0;
      color: #2c3e50;
      font-size: 1.1rem;
    }
    
    .info-card p {
      margin: 0;
      color: #666;
      font-size: 0.9rem;
      line-height: 1.4;
    }
    
    .quick-links {
      background: white;
      padding: 1rem 1.5rem;
      border-bottom: 1px solid #e0e0e0;
      text-align: center;
    }
    
    .quick-links a {
      display: inline-block;
      margin: 0 0.5rem;
      padding: 0.5rem 1rem;
      background: #667eea;
      color: white;
      text-decoration: none;
      border-radius: 4px;
      font-size: 0.9rem;
      transition: background-color 0.2s;
    }
    
    .quick-links a:hover {
      background: #5a6fd8;
    }
    
    #swagger-ui {
      max-width: none;
    }
  </style>
</svelte:head>

<div class="api-header">
  <h1>LaunchPadder Federation API</h1>
  <p>Comprehensive API for federated launch platform integration</p>
</div>

<div class="api-info">
  <div class="info-grid">
    <div class="info-card">
      <h3>🔐 Authentication</h3>
      <p>Use JWT tokens or API keys for authentication. Exchange your federation API key for a JWT token via the /auth/token endpoint.</p>
    </div>
    
    <div class="info-card">
      <h3>⚡ Rate Limiting</h3>
      <p>API calls are rate limited based on your partnership tier: Basic (100/hr), Premium (1000/hr), Enterprise (10000/hr).</p>
    </div>
    
    <div class="info-card">
      <h3>🔗 Federation</h3>
      <p>Discover directories, submit launches, and manage federation partnerships across the network.</p>
    </div>
    
    <div class="info-card">
      <h3>📊 Analytics</h3>
      <p>Access comprehensive analytics and monitoring data for your federation activities.</p>
    </div>
    
    <div class="info-card">
      <h3>🪝 Webhooks</h3>
      <p>Real-time updates delivered via webhooks for submission status changes and federation events.</p>
    </div>
    
    <div class="info-card">
      <h3>🛠️ SDKs</h3>
      <p>Client libraries available for easy integration with popular programming languages.</p>
    </div>
  </div>
</div>

<div class="quick-links">
  <a href="/api/docs?format=yaml" target="_blank">Download OpenAPI YAML</a>
  <a href="/api/docs?format=json" target="_blank">Download OpenAPI JSON</a>
  <a href="https://github.com/your-org/launchpadder-sdk" target="_blank">View SDKs</a>
  <a href="/federation/onboarding">Partner Onboarding</a>
</div>

<div id="swagger-ui" bind:this={swaggerContainer}></div>