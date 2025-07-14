# 🐳 Local Testing with Docker

This guide helps you test your LaunchPadder application locally using Docker before deploying to production.

## 🚀 Quick Start

```bash
# 1. Update your environment configuration
cp .env.local .env.local.backup  # backup if you have custom values
# Edit .env.local with your API keys

# 2. Run the automated test script
./scripts/test-local.sh
```

## 📋 Prerequisites

- **Docker & Docker Compose** installed and running
- **pnpm** package manager (`npm install -g pnpm`)
- **Git** for version control

## 🔧 Environment Setup

### Required API Keys

Before testing, you need to obtain these API keys:

```bash
# Edit .env.local and add your keys:
OPENAI_API_KEY=sk-your-openai-key-here
STRIPE_SECRET_KEY=sk_test_your-stripe-test-key
STRIPE_WEBHOOK_SECRET=whsec_test_webhook_secret
COINGECKO_API_KEY=your-coingecko-api-key
```

### Security Settings

Update these for production security:

```bash
POSTGRES_PASSWORD=your-super-secret-and-long-postgres-password
JWT_SECRET=your-super-secret-jwt-token-with-at-least-32-characters-long
DASHBOARD_PASSWORD=your-secure-dashboard-password
```

## 🛠️ Manual Testing Steps

If you prefer manual control:

### 1. Start Supabase Services

```bash
# Load environment variables
export $(grep -v '^#' .env.local | xargs)

# Start all Supabase services
docker-compose -f docker-compose.local.yml up -d

# Check service status
docker-compose -f docker-compose.local.yml ps
```

### 2. Wait for Services

```bash
# Wait for Kong API Gateway to be ready
while ! curl -f http://localhost:8000/health &> /dev/null; do
  echo "Waiting for services..."
  sleep 5
done
echo "✅ Services are ready!"
```

### 3. Run Database Migrations

```bash
# Apply your database migrations
docker exec supabase-db psql -U postgres -d postgres -f /path/to/your/migration.sql
```

### 4. Build and Start Your App

```bash
# Install dependencies
pnpm install

# Build the application
pnpm run build

# Start in preview mode
pnpm run preview --port 3000
```

### 5. Run Tests

```bash
# Run your test suite
pnpm run test

# Run integration tests (if available)
pnpm run test:integration
```

## 🌐 Service URLs

Once running, access these services:

- **🌐 Your Web App:** http://localhost:3000
- **🎛️ Supabase Studio:** http://localhost:3001
- **🚪 Kong API Gateway:** http://localhost:8000
- **🗄️ PostgreSQL Database:** localhost:5432

## 🔑 Default Credentials

- **Supabase Studio:** 
  - Username: `supabase`
  - Password: `this_password_is_insecure_and_should_be_updated`

## 🧪 Testing Checklist

- [ ] All Docker services start successfully
- [ ] Database migrations apply without errors
- [ ] Web application builds and starts
- [ ] Health endpoints respond correctly
- [ ] Unit tests pass
- [ ] Integration tests pass (if available)
- [ ] API endpoints work as expected
- [ ] Authentication flow works
- [ ] Database operations work

## 🐛 Troubleshooting

### Services Won't Start

```bash
# Check Docker is running
docker info

# Check for port conflicts
netstat -tulpn | grep :3000
netstat -tulpn | grep :8000

# View service logs
docker-compose -f docker-compose.local.yml logs [service-name]
```

### Database Connection Issues

```bash
# Check database is ready
docker exec supabase-db pg_isready -U postgres

# Connect to database directly
docker exec -it supabase-db psql -U postgres -d postgres
```

### Web App Won't Start

```bash
# Check Node.js version
node --version  # Should be 20+

# Clear build cache
rm -rf build/
pnpm run build

# Check for missing dependencies
pnpm install
```

### API Key Issues

```bash
# Verify environment variables are loaded
echo $OPENAI_API_KEY
echo $SUPABASE_URL

# Check .env.local file exists and is readable
cat .env.local | grep -v '^#' | head -5
```

## 🧹 Cleanup

```bash
# Stop all services
docker-compose -f docker-compose.local.yml down

# Remove volumes (⚠️ This deletes all data)
docker-compose -f docker-compose.local.yml down -v

# Remove images (optional)
docker-compose -f docker-compose.local.yml down --rmi all
```

## 📊 Monitoring

### View Logs

```bash
# All services
docker-compose -f docker-compose.local.yml logs -f

# Specific service
docker-compose -f docker-compose.local.yml logs -f db

# Your web app (if running separately)
pnpm run preview --port 3000 2>&1 | tee app.log
```

### Resource Usage

```bash
# Check container resource usage
docker stats

# Check disk usage
docker system df
```

## 🚀 Ready for Production?

Once local testing passes:

1. ✅ All tests pass
2. ✅ All features work as expected
3. ✅ No console errors
4. ✅ Database operations work
5. ✅ API integrations work

You're ready to deploy to your server using:

```bash
./scripts/deploy-to-profullstack.sh
```

## 🆘 Need Help?

- Check the main [README.md](README.md) for project overview
- Review [docker-compose.local.yml](docker-compose.local.yml) for service configuration
- Examine [.env.local](.env.local) for environment variables
- Run `./scripts/test-local.sh --help` for script options