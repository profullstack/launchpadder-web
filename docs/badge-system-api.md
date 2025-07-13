# Badge System API Documentation

## Overview

The Badge System provides a comprehensive recognition and gamification platform for the federation network. It includes badge definitions, user assignments, verification, analytics, and leaderboards.

## Table of Contents

1. [Badge Definitions API](#badge-definitions-api)
2. [User Badge Management API](#user-badge-management-api)
3. [Badge Analytics API](#badge-analytics-api)
4. [Badge Verification API](#badge-verification-api)
5. [Frontend Components](#frontend-components)
6. [Database Schema](#database-schema)
7. [Usage Examples](#usage-examples)

## Badge Definitions API

### GET /api/badges

Get all badge definitions with optional filtering.

**Query Parameters:**
- `category` (optional): Filter by badge category
- `level` (optional): Filter by badge level
- `federation` (optional): Set to "true" for federation-only badges

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "slug": "verified-federation-partner",
      "name": "Verified Federation Partner",
      "description": "Official verification as a trusted federation network partner",
      "category": "federation",
      "level": "gold",
      "icon_url": "/badges/verified-federation-partner.svg",
      "color_hex": "#10B981",
      "is_federation_badge": true,
      "requires_verification": true,
      "criteria": {},
      "requirements": {}
    }
  ],
  "meta": {
    "total": 5,
    "filters": {}
  }
}
```

### GET /api/badges/[slug]

Get specific badge definition by slug.

**Query Parameters:**
- `stats` (optional): Set to "true" to include badge statistics

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "slug": "active-community-member",
    "name": "Active Community Member",
    "description": "Actively participates in the community",
    "category": "community",
    "level": "bronze",
    "stats": {
      "total_awarded": 150,
      "total_active": 145,
      "unique_recipients": 140
    }
  }
}
```

### POST /api/badges

Create a new badge definition (admin only).

**Request Body:**
```json
{
  "slug": "new-badge",
  "name": "New Badge",
  "description": "Description of the new badge",
  "category": "achievement",
  "level": "bronze",
  "icon_url": "/badges/new-badge.svg",
  "color_hex": "#6B7280",
  "criteria": {},
  "requirements": {
    "min_submissions": 5
  }
}
```

## User Badge Management API

### GET /api/users/[userId]/badges

Get all badges for a specific user.

**Query Parameters:**
- `history` (optional): Set to "true" to include earning history
- `revoked` (optional): Set to "true" to include revoked badges

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "badge_id": "uuid",
      "badge_slug": "active-community-member",
      "badge_name": "Active Community Member",
      "badge_description": "Actively participates in the community",
      "category": "community",
      "level": "bronze",
      "earned_at": "2025-01-01T00:00:00Z",
      "assignment_type": "automatic",
      "is_verified": false
    }
  ],
  "meta": {
    "userId": "user-123",
    "total": 3
  }
}
```

### POST /api/users/[userId]/badges

Award a badge to a user.

**Request Body:**
```json
{
  "badgeSlug": "active-community-member",
  "assignmentType": "manual",
  "reason": "Exceptional community participation",
  "context": {
    "admin_notes": "Awarded for helping new users"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userBadgeId": "uuid"
  },
  "message": "Badge awarded successfully"
}
```

### POST /api/users/[userId]/badges/[badgeSlug]/revoke

Revoke a badge from a user (admin only).

**Request Body:**
```json
{
  "reason": "Policy violation"
}
```

## Badge Analytics API

### GET /api/badges/analytics

Get comprehensive badge system analytics (admin only).

**Query Parameters:**
- `period` (optional): Analytics period ("daily", "weekly", "monthly")
- `badge` (optional): Filter by specific badge slug
- `limit` (optional): Number of results to return

**Response:**
```json
{
  "success": true,
  "data": {
    "badgeStats": {
      "total_awarded": 150,
      "total_active": 145,
      "unique_recipients": 140
    },
    "categoryDistribution": {
      "community": 45,
      "quality": 30,
      "federation": 15
    },
    "recentAwards": [],
    "earningTrends": []
  }
}
```

### GET /api/badges/leaderboard

Get badge leaderboard data.

**Query Parameters:**
- `badge` (optional): Filter by specific badge slug
- `limit` (optional): Number of results (default: 10)
- `timeframe` (optional): "all", "week", "month", "year"

**Response:**
```json
{
  "success": true,
  "data": {
    "leaderboard": [
      {
        "user_id": "uuid",
        "username": "alice",
        "full_name": "Alice Johnson",
        "avatar_url": "/avatars/alice.jpg",
        "badge_count": 15,
        "latest_badge_earned_at": "2025-01-01T00:00:00Z"
      }
    ],
    "recentEarners": [],
    "popularBadges": []
  }
}
```

## Badge Verification API

### POST /api/badges/verify

Verify a badge's cryptographic signature.

**Request Body:**
```json
{
  "userBadgeId": "uuid",
  "signature": "cryptographic-signature",
  "payload": {
    "badge_id": "uuid",
    "user_id": "uuid",
    "issued_at": "2025-01-01T00:00:00Z"
  },
  "publicKey": "public-key-string",
  "instanceUrl": "https://instance.example.com"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "verificationId": "uuid",
    "verifiedAt": "2025-01-01T00:00:00Z",
    "payloadHash": "hash-string"
  },
  "message": "Badge signature verified successfully"
}
```

### GET /api/badges/verify

Get verification status for a badge.

**Query Parameters:**
- `userBadgeId` (optional): User badge ID to check
- `signature` (optional): Signature hash to verify

## Frontend Components

### Badge Component

Display individual badges with tooltips and verification indicators.

```svelte
<script>
  import Badge from '$lib/components/Badge.svelte';
</script>

<Badge 
  {badge}
  size="medium"
  showTooltip={true}
  showVerification={true}
  clickable={true}
  earned_at={badge.earned_at}
  is_verified={badge.is_verified}
  on:click={handleBadgeClick}
/>
```

**Props:**
- `badge`: Badge object with name, description, category, etc.
- `size`: "small", "medium", or "large"
- `showTooltip`: Boolean to show/hide tooltip
- `showVerification`: Boolean to show verification indicator
- `clickable`: Boolean to make badge clickable
- `earned_at`: Date when badge was earned
- `is_verified`: Boolean indicating verification status

### BadgeCollection Component

Display multiple badges with filtering and sorting.

```svelte
<script>
  import BadgeCollection from '$lib/components/BadgeCollection.svelte';
</script>

<BadgeCollection 
  {badges}
  {userId}
  showFilters={true}
  showSort={true}
  maxDisplay={20}
  layout="grid"
  on:badgeClick={handleBadgeClick}
/>
```

**Props:**
- `badges`: Array of badge objects
- `userId`: User ID for badge collection
- `showFilters`: Boolean to show category/level filters
- `showSort`: Boolean to show sort options
- `maxDisplay`: Maximum number of badges to display
- `layout`: "grid", "list", or "compact"

### BadgeLeaderboard Component

Display badge leaderboard with recent earners and popular badges.

```svelte
<script>
  import BadgeLeaderboard from '$lib/components/BadgeLeaderboard.svelte';
</script>

<BadgeLeaderboard 
  badgeSlug={null}
  timeframe="all"
  limit={10}
  showRecentEarners={true}
  showPopularBadges={true}
/>
```

## Database Schema

### Badge Definitions Table

```sql
CREATE TABLE public.badge_definitions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    category badge_category NOT NULL,
    level badge_level DEFAULT 'bronze',
    icon_url TEXT,
    color_hex TEXT DEFAULT '#6B7280',
    criteria JSONB NOT NULL DEFAULT '{}',
    requirements JSONB NOT NULL DEFAULT '{}',
    is_federation_badge BOOLEAN DEFAULT FALSE,
    requires_verification BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### User Badges Table

```sql
CREATE TABLE public.user_badges (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    badge_id UUID REFERENCES public.badge_definitions(id) ON DELETE CASCADE NOT NULL,
    assignment_type badge_assignment_type DEFAULT 'automatic',
    status badge_status DEFAULT 'active',
    verification_signature TEXT,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_visible BOOLEAN DEFAULT TRUE,
    UNIQUE(user_id, badge_id)
);
```

## Usage Examples

### Awarding a Badge Automatically

```javascript
import { BadgeService } from '$lib/services/badge-service.js';

const badgeService = new BadgeService(supabase);

// Check if user meets criteria
const criteriaResult = await badgeService.checkBadgeCriteria(
  userId, 
  'active-community-member'
);

if (criteriaResult.success && criteriaResult.data.all_criteria_met) {
  // Award the badge
  const result = await badgeService.awardBadge(
    userId,
    'active-community-member',
    'automatic',
    null,
    'Met community engagement criteria'
  );
}
```

### Displaying User Badges

```svelte
<script>
  import { onMount } from 'svelte';
  import BadgeCollection from '$lib/components/BadgeCollection.svelte';
  
  let userBadges = [];
  
  onMount(async () => {
    const response = await fetch(`/api/users/${userId}/badges`);
    const result = await response.json();
    if (result.success) {
      userBadges = result.data;
    }
  });
</script>

<BadgeCollection 
  badges={userBadges}
  {userId}
  layout="grid"
  maxDisplay={12}
/>
```

### Checking Badge Criteria

```javascript
// Automatically check and award badges after user actions
async function checkBadgesAfterSubmission(userId) {
  const badgeService = new BadgeService(supabase);
  
  const result = await badgeService.autoCheckAndAwardBadges(userId);
  
  if (result.success && result.data.length > 0) {
    console.log(`Awarded badges: ${result.data.join(', ')}`);
  }
}
```

## Federation-Specific Badges

The system includes several federation-specific badges:

1. **Verified Federation Partner** - Official verification badge
2. **Trusted Network Member** - For reliable federation members
3. **High Quality Submissions** - For consistently good content
4. **Active Community Member** - For engaged community participation
5. **API Integration Expert** - For successful API usage

These badges help build trust and recognition within the federation network, encouraging positive behavior and quality contributions.

## Security Considerations

1. **Badge Verification**: All badges can be cryptographically signed for cross-platform verification
2. **Access Control**: Admin-only operations are protected by role-based access control
3. **Rate Limiting**: API endpoints should be rate-limited to prevent abuse
4. **Input Validation**: All inputs are validated and sanitized
5. **Audit Trail**: All badge operations are logged for accountability

## Error Handling

All API endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Descriptive error message"
}
```

Common HTTP status codes:
- `200`: Success
- `201`: Created (for POST operations)
- `400`: Bad Request (validation errors)
- `401`: Unauthorized (authentication required)
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found
- `500`: Internal Server Error