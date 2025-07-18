# JWT Token Management Scripts

This directory contains scripts for managing JWT tokens for Supabase authentication.

## Scripts Overview

### 1. `generate-jwt-tokens.js`
Generates consistent JWT tokens for Supabase using the JWT_SECRET from your `.env` file.

**Features:**
- Reads JWT_SECRET from `.env` file automatically
- Generates both `anon` and `service_role` tokens
- Updates `.env.example` with new tokens
- Verifies token integrity
- Supports command-line JWT_SECRET override

**Usage:**
```bash
# Use JWT_SECRET from .env file
node scripts/generate-jwt-tokens.js

# Override with custom JWT_SECRET
node scripts/generate-jwt-tokens.js "your-custom-jwt-secret-here"
```

### 2. `update-env-tokens.js`
Updates your `.env` file with new JWT tokens generated from the existing JWT_SECRET.

**Features:**
- Reads JWT_SECRET from `.env` file
- Generates fresh tokens using the existing secret
- Updates `.env` file in place
- Verifies token integrity
- Maintains existing JWT_SECRET

**Usage:**
```bash
node scripts/update-env-tokens.js
```

## When to Use Each Script

### Use `generate-jwt-tokens.js` when:
- Setting up a new environment
- You want to update both `.env` and `.env.example`
- You need to change the JWT_SECRET
- You want to generate tokens with a custom secret

### Use `update-env-tokens.js` when:
- You want to refresh tokens with the same JWT_SECRET
- You only need to update the `.env` file
- You're troubleshooting JWT signature issues
- You want to regenerate tokens after configuration changes

## JWT Token Types

Both scripts generate the following tokens:

- **ANON_KEY**: Anonymous access token for client-side operations
- **PUBLIC_SUPABASE_ANON_KEY**: Same as ANON_KEY, used by SvelteKit
- **SERVICE_ROLE_KEY**: Service role token for server-side operations with elevated privileges

## Requirements

- Node.js 20+
- `jsonwebtoken` package (already included in project dependencies)
- `dotenv` package (already included in project dependencies)
- Valid JWT_SECRET in your `.env` file (minimum 32 characters)

## Environment Variables

The scripts work with these environment variables:

```env
JWT_SECRET=your-super-secret-and-long-jwt-secret-with-at-least-32-characters-long
ANON_KEY=generated-anon-token
PUBLIC_SUPABASE_ANON_KEY=generated-anon-token
SERVICE_ROLE_KEY=generated-service-role-token
```

## Troubleshooting

### JWT Signature Mismatch Errors
If you're seeing `JWSError JWSInvalidSignature` errors:

1. Run `node scripts/update-env-tokens.js` to regenerate tokens
2. Restart your Docker containers: `docker-compose down && docker-compose up -d`
3. Test your application

### Token Verification Failed
If token verification fails:

1. Ensure JWT_SECRET is at least 32 characters long
2. Check that JWT_SECRET exists in your `.env` file
3. Verify the `.env` file is in the project root directory

### Missing Dependencies
If you get import errors:

```bash
pnpm install
```

## Security Notes

- Never commit your actual JWT_SECRET to version control
- Use different JWT_SECRET values for different environments
- Regenerate tokens periodically for security
- Keep your JWT_SECRET secure and treat it like a password

## Example Workflow

1. **Initial Setup:**
   ```bash
   # Generate tokens and update both .env.example and .env
   node scripts/generate-jwt-tokens.js
   ```

2. **Refresh Tokens:**
   ```bash
   # Update .env with fresh tokens using existing JWT_SECRET
   node scripts/update-env-tokens.js
   ```

3. **Restart Services:**
   ```bash
   docker-compose down && docker-compose up -d
   ```

4. **Verify Fix:**
   ```bash
   # Test signup endpoint
   curl -X POST http://localhost:3000/api/auth/signup \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"TestPassword123!","username":"testuser","full_name":"Test User"}'