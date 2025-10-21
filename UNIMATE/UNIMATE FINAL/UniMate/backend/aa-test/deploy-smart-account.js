#!/usr/bin/env node

/**
 * Deploy Smart Account (if not already deployed)
 *
 * This script checks if a smart account is deployed and deploys it if needed.
 * Uses a simple transaction to trigger deployment.
 *
 * Usage: node deploy-smart-account.js <config.json>
 */

import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygonAmoy } from 'viem/chains';
import { createSmartAccountClient } from '@biconomy/account';
import fs from 'fs/promises';
import { exit } from 'process';

async function deploySmartAccount(config) {
  console.log('🚀 Deploying Smart Account...\n');

  const {
    AMOY_RPC_URL,
    BICONOMY_BUNDLER_URL,
    BICONOMY_PAYMASTER_API_KEY
  } = process.env;

  // Validate configuration
  if (!AMOY_RPC_URL || !BICONOMY_BUNDLER_URL || !BICONOMY_PAYMASTER_API_KEY) {
    throw new Error('Missing required environment variables');
  }

  const userPrivateKey = config.user_private_key;
  if (!userPrivateKey) {
    throw new Error('Missing user_private_key in config');
  }

  console.log('📋 Configuration:');
  console.log(`   Smart Account Address: ${config.smart_account_address}`);
  console.log(`   Chain ID: ${config.chain_id}`);
  console.log(`   RPC: ${AMOY_RPC_URL}\n`);

  // Create user account from private key
  const userAccount = privateKeyToAccount(`0x${userPrivateKey.replace('0x', '')}`);
  console.log(`🔑 User EOA: ${userAccount.address}\n`);

  // Create wallet client
  const walletClient = createWalletClient({
    account: userAccount,
    chain: polygonAmoy,
    transport: http(AMOY_RPC_URL)
  });

  // Create smart account client
  console.log('🔧 Creating Biconomy Smart Account client...');

  const smartAccountClient = await createSmartAccountClient({
    signer: walletClient,
    bundlerUrl: BICONOMY_BUNDLER_URL,
    biconomyPaymasterApiKey: BICONOMY_PAYMASTER_API_KEY,
    rpcUrl: AMOY_RPC_URL,
    chainId: config.chain_id
    // NOTE: We let Biconomy SDK derive the smart account address automatically
    // using its default factory contract (ECDSA module)
  });

  const derivedAddress = await smartAccountClient.getAccountAddress();
  console.log(`✅ Smart Account Address (derived): ${derivedAddress}\n`);
  console.log(`📝 Expected from config: ${config.smart_account_address}\n`);

  // Warn if addresses don't match (factory mismatch)
  if (derivedAddress.toLowerCase() !== config.smart_account_address.toLowerCase()) {
    console.warn(`⚠️  Address mismatch detected!`);
    console.warn(`   Derived: ${derivedAddress}`);
    console.warn(`   Config:  ${config.smart_account_address}`);
    console.warn(`   This indicates the smart account was created with a different factory.`);
    console.warn(`   Using derived address for deployment...\n`);
  }

  // Check if already deployed
  console.log('🔍 Checking if smart account is deployed...');

  const isDeployed = await smartAccountClient.isAccountDeployed();

  if (isDeployed) {
    console.log('✅ Smart account is already deployed!');
    return {
      success: true,
      already_deployed: true,
      smart_account_address: derivedAddress,
      signer_address: userAccount.address
    };
  }

  console.log('📦 Smart account not deployed. Deploying now...\n');

  // Deploy by sending a dummy transaction (send 0 ETH to self)
  // This will trigger deployment via initCode
  console.log('📤 Sending deployment transaction...');

  const userOpResponse = await smartAccountClient.sendTransaction({
    to: derivedAddress, // Send to self
    data: '0x', // Empty data
    value: 0n // 0 ETH
  }, {
    paymasterServiceData: {
      mode: 'SPONSORED' // Gasless deployment
    }
  });

  console.log(`✅ UserOp sent! Hash: ${userOpResponse.userOpHash}\n`);

  // Wait for confirmation
  console.log('⏳ Waiting for deployment confirmation...');

  const receipt = await userOpResponse.wait();

  console.log('✅ Smart account deployed!\n');
  console.log('📊 Receipt:');
  console.log(`   Transaction Hash: ${receipt.transactionHash || receipt.receipt?.transactionHash || 'N/A'}`);
  console.log(`   Block Number: ${receipt.blockNumber || receipt.receipt?.blockNumber || 'N/A'}`);
  console.log(`   Status: ${receipt.success ? 'Success' : 'Failed'}\n`);

  // Handle different receipt formats from Biconomy SDK
  const txHash = receipt.transactionHash || receipt.receipt?.transactionHash || userOpResponse.userOpHash;
  const blockNum = receipt.blockNumber || receipt.receipt?.blockNumber;
  const success = receipt.success === true || receipt.status === 1 || receipt.receipt?.status === 1;

  return {
    success: success,
    already_deployed: false,
    smart_account_address: derivedAddress,
    signer_address: userAccount.address,
    transaction_hash: txHash,
    block_number: blockNum ? blockNum.toString() : 'pending'
  };
}

async function main() {
  try {
    const configPath = process.argv[2];

    if (!configPath) {
      console.error('❌ Usage: node deploy-smart-account.js <config.json>');
      exit(1);
    }

    // Load environment
    const envPath = new URL('../smartaccount.env', import.meta.url);
    const envContent = await fs.readFile(envPath, 'utf8');

    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=');
        if (key && value) {
          process.env[key] = value;
        }
      }
    });

    // Load config
    const data = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(data);

    // Deploy
    const result = await deploySmartAccount(config);

    // Write result
    console.log('\n📝 Final Result:');
    console.log(JSON.stringify(result, null, 2));

    const resultPath = configPath.replace('.json', '-result.json');
    await fs.writeFile(resultPath, JSON.stringify(result, null, 2));
    console.log(`\n💾 Result saved to: ${resultPath}`);

    exit(0);

  } catch (error) {
    console.error('\n❌ Deployment failed:');
    console.error(error);

    const errorResult = {
      success: false,
      error: error.message,
      stack: error.stack
    };

    const configPath = process.argv[2];
    if (configPath) {
      const resultPath = configPath.replace('.json', '-result.json');
      await fs.writeFile(resultPath, JSON.stringify(errorResult, null, 2));
    }

    exit(1);
  }
}

main();
