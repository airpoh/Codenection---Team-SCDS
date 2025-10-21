#!/usr/bin/env node

/**
 * ERC-4337 Batch Points Reconciliation Script
 *
 * Reconciles off-chain points to on-chain WELL tokens via Biconomy Smart Account
 * Calls RedemptionSystem.batchReconcile() function with Paymaster sponsorship
 * TRUE gasless - Paymaster pays all gas fees for backend operations
 *
 * Usage: node batch-reconcile.js <batch-config.json>
 */

import { createWalletClient, createPublicClient, http, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygonAmoy } from 'viem/chains';
import { createSmartAccountClient, PaymasterMode } from '@biconomy/account';
import fs from 'fs/promises';
import { exit } from 'process';

// RedemptionSystem ABI (batchReconcile function)
const REDEMPTION_SYSTEM_ABI = [
  {
    inputs: [
      { name: 'users', type: 'address[]' },
      { name: 'points', type: 'uint256[]' }
    ],
    name: 'batchReconcile',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
];

/**
 * Load batch reconciliation configuration from JSON file
 */
async function loadBatchConfig(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`❌ Failed to load batch config: ${error.message}`);
    throw error;
  }
}

/**
 * Execute batch reconciliation via Biconomy Smart Account
 */
async function batchReconcile(config) {
  console.log('🚀 Starting ERC-4337 batch points reconciliation...\n');

  // Load environment variables
  const {
    AMOY_RPC_URL,
    BICONOMY_BUNDLER_URL,
    BICONOMY_PAYMASTER_API_KEY,
    REDEMPTION_ADDRESS,
    OWNER_PRIVATE_KEY  // Backend owner with BACKEND_ROLE
  } = process.env;

  // Validate configuration
  if (!AMOY_RPC_URL || !BICONOMY_BUNDLER_URL || !BICONOMY_PAYMASTER_API_KEY) {
    throw new Error('Missing required environment variables (RPC/Bundler/Paymaster)');
  }

  if (!REDEMPTION_ADDRESS) {
    throw new Error('Missing REDEMPTION_ADDRESS');
  }

  if (!OWNER_PRIVATE_KEY) {
    throw new Error('Missing OWNER_PRIVATE_KEY (backend wallet with BACKEND_ROLE)');
  }

  console.log('📋 Configuration:');
  console.log(`   Users: ${config.users.length}`);
  console.log(`   Total Points: ${config.points.reduce((a, b) => BigInt(a) + BigInt(b), 0n).toString()}`);
  console.log(`   RedemptionSystem: ${REDEMPTION_ADDRESS}`);
  console.log(`   RPC: ${AMOY_RPC_URL}\n`);

  // Validate arrays
  if (config.users.length !== config.points.length) {
    throw new Error('users and points arrays must have same length');
  }

  if (config.users.length === 0) {
    throw new Error('Cannot reconcile empty batch');
  }

  if (config.users.length > 200) {
    throw new Error('Batch too large (max 200 users for gas limit)');
  }

  // Convert points to BigInt array
  const pointsBigInt = config.points.map(p => BigInt(p));

  // Create backend account (has BACKEND_ROLE on RedemptionSystem)
  const backendAccount = privateKeyToAccount(`0x${OWNER_PRIVATE_KEY.replace('0x', '')}`);

  console.log(`🔑 Backend Account (BACKEND_ROLE): ${backendAccount.address}\n`);

  // Create public client
  const publicClient = createPublicClient({
    chain: polygonAmoy,
    transport: http(AMOY_RPC_URL)
  });

  // Create wallet client with backend account
  const walletClient = createWalletClient({
    account: backendAccount,
    chain: polygonAmoy,
    transport: http(AMOY_RPC_URL)
  });

  // Encode batchReconcile function call
  const batchReconcileCallData = encodeFunctionData({
    abi: REDEMPTION_SYSTEM_ABI,
    functionName: 'batchReconcile',
    args: [config.users, pointsBigInt]
  });

  console.log('📞 Encoded batchReconcile() call:');
  console.log(`   Function: batchReconcile(address[],uint256[])`);
  console.log(`   Users: ${config.users.length} addresses`);
  console.log(`   Points: ${config.points.length} values\n`);

  // Create transaction
  const transaction = {
    to: REDEMPTION_ADDRESS,
    data: batchReconcileCallData,
    value: 0n
  };

  console.log('📞 Transaction prepared\n');

  // Create Biconomy Smart Account client for backend
  console.log('🔧 Creating Biconomy Smart Account client...');

  const smartAccountClient = await createSmartAccountClient({
    signer: walletClient,
    bundlerUrl: BICONOMY_BUNDLER_URL,
    biconomyPaymasterApiKey: BICONOMY_PAYMASTER_API_KEY,
    rpcUrl: AMOY_RPC_URL,
    chainId: polygonAmoy.id
  });

  const smartAccountAddress = await smartAccountClient.getAccountAddress();
  console.log(`✅ Backend Smart Account: ${smartAccountAddress}\n`);

  // Important: The backend smart account must have BACKEND_ROLE
  console.log('⚠️  NOTE: Ensure this smart account has BACKEND_ROLE on RedemptionSystem');
  console.log(`   If not, run: grantRole(BACKEND_ROLE, ${smartAccountAddress})\n`);

  // Send transaction via smart account (gasless - Paymaster pays)
  console.log('📤 Sending gasless UserOperation...');

  const userOpResponse = await smartAccountClient.sendTransaction(transaction, {
    paymasterServiceData: {
      mode: PaymasterMode.SPONSORED // TRUE gasless - Paymaster sponsors all gas
    }
  });

  console.log(`✅ UserOp sent! Hash: ${userOpResponse.userOpHash}\n`);

  // Wait for transaction confirmation
  console.log('⏳ Waiting for transaction confirmation...');

  const receipt = await userOpResponse.wait();

  console.log('✅ Transaction confirmed!\n');

  // Extract transaction details
  const txHash = receipt.transactionHash || receipt.receipt?.transactionHash || userOpResponse.userOpHash;
  const blockNum = receipt.blockNumber || receipt.receipt?.blockNumber;
  const gasUsed = receipt.gasUsed || receipt.receipt?.gasUsed;

  // Handle success
  const successValue = receipt.success;
  const success = successValue === true || successValue === "true" ||
                  receipt.status === 1 || receipt.receipt?.status === 1 ||
                  receipt.receipt?.status === "0x1";

  console.log('📊 Batch Reconciliation Result:');
  console.log(`   Success: ${success}`);
  console.log(`   Transaction Hash: ${txHash}`);
  console.log(`   UserOp Hash: ${userOpResponse.userOpHash}`);
  console.log(`   Block Number: ${blockNum || 'pending'}`);
  console.log(`   Gas Used: ${gasUsed || 'N/A'} (Paid by Paymaster)`);
  console.log(`   Users Reconciled: ${config.users.length}`);
  console.log(`   Total Points: ${config.points.reduce((a, b) => BigInt(a) + BigInt(b), 0n).toString()}`);
  console.log(`   Explorer: https://amoy.polygonscan.com/tx/${txHash}\n`);

  // Calculate total WELL tokens minted (assuming 100 points = 1 WELL)
  const pointsToWellRate = config.points_to_well_rate || 100;
  const totalPoints = config.points.reduce((sum, pts) => sum + Number(pts), 0);
  const totalWELL = totalPoints / pointsToWellRate;

  console.log(`💎 Total WELL Minted: ${totalWELL.toFixed(2)} WELL tokens\n`);

  // List reconciled users with their amounts
  console.log('👥 Reconciled Users:');
  for (let i = 0; i < Math.min(config.users.length, 10); i++) {
    const wellAmount = Number(config.points[i]) / pointsToWellRate;
    console.log(`   ${i + 1}. ${config.users[i]}: ${config.points[i]} pts → ${wellAmount.toFixed(2)} WELL`);
  }
  if (config.users.length > 10) {
    console.log(`   ... and ${config.users.length - 10} more users`);
  }
  console.log();

  // Output for Python backend to parse
  console.log(`Tx: ${txHash}`);
  console.log(`✅ UserOpHash: ${userOpResponse.userOpHash}`);

  return {
    success: success,
    userOpHash: userOpResponse.userOpHash,
    transactionHash: txHash,
    blockNumber: blockNum ? blockNum.toString() : 'pending',
    gasUsed: gasUsed ? gasUsed.toString() : '0',
    usersReconciled: config.users.length,
    totalPoints: totalPoints,
    totalWELL: totalWELL,
    smartAccount: smartAccountAddress,
    users: config.users,
    points: config.points.map(p => p.toString())
  };
}

/**
 * Main execution
 */
async function main() {
  try {
    // Get config file path from command line
    const configPath = process.argv[2];

    if (!configPath) {
      console.error('❌ Usage: node batch-reconcile.js <batch-config.json>');
      console.error('   Example: node batch-reconcile.js /tmp/reconcile-batch.json');
      console.error('');
      console.error('Config format:');
      console.error('{');
      console.error('  "users": ["0xAddress1", "0xAddress2"],');
      console.error('  "points": [150, 250],');
      console.error('  "points_to_well_rate": 100');
      console.error('}');
      exit(1);
    }

    // Load environment from parent directory's smartaccount.env
    const envPath = new URL('../smartaccount.env', import.meta.url);
    const envContent = await fs.readFile(envPath, 'utf8');

    // Parse environment variables
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

    // Load batch configuration
    const config = await loadBatchConfig(configPath);

    // Execute batch reconciliation
    const result = await batchReconcile(config);

    // Write result as JSON for structured parsing
    console.log('\n📝 Final Result JSON:');
    console.log(JSON.stringify(result, null, 2));

    // Write result to file for Python to read
    const resultPath = configPath.replace('.json', '-result.json');
    await fs.writeFile(resultPath, JSON.stringify(result, null, 2));
    console.log(`\n💾 Result saved to: ${resultPath}`);

    exit(0);

  } catch (error) {
    console.error('\n❌ Batch reconciliation failed:');
    console.error(error.message);
    console.error(error.stack);

    // Write error to result file
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

// Run main function
main();
