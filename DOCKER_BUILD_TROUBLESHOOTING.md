# Docker Build Troubleshooting Guide

## 🚨 Common Docker Build Issues & Solutions

### Issue: Permission Denied on Volume Directories

**Error:**
```
failed to solve: error from sender: open /home/ettinger/src/launchpadder.com/launchpadder-web/volumes/db/data: permission denied
```

**Root Cause:**
Docker tries to include all files in the build context, including volume directories that may have restrictive permissions or be owned by Docker.

**✅ Solution Applied:**

1. **Created [`.dockerignore`](.dockerignore:1)** - Excludes volume directories from Docker build context
2. **Fixed volume permissions** - Ensured proper ownership of volume directories

### Quick Fix Commands

```bash
# Fix volume permissions (if needed)
sudo chown -R $USER:$USER volumes/ 2>/dev/null || true

# Build with clean context
docker compose up --build
```

### What's in the .dockerignore

The [`.dockerignore`](.dockerignore:1) file now excludes:

```
# Docker volumes and data directories
volumes/
docker/volumes/

# Environment files (security)
.env
.env.local
.env.production
.env.test

# Build outputs
node_modules/
build/
dist/
.svelte-kit/

# Development files
.git/
.vscode/
.idea/
```

## 🔧 Alternative Solutions

### Option 1: Use Docker Compose without --build
```bash
# If you don't need to rebuild the web container
docker compose up -d
```

### Option 2: Build only specific services
```bash
# Build only the web service
docker compose build web
docker compose up -d
```

### Option 3: Clean Docker build context
```bash
# Remove all volumes and rebuild
docker compose down -v
docker system prune -f
docker compose up --build
```

## 🚀 Recommended Build Process

```bash
# 1. Ensure proper permissions
sudo chown -R $USER:$USER volumes/ 2>/dev/null || true

# 2. Clean previous containers (optional)
docker compose down

# 3. Build with clean context
docker compose up --build -d

# 4. Check service status
docker compose ps
```

## 📋 Build Context Optimization

The [`.dockerignore`](.dockerignore:1) file reduces build context from ~26MB to just the necessary application files, which:

- ✅ Speeds up Docker builds
- ✅ Prevents permission errors
- ✅ Reduces security risks
- ✅ Excludes unnecessary files from containers

## 🔍 Debugging Build Issues

### Check build context size:
```bash
# See what Docker is trying to include
docker build --no-cache --progress=plain .
```

### Verify .dockerignore is working:
```bash
# List files that would be sent to Docker daemon
tar -czh . | wc -c
```

### Check volume permissions:
```bash
# List volume directory permissions
ls -la volumes/
```

## 🛡️ Security Notes

- ✅ [`.env`](.env:1) files are excluded from Docker images
- ✅ Volume data directories are not copied into containers
- ✅ Development files (.git, .vscode) are excluded
- ✅ Build artifacts are excluded to prevent conflicts

The Docker build should now work without permission issues!