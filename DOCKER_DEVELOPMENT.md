# Docker Development Setup

This document explains how to use Docker for development with hot reloading capabilities.

## Development with Docker Watch

Docker watch enables hot reloading for your SvelteKit application when files change in the `./src` directory.

### Quick Start

1. **Start with hot reloading:**
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up --watch
   ```

2. **Alternative using main compose file:**
   ```bash
   docker compose up --watch
   ```

### What Gets Watched

The Docker watch configuration monitors:

- **`./src/`** - All source files (synced in real-time)
- **`./static/`** - Static assets (synced in real-time)
- **`./app.html`** - Main HTML template (synced in real-time)
- **Configuration files** - Triggers container rebuild:
  - `package.json`
  - `pnpm-lock.yaml`
  - `svelte.config.js`
  - `vite.config.js`
  - `.env*` files

### File Actions

- **Sync**: Files are synchronized to the container without rebuilding
- **Rebuild**: Container is rebuilt when these files change

### Development vs Production

- **Development** (`Dockerfile.dev`):
  - Installs all dependencies including dev dependencies
  - Runs `pnpm run dev` with hot reloading
  - Sets `NODE_ENV=development`
  - Optimized for fast iteration

- **Production** (`Dockerfile`):
  - Multi-stage build for smaller image size
  - Runs built application with `pnpm start`
  - Sets `NODE_ENV=production`
  - Optimized for performance

### Usage Examples

```bash
# Start development environment with watch
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --watch

# Start without watch (regular development)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Production build
docker compose up

# Stop and remove containers
docker compose down

# Rebuild containers
docker compose build --no-cache
```

### Troubleshooting

1. **Changes not reflecting:**
   - Ensure you're using the `--watch` flag
   - Check that files are being modified in the correct directories
   - Verify the container is running in development mode

2. **Container keeps rebuilding:**
   - Check if you're modifying files that trigger rebuilds
   - Consider moving frequently changed files to sync-only paths

3. **Permission issues:**
   - Ensure your user ID matches the container user ID
   - Set `USER_ID` and `GROUP_ID` environment variables if needed

### Environment Variables

Set these in your `.env` file or environment:

```bash
# User/Group IDs for file permissions
USER_ID=1001
GROUP_ID=1001
USERNAME=appuser

# Application ports
APP_PORT=3000              # SvelteKit app port
KONG_HTTP_PORT=8000        # Supabase API gateway port

# Supabase configuration
POSTGRES_PORT=5432
STUDIO_PORT=3000
# ... other Supabase variables from .env file
```

### Port Configuration

The Docker setup now uses environment variables for all ports:

- **`APP_PORT`**: SvelteKit application port (default: 3000)
- **`KONG_HTTP_PORT`**: Supabase Kong API gateway port (default: 8000)
- **`POSTGRES_PORT`**: PostgreSQL database port (default: 5432)
- **`STUDIO_PORT`**: Supabase Studio dashboard port (default: 3000)

You can customize these ports by modifying your `.env` file.

### Performance Tips

- Use `.dockerignore` to exclude unnecessary files
- Keep `node_modules` out of sync paths
- Use specific file patterns instead of broad directory syncing when possible