# Docker Volumes Added to .gitignore

## Overview

Added Docker volume directories and application-specific data files to `.gitignore` to prevent sensitive and environment-specific data from being committed to version control.

## Files Added to .gitignore

### 🗂️ **Docker Volumes (General)**
```gitignore
# Docker volumes and persistent data (should not be in git)
volumes/
docker/volumes/
```

### 🗄️ **Supabase Docker Volumes**
```gitignore
# Supabase Docker volumes - contains database data, logs, storage files
volumes/db/data/
volumes/storage/
volumes/logs/
volumes/functions/
volumes/pooler/
```

### 📁 **Application Data**
```gitignore
# Application uploads and user data
uploads/
```

### 🔐 **Environment Files (Additional)**
```gitignore
# Environment files (security - already covered above but being explicit)
.env.production
.env.test
.env.staging
```

## Why These Should Not Be in Git

### 🔒 **Security Reasons**
- **Database Data**: Contains user data, passwords, and sensitive information
- **Environment Files**: Production secrets, API keys, database credentials
- **Storage Files**: User uploads, potentially sensitive documents
- **Logs**: May contain sensitive information, stack traces, user data

### 📊 **Performance Reasons**
- **Large Files**: Database files can be gigabytes in size
- **Frequent Changes**: Database and log files change constantly
- **Binary Data**: Database files are binary and don't diff well in Git

### 🔄 **Environment-Specific Data**
- **Local Development**: Each developer has different local data
- **Production vs Development**: Different environments have different data
- **Temporary Files**: Logs and cache files are temporary by nature

## What Each Volume Contains

| Volume Directory | Contents | Why Ignore |
|------------------|----------|------------|
| `volumes/db/data/` | PostgreSQL database files | Contains all user data, passwords, sensitive info |
| `volumes/storage/` | Supabase Storage files | User uploads, potentially sensitive documents |
| `volumes/logs/` | Application and service logs | May contain sensitive data, constantly changing |
| `volumes/functions/` | Edge function runtime data | Runtime state, temporary files |
| `volumes/pooler/` | Connection pooler data | Database connection state, credentials |
| `uploads/` | Application file uploads | User-generated content, potentially sensitive |

## Docker Volume Structure

Based on our `docker-compose.yml`, these volumes are mounted as:

```yaml
volumes:
  - ./volumes/db/data:/var/lib/postgresql/data:Z          # Database data
  - ./volumes/storage:/var/lib/storage:z                  # Storage files
  - ./volumes/logs/vector.yml:/etc/vector/vector.yml:ro,z # Log configuration
  - ./volumes/functions:/home/deno/functions:Z            # Edge functions
  - ./volumes/pooler/pooler.exs:/etc/pooler/pooler.exs:ro,z # Pooler config
```

## Best Practices

### ✅ **What SHOULD Be in Git**
- Configuration templates (`.env.example`)
- Database migrations (`supabase/migrations/`)
- Application source code
- Docker configuration files (`docker-compose.yml`, `Dockerfile`)
- Volume configuration files (templates)

### ❌ **What Should NOT Be in Git**
- Actual database data
- User uploads
- Log files
- Environment-specific configuration
- Runtime state files
- Cache files

## Recovery and Setup

### For New Developers
1. Clone the repository
2. Copy environment templates: `cp .env.example .env`
3. Run Docker setup: `docker compose up --build`
4. Volumes will be created automatically

### For Backup/Recovery
- Use proper database backup tools
- Store backups securely outside of Git
- Document backup/restore procedures separately

## Security Note

These `.gitignore` entries help prevent accidental commits of sensitive data. However, always:
- Review commits before pushing
- Use environment variables for secrets
- Regularly audit what's being committed
- Use `.env.example` files for configuration templates

This ensures your Docker-based Supabase setup remains secure and doesn't accidentally expose sensitive data through version control.