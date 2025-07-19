#!/usr/bin/env node

/**
 * JWT Token Generator for Supabase
 * Generates consistent anon and service_role JWT tokens using the same secret
 */

import jwt from 'jsonwebtoken';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: join(__dirname, '..', '.env') });

// No default JWT secret - must be provided via environment variable

/**
 * Generate JWT tokens for Supabase
 * @param {string} jwtSecret - The JWT secret to use for signing
 * @returns {Object} Object containing anon and service_role tokens
 */
function generateTokens(jwtSecret) {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + (100 * 365 * 24 * 60 * 60); // 100 years from now

  // Anonymous role token
  const anonPayload = {
    iss: 'supabase-demo',
    role: 'anon',
    iat: now,
    exp: expiry
  };

  // Service role token  
  const servicePayload = {
    iss: 'supabase-demo',
    role: 'service_role',
    iat: now,
    exp: expiry
  };

  const anonToken = jwt.sign(anonPayload, jwtSecret, { algorithm: 'HS256' });
  const serviceToken = jwt.sign(servicePayload, jwtSecret, { algorithm: 'HS256' });

  return {
    anonToken,
    serviceToken,
    jwtSecret
  };
}

/**
 * Update .env.example file with new tokens
 * @param {Object} tokens - Generated tokens object
 */
function updateEnvExample(tokens) {
  const envPath = join(__dirname, '..', '.env.example');
  
  try {
    let envContent = readFileSync(envPath, 'utf8');
    
    // Update JWT secret
    envContent = envContent.replace(
      /JWT_SECRET=.*/,
      `JWT_SECRET=${tokens.jwtSecret}`
    );
    
    // Update ANON_KEY
    envContent = envContent.replace(
      /ANON_KEY=.*/,
      `ANON_KEY=${tokens.anonToken}`
    );
    
    // Update PUBLIC_SUPABASE_ANON_KEY
    envContent = envContent.replace(
      /PUBLIC_SUPABASE_ANON_KEY=.*/,
      `PUBLIC_SUPABASE_ANON_KEY=${tokens.anonToken}`
    );
    
    // Update SERVICE_ROLE_KEY
    envContent = envContent.replace(
      /SERVICE_ROLE_KEY=.*/,
      `SERVICE_ROLE_KEY=${tokens.serviceToken}`
    );
    
    writeFileSync(envPath, envContent);
    console.log('✅ Updated .env.example with new JWT tokens');
  } catch (error) {
    console.error('❌ Error updating .env.example:', error.message);
    throw error;
  }
}

/**
 * Verify tokens can be decoded with the secret
 * @param {Object} tokens - Generated tokens object
 */
function verifyTokens(tokens) {
  try {
    const anonDecoded = jwt.verify(tokens.anonToken, tokens.jwtSecret);
    const serviceDecoded = jwt.verify(tokens.serviceToken, tokens.jwtSecret);
    
    console.log('✅ Token verification successful');
    console.log('Anon token role:', anonDecoded.role);
    console.log('Service token role:', serviceDecoded.role);
    
    return true;
  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    return false;
  }
}

/**
 * Main function
 */
function main() {
  console.log('🔐 Generating JWT tokens for Supabase...\n');
  
  // Use JWT secret from environment variable (JWT_TOKEN or JWT_SECRET) or command line argument
  const jwtSecret = process.env.JWT_TOKEN || process.env.JWT_SECRET || process.argv[2];
  
  if (!jwtSecret) {
    console.error('❌ JWT secret is required but not provided!');
    console.error('Please set the JWT_TOKEN environment variable in your .env file or pass it as a command line argument.');
    console.error('\nExample:');
    console.error('  JWT_TOKEN=your-secret-key node scripts/generate-jwt-tokens.js');
    console.error('  or');
    console.error('  node scripts/generate-jwt-tokens.js your-secret-key');
    process.exit(1);
  }
  
  if (jwtSecret.length < 32) {
    console.error('❌ JWT secret must be at least 32 characters long');
    console.error('Current length:', jwtSecret.length);
    process.exit(1);
  }
  
  const secretSource = process.env.JWT_TOKEN ? 'JWT_TOKEN env var' :
                      process.env.JWT_SECRET ? 'JWT_SECRET env var' :
                      'command line argument';
  console.log('Using JWT secret from:', secretSource);
  
  try {
    // Generate tokens
    const tokens = generateTokens(jwtSecret);
    
    console.log('Generated tokens:');
    console.log('JWT_SECRET:', tokens.jwtSecret);
    console.log('ANON_KEY:', tokens.anonToken);
    console.log('SERVICE_ROLE_KEY:', tokens.serviceToken);
    console.log('');
    
    // Verify tokens
    if (!verifyTokens(tokens)) {
      process.exit(1);
    }
    
    // Update .env.example
    updateEnvExample(tokens);
    
    console.log('\n🎉 JWT tokens generated and updated successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Copy .env.example to .env if you haven\'t already');
    console.log('2. Restart your Docker containers to pick up the new tokens');
    console.log('3. Test the signup functionality');
    
  } catch (error) {
    console.error('❌ Error generating tokens:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateTokens, verifyTokens };