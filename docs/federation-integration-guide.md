# LaunchPadder Federation Integration Guide

This comprehensive guide will help you integrate with the LaunchPadder Federation API to enable cross-platform launch submissions and directory sharing.

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Authentication](#authentication)
4. [API Endpoints](#api-endpoints)
5. [SDK Usage](#sdk-usage)
6. [Webhooks](#webhooks)
7. [Rate Limiting](#rate-limiting)
8. [Error Handling](#error-handling)
9. [Best Practices](#best-practices)
10. [Examples](#examples)
11. [Troubleshooting](#troubleshooting)

## Overview

The LaunchPadder Federation API enables external platforms to:

- **Discover** available launch directories and categories
- **Submit** launches to our platform programmatically
- **Retrieve** launch status and analytics data
- **Manage** federation partnerships
- **Receive** real-time updates via webhooks

### Key Features

- 🔐 **Secure Authentication** - JWT tokens and API key authentication
- ⚡ **Rate Limiting** - Tiered rate limits based on partnership level
- 🔗 **Federation Discovery** - Automatic discovery of compatible instances
- 📊 **Analytics** - Comprehensive submission and federation metrics
- 🪝 **Webhooks** - Real-time event notifications
- 🛠️ **SDKs** - Client libraries for popular programming languages

## Getting Started

### 1. Partner Registration

To get started, you need to become a federation partner:

1. **Apply for Partnership**: Contact us at [api-support@launchpadder.com](mailto:api-support@launchpadder.com)
2. **Provide Information**:
   - Organization name and description
   - API endpoint URL (if you're also a federation instance)
   - Expected usage volume
   - Integration timeline

3. **Receive Credentials**:
   - Federation API key (format: `fed_key_xxxxxxxxxx`)
   - Partnership tier assignment (Basic, Premium, or Enterprise)
   - Access to partner dashboard

### 2. API Base URL

All API requests should be made to:

```
Production: https://api.launchpadder.com/v1
Staging: https://staging-api.launchpadder.com/v1
```

### 3. Quick Start

Here's a simple example to get you started:

```javascript
import { LaunchPadderClient } from '@launchpadder/federation-sdk';

const client = new LaunchPadderClient({
  apiKey: 'fed_key_your_api_key_here',
  baseUrl: 'https://api.launchpadder.com',
  debug: true // Enable for development
});

// Get federation info
const info = await client.federation.getInfo();
console.log('Federation capabilities:', info);

// List available directories
const directories = await client.federation.getDirectories();
console.log('Available directories:', directories.directories);
```

## Authentication

### API Key Authentication

For simple requests, you can use your API key directly:

```bash
curl -H "X-API-Key: fed_key_your_api_key_here" \
     https://api.launchpadder.com/v1/federation/info
```

### JWT Token Authentication (Recommended)

For better security and performance, exchange your API key for a JWT token:

```javascript
// Exchange API key for JWT token
const tokenResponse = await client.auth.getToken();
console.log('JWT Token:', tokenResponse.token);
console.log('Expires in:', tokenResponse.expires_in, 'seconds');

// The SDK automatically handles token refresh
```

### Manual Token Exchange

```bash
curl -X POST https://api.launchpadder.com/v1/auth/token \
     -H "Content-Type: application/json" \
     -d '{"api_key": "fed_key_your_api_key_here"}'
```

Response:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600,
  "partner_info": {
    "id": "partner-123",
    "name": "Your Organization",
    "tier": "premium",
    "rate_limit": 1000
  }
}
```

## API Endpoints

### Federation Discovery

#### Get Federation Info
```javascript
const info = await client.federation.getInfo();
```

Returns detailed information about our federation instance, including:
- Supported features and capabilities
- API endpoints and versions
- Rate limits and payment methods
- Contact information

#### List Directories
```javascript
const directories = await client.federation.getDirectories({
  category: 'startups',  // Optional filter
  limit: 20,            // Optional pagination
  offset: 0             // Optional pagination
});
```

#### List Federation Instances
```javascript
const instances = await client.federation.getInstances({
  status: 'active',     // Optional filter
  search: 'product'     // Optional search
});
```

### Submissions

#### Create Submission
```javascript
const submission = await client.submissions.create({
  url: 'https://yourproduct.com',
  title: 'Amazing Product',
  description: 'This product solves real problems for developers',
  category: 'tools',
  tags: ['developer-tools', 'productivity']
});
```

#### Submit to Federation
```javascript
const federationSubmission = await client.submissions.submitToFederation({
  submission_id: submission.submission.id,
  directories: [
    {
      instance_url: 'https://api.launchpadder.com',
      directory_id: 'main'
    },
    {
      instance_url: 'https://api.launchpadder.com',
      directory_id: 'tools'
    }
  ],
  payment_method: 'stripe'
});
```

#### Check Federation Status
```javascript
const status = await client.submissions.getFederationStatus(
  federationSubmission.federation_submission.id
);

console.log('Progress:', status.status.progress);
console.log('Results:', status.status.results);
```

### Analytics

#### Get Overview
```javascript
const analytics = await client.analytics.getOverview({
  period: 'month'  // day, week, month, year
});

console.log('Total submissions:', analytics.submissions.total);
console.log('Success rate:', analytics.federation.successful_submissions / analytics.federation.total_submissions);
```

#### Get Federation Analytics
```javascript
const federationAnalytics = await client.analytics.getFederation({
  period: 'week'
});

console.log('Partner activity:', federationAnalytics.partner_activity);
console.log('Top directories:', federationAnalytics.top_directories);
```

## SDK Usage

### Installation

```bash
# npm
npm install @launchpadder/federation-sdk

# yarn
yarn add @launchpadder/federation-sdk

# pnpm
pnpm add @launchpadder/federation-sdk
```

### Basic Configuration

```javascript
import { LaunchPadderClient } from '@launchpadder/federation-sdk';

const client = new LaunchPadderClient({
  apiKey: process.env.LAUNCHPADDER_API_KEY,
  baseUrl: 'https://api.launchpadder.com',
  timeout: 30000,  // 30 seconds
  debug: process.env.NODE_ENV === 'development'
});
```

### Error Handling

```javascript
import { LaunchPadderError } from '@launchpadder/federation-sdk';

try {
  const submission = await client.submissions.create(submissionData);
} catch (error) {
  if (error instanceof LaunchPadderError) {
    console.error('API Error:', error.message);
    console.error('Status:', error.status);
    console.error('Code:', error.code);
    
    if (error.status === 429) {
      console.log('Rate limited. Retry after:', error.response?.headers?.['retry-after']);
    }
  } else {
    console.error('Network Error:', error.message);
  }
}
```

### Batch Operations

```javascript
// Submit to multiple directories efficiently
const directories = await client.federation.getDirectories({
  category: 'tools'
});

const batchSubmission = await client.submissions.submitToFederation({
  submission_id: submissionId,
  directories: directories.directories.slice(0, 5).map(dir => ({
    instance_url: 'https://api.launchpadder.com',
    directory_id: dir.id
  })),
  payment_method: 'stripe'
});
```

## Webhooks

### Setting Up Webhooks

```javascript
// Create a webhook endpoint
const webhook = await client.webhooks.create({
  url: 'https://yourapi.com/webhooks/launchpadder',
  events: [
    'submission.created',
    'submission.approved',
    'federation.completed'
  ]
});

console.log('Webhook secret:', webhook.webhook.secret);
```

### Webhook Events

Available webhook events:

- `submission.created` - New submission created
- `submission.approved` - Submission approved by moderation
- `submission.rejected` - Submission rejected by moderation
- `federation.started` - Federation submission started
- `federation.completed` - Federation submission completed
- `federation.failed` - Federation submission failed

### Webhook Payload Example

```json
{
  "event": "submission.approved",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "submission": {
      "id": "sub_123",
      "url": "https://example.com",
      "title": "Amazing Product",
      "status": "approved"
    }
  },
  "signature": "sha256=abc123..."
}
```

### Verifying Webhook Signatures

```javascript
import crypto from 'crypto';

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return `sha256=${expectedSignature}` === signature;
}

// In your webhook handler
app.post('/webhooks/launchpadder', (req, res) => {
  const signature = req.headers['x-launchpadder-signature'];
  const payload = JSON.stringify(req.body);
  
  if (!verifyWebhookSignature(payload, signature, webhookSecret)) {
    return res.status(401).send('Invalid signature');
  }
  
  // Process webhook event
  console.log('Webhook event:', req.body.event);
  res.status(200).send('OK');
});
```

## Rate Limiting

### Rate Limit Tiers

| Tier | Requests/Hour | Submissions/Day | Features |
|------|---------------|-----------------|----------|
| Basic | 100 | 50 | Basic API access |
| Premium | 1,000 | 500 | Priority support, webhooks |
| Enterprise | 10,000 | 5,000 | Custom limits, SLA |

### Handling Rate Limits

```javascript
// The SDK automatically handles rate limiting
try {
  const result = await client.submissions.create(data);
} catch (error) {
  if (error.status === 429) {
    const retryAfter = error.response?.headers?.['retry-after'];
    console.log(`Rate limited. Retry after ${retryAfter} seconds`);
    
    // Implement exponential backoff
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
    
    // Retry the request
    const result = await client.submissions.create(data);
  }
}
```

### Rate Limit Headers

All API responses include rate limit information:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642248000
```

## Error Handling

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `UNAUTHORIZED` | 401 | Invalid or missing authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource already exists |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `INTERNAL_ERROR` | 500 | Server error |

### Error Response Format

```json
{
  "success": false,
  "error": "Invalid request parameters",
  "code": "VALIDATION_ERROR",
  "details": {
    "field": "url",
    "message": "URL is required"
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Best Practices

### 1. Authentication
- Use JWT tokens for better performance
- Implement token refresh logic
- Store API keys securely (environment variables)

### 2. Error Handling
- Implement exponential backoff for retries
- Handle rate limiting gracefully
- Log errors for debugging

### 3. Performance
- Use pagination for large datasets
- Cache federation info and directories
- Implement request deduplication

### 4. Security
- Verify webhook signatures
- Use HTTPS for all requests
- Validate all input data

### 5. Monitoring
- Track API usage and errors
- Monitor webhook delivery success
- Set up alerts for failures

## Examples

### Complete Integration Example

```javascript
import { LaunchPadderClient } from '@launchpadder/federation-sdk';

class LaunchPadderIntegration {
  constructor(apiKey) {
    this.client = new LaunchPadderClient({
      apiKey,
      debug: process.env.NODE_ENV === 'development'
    });
  }

  async submitProduct(productData) {
    try {
      // 1. Create submission
      const submission = await this.client.submissions.create({
        url: productData.url,
        title: productData.title,
        description: productData.description,
        category: productData.category,
        tags: productData.tags
      });

      console.log('Submission created:', submission.submission.id);

      // 2. Get relevant directories
      const directories = await this.client.federation.getDirectories({
        category: productData.category,
        limit: 10
      });

      // 3. Submit to federation
      const federationSubmission = await this.client.submissions.submitToFederation({
        submission_id: submission.submission.id,
        directories: directories.directories.map(dir => ({
          instance_url: 'https://api.launchpadder.com',
          directory_id: dir.id
        })),
        payment_method: 'stripe'
      });

      console.log('Federation submission started:', federationSubmission.federation_submission.id);

      // 4. Monitor progress
      return this.monitorSubmission(federationSubmission.federation_submission.id);

    } catch (error) {
      console.error('Submission failed:', error.message);
      throw error;
    }
  }

  async monitorSubmission(federationId) {
    const maxAttempts = 30;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const status = await this.client.submissions.getFederationStatus(federationId);
        
        console.log(`Progress: ${status.status.progress.completed_directories}/${status.status.progress.total_directories}`);

        if (status.status.status === 'completed') {
          console.log('Federation submission completed successfully!');
          return status.status.results;
        }

        if (status.status.status === 'failed') {
          console.error('Federation submission failed');
          return status.status.results;
        }

        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds
        attempts++;

      } catch (error) {
        console.error('Error checking status:', error.message);
        attempts++;
      }
    }

    throw new Error('Monitoring timeout');
  }

  async getAnalytics(period = 'month') {
    const analytics = await this.client.analytics.getOverview({ period });
    
    return {
      totalSubmissions: analytics.submissions.total,
      successRate: analytics.submissions.approved / analytics.submissions.total,
      federationSuccess: analytics.federation.successful_submissions / analytics.federation.total_submissions,
      revenue: analytics.revenue.total
    };
  }
}

// Usage
const integration = new LaunchPadderIntegration(process.env.LAUNCHPADDER_API_KEY);

const productData = {
  url: 'https://myawesomeproduct.com',
  title: 'My Awesome Product',
  description: 'A revolutionary tool that changes everything',
  category: 'tools',
  tags: ['productivity', 'automation', 'saas']
};

integration.submitProduct(productData)
  .then(results => console.log('Submission results:', results))
  .catch(error => console.error('Integration failed:', error));
```

### Webhook Handler Example

```javascript
import express from 'express';
import crypto from 'crypto';

const app = express();
app.use(express.json());

const WEBHOOK_SECRET = process.env.LAUNCHPADDER_WEBHOOK_SECRET;

function verifySignature(payload, signature) {
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  
  return `sha256=${expectedSignature}` === signature;
}

app.post('/webhooks/launchpadder', (req, res) => {
  const signature = req.headers['x-launchpadder-signature'];
  const payload = JSON.stringify(req.body);
  
  if (!verifySignature(payload, signature)) {
    return res.status(401).send('Invalid signature');
  }
  
  const { event, data } = req.body;
  
  switch (event) {
    case 'submission.approved':
      console.log('Submission approved:', data.submission.id);
      // Update your database, send notifications, etc.
      break;
      
    case 'federation.completed':
      console.log('Federation completed:', data.federation_submission.id);
      // Process completion, update status, etc.
      break;
      
    default:
      console.log('Unknown event:', event);
  }
  
  res.status(200).send('OK');
});

app.listen(3000, () => {
  console.log('Webhook server listening on port 3000');
});
```

## Troubleshooting

### Common Issues

#### 1. Authentication Errors
```
Error: Invalid API key
```
**Solution**: Verify your API key format and ensure it starts with `fed_key_`

#### 2. Rate Limiting
```
Error: Rate limit exceeded
```
**Solution**: Implement exponential backoff and respect rate limit headers

#### 3. Webhook Signature Verification
```
Error: Invalid webhook signature
```
**Solution**: Ensure you're using the correct webhook secret and payload format

#### 4. Network Timeouts
```
Error: Request timeout
```
**Solution**: Increase timeout values and implement retry logic

### Debug Mode

Enable debug mode to see detailed request/response logs:

```javascript
const client = new LaunchPadderClient({
  apiKey: 'your-api-key',
  debug: true
});
```

### Support

For additional support:

- 📧 Email: [api-support@launchpadder.com](mailto:api-support@launchpadder.com)
- 📖 Documentation: [https://launchpadder.com/docs](https://launchpadder.com/docs)
- 🐛 Issues: [GitHub Issues](https://github.com/launchpadder/federation-sdk-js/issues)
- 💬 Discord: [LaunchPadder Community](https://discord.gg/launchpadder)

---

This guide should get you started with the LaunchPadder Federation API. For the most up-to-date information, always refer to our [interactive API documentation](https://launchpadder.com/api/docs).