#!/usr/bin/env node

/**
 * Update .env file with new JWT tokens
 * This script generates new JWT tokens using the JWT_SECRET from .env and updates the file
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

// Get configuration from environment variables
const JWT_ISSUER = process.env.JWT_ISSUER || 'supabase-demo';

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
    iss: JWT_ISSUER,
    role: 'anon',
    iat: now,
    exp: expiry
  };

  // Service role token
  const servicePayload = {
    iss: JWT_ISSUER,
    role: 'service_role',
    iat: now,
    exp: expiry
  };

  const anonToken = jwt.sign(anonPayload, jwtSecret, { algorithm: 'HS256' });
  const serviceToken = jwt.sign(servicePayload, jwtSecret, { algorithm: 'HS256' });

  return {
    ANON_KEY: anonToken,
    PUBLIC_SUPABASE_ANON_KEY: anonToken,
    SERVICE_ROLE_KEY: serviceToken
  };
}

/**
 * Update .env file with new tokens
 */
function updateEnvFile() {
  const envPath = join(__dirname, '..', '.env');
  
  try {
    // Get JWT_SECRET from environment
    const jwtSecret = process.env.JWT_SECRET;
    
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not found in .env file. Please ensure it exists.');
    }
    
    if (jwtSecret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters long');
    }
    
    console.log('🔄 Generating new JWT tokens using JWT_SECRET from .env...\n');
    
    // Generate new tokens using the JWT_SECRET from .env
    const newTokens = generateTokens(jwtSecret);
    
    let envContent = readFileSync(envPath, 'utf8');
    
    console.log('🔄 Updating .env file with new JWT tokens...\n');
    
    // Update each token
    Object.entries(newTokens).forEach(([key, value]) => {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
        console.log(`✅ Updated ${key}`);
      } else {
        // If the key doesn't exist, add it
        envContent += `\n${key}=${value}`;
        console.log(`➕ Added ${key}`);
      }
    });
    
    writeFileSync(envPath, envContent);
    console.log('\n🎉 Successfully updated .env file with new JWT tokens!');
    
    // Verify tokens
    console.log('\n🔍 Verifying generated tokens...');
    try {
      const anonDecoded = jwt.verify(newTokens.ANON_KEY, jwtSecret);
      const serviceDecoded = jwt.verify(newTokens.SERVICE_ROLE_KEY, jwtSecret);
      
      console.log('✅ Token verification successful');
      console.log('Anon token role:', anonDecoded.role);
      console.log('Service token role:', serviceDecoded.role);
    } catch (verifyError) {
      console.error('❌ Token verification failed:', verifyError.message);
      throw verifyError;
    }
    
    console.log('\n📝 Next steps:');
    console.log('1. Restart your Docker containers to pick up the new tokens');
    console.log('2. Test the signup functionality');
    
  } catch (error) {
    console.error('❌ Error updating .env file:', error.message);
    throw error;
  }
}

/**
 * Main function
 */
function main() {
  try {
    updateEnvFile();
  } catch (error) {
    console.error('❌ Failed to update .env file:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { updateEnvFile, generateTokens };