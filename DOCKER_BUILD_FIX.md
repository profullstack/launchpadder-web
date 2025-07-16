# Docker Build Fix Documentation

## Issue Summary
The Docker build was failing with two main issues:

1. **Permission denied error**: `failed to solve: error from sender: open /home/ubuntu/www/launchpadder.com/launchpadder-web/volumes/db/data: permission denied`
2. **Missing Supabase environment variables**: `Error: Missing Supabase environment variables`

## Root Causes

### 1. Permission Issue with volumes/db/data
- The `volumes/db/data` directory had restrictive permissions (`drwx------`) and was owned by user ID 105 and root group
- This is typical for PostgreSQL data directories created by Docker containers
- Docker was trying to include this directory in the build context despite `.dockerignore` exclusions

### 2. Missing Environment Variables
- The Dockerfile correctly defines `ARG` and `ENV` for Supabase variables but they weren't being passed during build
- SvelteKit requires these `PUBLIC_` environment variables to be available during the build process
- The `src/lib/config/supabase.js` file throws an error if these variables are missing

## Solutions Applied

### 1. Enhanced .dockerignore
Updated `.dockerignore` to be more explicit about excluding problematic directories:

```
# Docker volumes and data directories
volumes/
volumes/db/data/
volumes/*/data/
docker/volumes/
```

### 2. Build Arguments for Environment Variables
The Docker build now requires passing the Supabase environment variables as build arguments:

```bash
docker build \
  --build-arg PUBLIC_SUPABASE_URL=your_supabase_url \
  --build-arg PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key \
  -t launchpadder-web .
```

## Usage Instructions

### For Development/Testing
```bash
docker build \
  --build-arg PUBLIC_SUPABASE_URL=http://localhost:54321 \
  --build-arg PUBLIC_SUPABASE_ANON_KEY=placeholder-key \
  -t launchpadder-web .
```

### For Production
```bash
docker build \
  --build-arg PUBLIC_SUPABASE_URL=$PRODUCTION_SUPABASE_URL \
  --build-arg PUBLIC_SUPABASE_ANON_KEY=$PRODUCTION_SUPABASE_ANON_KEY \
  -t launchpadder-web .
```

### Using Docker Compose
Update your `docker-compose.yml` to include build args:

```yaml
services:
  web:
    build:
      context: .
      args:
        PUBLIC_SUPABASE_URL: ${PUBLIC_SUPABASE_URL}
        PUBLIC_SUPABASE_ANON_KEY: ${PUBLIC_SUPABASE_ANON_KEY}
```

## Files Modified

1. **`.dockerignore`**: Added explicit exclusions for database data directories
2. **`DOCKER_BUILD_FIX.md`**: This documentation file

## Verification

The fix was verified by:
1. Confirming the permission error was resolved (build context loaded successfully)
2. Testing the build with placeholder environment variables
3. Ensuring the build process completes without errors

## Notes

- The `volumes/db/data` directory should never be included in Docker builds as it contains runtime database files
- Always provide the required Supabase environment variables when building the Docker image
- For CI/CD pipelines, ensure these environment variables are securely stored and passed to the build process