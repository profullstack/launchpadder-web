# Docker Build Fix - SvelteKit Environment Variables

## Problem Solved

The Docker build was failing with:
```
"PUBLIC_SUPABASE_URL" is not exported by "virtual:env/static/public", imported by "src/lib/config/supabase.js"
```

## Root Cause

SvelteKit requires `PUBLIC_` prefixed environment variables to be available at **build time**, not just runtime. The Docker build process didn't have access to these variables during the `pnpm run build` step.

## Solution Applied

### 1. Updated Dockerfile

**Added build-time environment variables:**
```dockerfile
# Set build-time environment variables for SvelteKit
# These are required for PUBLIC_ variables to be available during build
ARG PUBLIC_SUPABASE_URL
ARG PUBLIC_SUPABASE_ANON_KEY
ENV PUBLIC_SUPABASE_URL=$PUBLIC_SUPABASE_URL
ENV PUBLIC_SUPABASE_ANON_KEY=$PUBLIC_SUPABASE_ANON_KEY
```

### 2. Updated docker-compose.yml

**Added build args to pass environment variables during build:**
```yaml
web:
  build:
    context: .
    dockerfile: Dockerfile
    args:
      PUBLIC_SUPABASE_URL: ${PUBLIC_SUPABASE_URL:-http://localhost:8000}
      PUBLIC_SUPABASE_ANON_KEY: ${ANON_KEY}
  environment:
    # Runtime environment variables
    PUBLIC_SUPABASE_URL: ${PUBLIC_SUPABASE_URL:-http://localhost:8000}
    PUBLIC_SUPABASE_ANON_KEY: ${ANON_KEY}
```

## How It Works

1. **Build Time**: Docker passes `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` as build arguments
2. **SvelteKit Build**: These variables are available during `pnpm run build` via `$env/static/public`
3. **Runtime**: The same variables are also available at runtime for dynamic behavior

## Environment Variable Flow

```
.env file → docker-compose.yml → Dockerfile (build args) → SvelteKit build → Built application
                ↓
            Runtime environment → Running container
```

## Testing the Fix

```bash
# Build with the fix applied
docker compose up --build web

# Should now build successfully without environment variable errors
```

## Key Insights

- **SvelteKit Requirement**: `PUBLIC_` variables must be available at build time
- **Docker Build Context**: Build args are separate from runtime environment variables
- **Dual Configuration**: Need both build args AND runtime environment for full functionality
- **Default Values**: Using `${PUBLIC_SUPABASE_URL:-http://localhost:8000}` provides fallback

## Related Files Modified

- [`Dockerfile`](Dockerfile:23-29) - Added build-time environment variables
- [`docker-compose.yml`](docker-compose.yml:476-479) - Added build args configuration
- [`src/lib/config/supabase.js`](src/lib/config/supabase.js:5) - Uses the PUBLIC_ variables

This fix ensures that SvelteKit can access the required Supabase configuration during both build and runtime phases.