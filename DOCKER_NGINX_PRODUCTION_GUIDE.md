# Docker + Nginx Production Deployment Guide

## Overview

When using Docker in production with an nginx proxy, you **STILL NEED** to modify environment files, but the requirements are different from a traditional deployment.

## 🔄 What Changes vs What Stays

### ✅ **MUST STILL CHANGE** (Critical Security)

```bash
# Database & Security (ALWAYS change these)
POSTGRES_PASSWORD=CHANGE_ME_IN_PRODUCTION
JWT_SECRET=CHANGE_ME_TO_SECURE_32_CHAR_SECRET  
SECRET_KEY_BASE=CHANGE_ME_TO_SECURE_64_CHAR_SECRET
VAULT_ENC_KEY=CHANGE_ME_IN_PRODUCTION

# API Keys & External Services
ANON_KEY=your_supabase_anon_key
SERVICE_ROLE_KEY=your_supabase_service_key
```

### 🔧 **URL Configuration** (Depends on Setup)

**Option A: Nginx Handles All External Traffic**
```bash
# Internal Docker network URLs (can often stay as localhost)
SUPABASE_URL=http://kong:8000
SUPABASE_REST_URL=http://kong:8000/rest/v1
SUPABASE_REALTIME_URL=ws://realtime:4000/socket
SUPABASE_STORAGE_URL=http://kong:8000/storage/v1

# Your app URL (what nginx exposes)
PUBLIC_SUPABASE_URL=https://yourdomain.com/supabase
PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

**Option B: Direct Docker Port Exposure**
```bash
# External URLs if exposing Docker ports directly
SUPABASE_URL=https://supabase.yourdomain.com
SUPABASE_REST_URL=https://supabase.yourdomain.com/rest/v1
```

## 🏗️ **Recommended Architecture**

### Docker Compose + Nginx Proxy Setup

```yaml
# docker-compose.prod.yml
version: '3.8'
services:
  # Your existing Supabase services...
  
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/ssl/certs
    depends_on:
      - kong
      - app
    networks:
      - default

networks:
  default:
    name: supabase_network
```

### Nginx Configuration Example

```nginx
# nginx.conf
upstream supabase_kong {
    server kong:8000;
}

upstream app {
    server app:3000;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;
    
    # SSL configuration
    ssl_certificate /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/certs/key.pem;
    
    # Proxy to your app
    location / {
        proxy_pass http://app;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # Proxy Supabase API
    location /supabase/ {
        proxy_pass http://supabase_kong/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 📋 **Production Environment Checklist**

### 1. **Copy and Modify Environment File**
```bash
# Copy production template
cp .env.production.example .env.production

# Generate secure secrets
export POSTGRES_PASSWORD="$(openssl rand -base64 32)"
export JWT_SECRET="$(openssl rand -base64 32)"
export SECRET_KEY_BASE="$(openssl rand -base64 64)"
export VAULT_ENC_KEY="$(openssl rand -base64 32)"
```

### 2. **Update URLs Based on Your Nginx Setup**
```bash
# If nginx proxies /supabase/* to Kong
PUBLIC_SUPABASE_URL=https://yourdomain.com/supabase

# If nginx uses subdomain
PUBLIC_SUPABASE_URL=https://api.yourdomain.com
```

### 3. **Internal Docker Network URLs**
```bash
# These usually stay the same (internal Docker networking)
SUPABASE_DB_URL=postgresql://postgres:${POSTGRES_PASSWORD}@db:5432/postgres
SUPABASE_REST_URL=http://kong:8000/rest/v1
SUPABASE_REALTIME_URL=ws://realtime:4000/socket
```

## 🔒 **Security Considerations**

### Docker + Nginx Security Benefits
- **SSL Termination**: Nginx handles HTTPS/SSL certificates
- **Rate Limiting**: Nginx can implement rate limiting
- **Network Isolation**: Internal Docker services not directly exposed
- **Load Balancing**: Nginx can distribute traffic

### Required Security Changes
```bash
# ALWAYS change these regardless of proxy setup
POSTGRES_PASSWORD=secure_random_password
JWT_SECRET=secure_32_char_secret
SECRET_KEY_BASE=secure_64_char_secret
VAULT_ENC_KEY=secure_random_key

# Update CORS origins
ADDITIONAL_REDIRECT_URLS=https://yourdomain.com/**
```

## 🚀 **Deployment Commands**

```bash
# Build and deploy with production environment
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Or with specific env file
docker compose --env-file .env.production up -d --build
```

## 📊 **Key Differences from Standard Deployment**

| Aspect | Standard Deployment | Docker + Nginx |
|--------|-------------------|----------------|
| **SSL/HTTPS** | App handles SSL | Nginx handles SSL |
| **Port Exposure** | App ports exposed | Only nginx ports exposed |
| **URL Configuration** | Direct app URLs | Proxied through nginx |
| **Security Secrets** | ⚠️ MUST CHANGE | ⚠️ MUST CHANGE |
| **Database Config** | External DB | Docker internal network |

## ✅ **Summary**

**YES, you still need to modify .env files for Docker + Nginx production because:**

1. **Security secrets must always be changed** (passwords, JWT secrets, etc.)
2. **URL configuration needs to match your nginx proxy setup**
3. **Database and internal service configurations are still required**
4. **API keys and external service credentials are still needed**

**The nginx proxy handles external routing and SSL, but doesn't eliminate the need for proper environment configuration of your Docker services.**