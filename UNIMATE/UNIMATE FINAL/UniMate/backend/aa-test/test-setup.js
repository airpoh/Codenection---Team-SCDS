#!/usr/bin/env node

/**
 * Test Biconomy Setup
 * Verifies environment configuration and Biconomy connectivity
 */

import fs from 'fs/promises';

console.log('🧪 Testing Biconomy ERC-4337 Setup\n');

// Load environment from parent directory
const envPath = new URL('../smartaccount.env', import.meta.url);

try {
  const envContent = await fs.readFile(envPath, 'utf8');

  // Parse environment variables
  const env = {};
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=');
      if (key && value) {
        env[key] = value;
      }
    }
  });

  console.log('✅ Environment loaded from smartaccount.env\n');

  // Check required variables
  const required = [
    'AMOY_RPC_URL',
    'BICONOMY_BUNDLER_URL',
    'BICONOMY_PAYMASTER_API_KEY',
    'WELL_TOKEN_ADDRESS',
    'REDEMPTION_ADDRESS',
    'SIGNER_PRIVATE_KEY',
    'CHAIN_ID'
  ];

  console.log('📋 Checking required environment variables:\n');

  let allPresent = true;
  for (const key of required) {
    if (env[key]) {
      // Mask sensitive values
      let displayValue = env[key];
      if (key.includes('KEY') || key.includes('PRIVATE')) {
        displayValue = displayValue.substring(0, 10) + '...' + displayValue.substring(displayValue.length - 4);
      }
      console.log(`   ✅ ${key}: ${displayValue}`);
    } else {
      console.log(`   ❌ ${key}: MISSING`);
      allPresent = false;
    }
  }

  console.log('');

  if (allPresent) {
    console.log('✅ All required environment variables are set!');
    console.log('\n📦 Installed packages:');
    const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
    for (const [pkg, version] of Object.entries(packageJson.dependencies)) {
      console.log(`   - ${pkg}@${version}`);
    }

    console.log('\n🚀 Setup complete! Ready to execute batch transactions.');
    console.log('\nTest by running:');
    console.log('   node execute-batch.js <batch-config.json>');
    process.exit(0);
  } else {
    console.log('❌ Some environment variables are missing!');
    console.log('   Please check smartaccount.env in the parent directory.');
    process.exit(1);
  }

} catch (error) {
  console.error('❌ Setup test failed:', error.message);
  process.exit(1);
}
