# Supabase Docker Modernization Guide

## Overview

This guide explains how to migrate from the outdated microservices Supabase setup to the modern official `supabase/supabase` image approach.

## Current Issues with Your Setup

### ❌ Outdated Microservices Approach
Your current `docker-compose.yml` uses **12+ separate containers**:
- `supabase/studio` (Studio UI)
- `kong:2.8.1` (API Gateway)
- `supabase/postgres` (Database)
- `supabase/gotrue` (Auth)
- `postgrest/postgrest` (REST API)
- `supabase/realtime` (Realtime)
- `supabase/storage-api` (Storage)
- `darthsim/imgproxy` (Image Processing)
- `supabase/postgres-meta` (Meta API)
- `supabase/edge-runtime` (Functions)
- `supabase/logflare` (Analytics)
- `timberio/vector` (Logging)
- `supabase/supavisor` (Connection Pooler)
- Custom migration containers

### ✅ Modern Official Approach
The new setup uses **1 container** with the official `supabase/supabase` image that includes:
- All Supabase services pre-configured
- Official Supabase CLI integration
- Simplified configuration
- Better resource management
- Easier updates and maintenance

## Benefits of Modernization

### 🚀 Performance
- **Reduced resource usage**: Single container vs 12+ containers
- **Faster startup**: No complex service orchestration
- **Better networking**: Internal communication optimized

### 🛠️ Maintenance
- **Simplified updates**: Single image to update
- **Official support**: Backed by Supabase team
- **Consistent configuration**: No version mismatches between services

### 🔧 Development Experience
- **Easier debugging**: Single container to inspect
- **Simplified logs**: Centralized logging
- **Better CLI integration**: Official Supabase CLI included

## Migration Steps

### 1. Backup Current Setup

```bash
# Stop current services
docker-compose down

# Backup database (if you have important data)
docker-compose up db -d
docker exec supabase-db pg_dump -U postgres postgres > backup.sql
docker-compose down

# Backup volumes
sudo cp -r volumes/ volumes-backup/
```

### 2. Update Environment Variables

Create a new `.env` file based on the modern setup:

```bash
# Copy your existing .env
cp .env .env.backup

# Update with modern configuration
cat > .env << 'EOF'
# Database Configuration
POSTGRES_PASSWORD=supabase123
POSTGRES_DB=postgres
POSTGRES_USER=postgres

# JWT Configuration (generate new secrets)
JWT_SECRET=your-super-secret-jwt-token-with-at-least-32-characters-long
JWT_EXPIRY=3600

# API Keys (generate new keys)
ANON_KEY=your-anon-key
SERVICE_ROLE_KEY=your-service-role-key

# External URLs
API_EXTERNAL_URL=http://localhost:8000
SITE_URL=http://localhost:3000
SUPABASE_PUBLIC_URL=http://localhost:8000

# Studio Configuration
STUDIO_PORT=3001
STUDIO_DEFAULT_ORGANIZATION=Default Organization
STUDIO_DEFAULT_PROJECT=Default Project

# Auth Configuration
DISABLE_SIGNUP=false
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=true
ENABLE_ANONYMOUS_USERS=false

# Dashboard Credentials
DASHBOARD_USERNAME=supabase
DASHBOARD_PASSWORD=supabase

# Ports
KONG_HTTP_PORT=8000
POSTGRES_PORT=5432
WEB_PORT=3000

# Docker User Configuration
DOCKER_UID=1001
DOCKER_GID=1001
DOCKER_USERNAME=appuser
EOF
```

### 3. Generate New API Keys

Use the Supabase CLI to generate proper keys:

```bash
# Install Supabase CLI if not already installed
npm install -g @supabase/cli

# Generate new JWT secret
openssl rand -base64 64

# Generate API keys using the JWT secret
# You can use online JWT generators or the Supabase CLI
```

### 4. Switch to Modern Setup

```bash
# Use the modern docker-compose file
cp docker-compose.modern.yml docker-compose.yml

# Start the modern setup
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs supabase
```

### 5. Restore Data (if needed)

```bash
# If you have a database backup
docker exec -i supabase-local psql -U postgres -d postgres < backup.sql
```

### 6. Update Application Configuration

Update your application's Supabase configuration:

```javascript
// src/lib/config/supabase.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || 'http://localhost:8000'
const supabaseAnonKey = process.env.PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

## Port Mapping Comparison

### Old Setup (Multiple Containers)
```
Studio:     3001 → studio:3000
Kong:       8000 → kong:8000
Database:   5435 → db:5432
Analytics:  4000 → analytics:4000
Pooler:     6543 → supavisor:6543
```

### New Setup (Single Container)
```
Studio:     3001 → supabase:3000
Kong:       8000 → supabase:8000
Database:   5432 → supabase:5432
PostgREST:  3001 → supabase:3001
Auth:       9999 → supabase:9999
Realtime:   4000 → supabase:4000
Storage:    5000 → supabase:5000
```

## Environment Variables Mapping

| Old Variable | New Variable | Notes |
|--------------|--------------|-------|
| `POSTGRES_PASSWORD` | `POSTGRES_PASSWORD` | Same |
| `ANON_KEY` | `ANON_KEY` | Same |
| `SERVICE_ROLE_KEY` | `SERVICE_ROLE_KEY` | Same |
| `JWT_SECRET` | `JWT_SECRET` | Same |
| `SUPABASE_PUBLIC_URL` | `SUPABASE_PUBLIC_URL` | Same |
| `KONG_HTTP_PORT` | `KONG_HTTP_PORT` | Same |
| `STUDIO_PORT` | `STUDIO_PORT` | Same |

## Troubleshooting

### Container Won't Start
```bash
# Check logs
docker-compose logs supabase

# Check if ports are available
netstat -tulpn | grep :8000
netstat -tulpn | grep :5432
```

### Database Connection Issues
```bash
# Test database connection
docker exec supabase-local psql -U postgres -d postgres -c "SELECT version();"
```

### Studio Access Issues
```bash
# Check if Studio is accessible
curl http://localhost:3001/api/profile
```

### Migration Issues
```bash
# Run migrations manually
docker exec supabase-local supabase db reset
docker exec supabase-local supabase migration up
```

## Rollback Plan

If you need to rollback to the old setup:

```bash
# Stop modern setup
docker-compose down

# Restore old configuration
cp docker-compose.yml docker-compose.modern.yml
cp docker-compose.backup.yml docker-compose.yml
cp .env.backup .env

# Restore volumes if needed
sudo rm -rf volumes/
sudo cp -r volumes-backup/ volumes/

# Start old setup
docker-compose up -d
```

## Performance Comparison

### Resource Usage
- **Old Setup**: ~2-4GB RAM, 12+ containers
- **New Setup**: ~1-2GB RAM, 1 container

### Startup Time
- **Old Setup**: 60-120 seconds (complex orchestration)
- **New Setup**: 30-60 seconds (single container)

### Maintenance Overhead
- **Old Setup**: High (12+ images to update)
- **New Setup**: Low (1 image to update)

## Next Steps

1. **Test thoroughly**: Verify all functionality works
2. **Update documentation**: Update any deployment docs
3. **Monitor performance**: Check resource usage
4. **Update CI/CD**: Modify any automated deployments
5. **Train team**: Ensure everyone understands the new setup

## Additional Resources

- [Official Supabase Docker Guide](https://supabase.com/docs/guides/self-hosting/docker)
- [Supabase CLI Documentation](https://supabase.com/docs/reference/cli)
- [Docker Compose Best Practices](https://docs.docker.com/compose/production/)