#!/usr/bin/env node

/**
 * ERC-4337 Batch Transaction Executor
 *
 * Executes approve + redeem transactions via Biconomy Smart Account
 * Owner pays gas fees, user's tokens are spent
 *
 * Usage: node execute-batch.js <batch-config.json>
 */

import { createWalletClient, createPublicClient, http, parseUnits, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygonAmoy } from 'viem/chains';
import { createSmartAccountClient, PaymasterMode } from '@biconomy/account';
import fs from 'fs/promises';
import { exit } from 'process';

// ERC20 ABI (approve function)
const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  }
];

// Redemption System ABI (redeem function)
const REDEMPTION_ABI = [
  {
    inputs: [
      { name: 'rewardId', type: 'string' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'redeem',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
];

/**
 * Load batch configuration from JSON file
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
 * Parse call data string into structured call
 */
function parseCallData(callDataStr, wellAddress, redemptionAddress) {
  const parts = callDataStr.split('_');

  if (parts[0] === 'approve') {
    // Format: approve_<spender>_<amount_wei>
    const spender = parts[1];
    const amountWei = BigInt(parts[2]);

    return {
      to: wellAddress,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spender, amountWei]
      }),
      value: 0n
    };
  } else if (parts[0] === 'redeem') {
    // Format: redeem_<rewardId>_<amount_wei>
    // The rewardId may contain underscores, so the amount is always the LAST part
    const amountWei = BigInt(parts[parts.length - 1]);
    const rewardId = parts.slice(1, -1).join('_'); // Everything between 'redeem' and amount

    return {
      to: redemptionAddress,
      data: encodeFunctionData({
        abi: REDEMPTION_ABI,
        functionName: 'redeem',
        args: [rewardId, amountWei]
      }),
      value: 0n
    };
  }

  throw new Error(`Unknown call type: ${parts[0]}`);
}

/**
 * Execute batch transaction via Biconomy Smart Account
 */
async function executeBatch(config) {
  console.log('🚀 Starting ERC-4337 batch transaction execution...\n');

  // Load environment variables
  const {
    AMOY_RPC_URL,
    BICONOMY_BUNDLER_URL,
    BICONOMY_PAYMASTER_API_KEY,
    WELL_TOKEN_ADDRESS,
    REDEMPTION_ADDRESS
  } = process.env;

  // Validate configuration
  if (!AMOY_RPC_URL || !BICONOMY_BUNDLER_URL || !BICONOMY_PAYMASTER_API_KEY) {
    throw new Error('Missing required environment variables');
  }

  if (!WELL_TOKEN_ADDRESS || !REDEMPTION_ADDRESS) {
    throw new Error('Missing contract addresses');
  }

  // Get user's private key from batch config (passed by Python)
  const userPrivateKey = config.user_private_key;
  if (!userPrivateKey) {
    throw new Error('Missing user_private_key in batch config');
  }

  console.log('📋 Configuration:');
  console.log(`   Smart Account: ${config.smart_account_address}`);
  console.log(`   Chain ID: ${config.chain_id}`);
  console.log(`   Calls: ${config.calls.length}`);
  console.log(`   RPC: ${AMOY_RPC_URL}\n`);

  // Create signer account from user's private key
  // The paymaster will still pay gas fees, but this is the user's account
  const userAccount = privateKeyToAccount(`0x${userPrivateKey.replace('0x', '')}`);

  console.log(`🔑 User Account (signer): ${userAccount.address}\n`);

  // Create public client
  const publicClient = createPublicClient({
    chain: polygonAmoy,
    transport: http(AMOY_RPC_URL)
  });

  // Create wallet client with user's account
  const walletClient = createWalletClient({
    account: userAccount,
    chain: polygonAmoy,
    transport: http(AMOY_RPC_URL)
  });

  // Parse call data into structured transactions
  const transactions = config.calls.map(call => {
    console.log(`📞 Parsing call: ${call.data}`);
    return parseCallData(call.data, WELL_TOKEN_ADDRESS, REDEMPTION_ADDRESS);
  });

  console.log(`\n✅ Parsed ${transactions.length} transactions\n`);

  // Create Biconomy Smart Account client
  console.log('🔧 Creating Biconomy Smart Account client...');

  const smartAccountClient = await createSmartAccountClient({
    signer: walletClient,
    bundlerUrl: BICONOMY_BUNDLER_URL,
    biconomyPaymasterApiKey: BICONOMY_PAYMASTER_API_KEY,
    rpcUrl: AMOY_RPC_URL,
    chainId: config.chain_id
    // NOTE: Let Biconomy SDK derive the smart account address automatically
  });

  const derivedAddress = await smartAccountClient.getAccountAddress();
  console.log(`✅ Smart Account created: ${derivedAddress}\n`);

  // Log address mismatch warning if any
  if (derivedAddress.toLowerCase() !== config.smart_account_address.toLowerCase()) {
    console.warn(`⚠️  Address mismatch: derived ${derivedAddress}, expected ${config.smart_account_address}`);
    console.warn(`   Using derived address for transaction...\n`);
  }

  // Send batch transaction
  console.log('📤 Sending batch UserOperation...');

  const userOpResponse = await smartAccountClient.sendTransaction(transactions, {
    paymasterServiceData: {
      mode: PaymasterMode.SPONSORED // Gasless - owner pays
    }
  });

  console.log(`✅ UserOp sent! Hash: ${userOpResponse.userOpHash}\n`);

  // Wait for transaction receipt
  console.log('⏳ Waiting for transaction confirmation...');

  const receipt = await userOpResponse.wait();

  console.log('✅ Transaction confirmed!\n');
  console.log('📊 Receipt:');
  console.log(`   Transaction Hash: ${receipt.transactionHash || receipt.receipt?.transactionHash || 'N/A'}`);
  console.log(`   Block Number: ${receipt.blockNumber || receipt.receipt?.blockNumber || 'N/A'}`);
  console.log(`   Gas Used: ${receipt.gasUsed || receipt.receipt?.gasUsed || 'N/A'}`);
  console.log(`   Status: ${receipt.success ? 'Success' : 'Failed'}\n`);

  // Handle different receipt formats from Biconomy SDK
  const txHash = receipt.transactionHash || receipt.receipt?.transactionHash || userOpResponse.userOpHash;
  const blockNum = receipt.blockNumber || receipt.receipt?.blockNumber;
  const gasUsed = receipt.gasUsed || receipt.receipt?.gasUsed;

  // Handle success as string "true" or boolean true or status === 1
  const successValue = receipt.success;
  const success = successValue === true || successValue === "true" ||
                  receipt.status === 1 || receipt.receipt?.status === 1 ||
                  receipt.receipt?.status === "0x1";

  // Return result
  return {
    success: success,
    userOpHash: userOpResponse.userOpHash,
    transactionHash: txHash,
    blockNumber: blockNum ? blockNum.toString() : 'pending',
    gasUsed: gasUsed ? gasUsed.toString() : '0',
    receipt: receipt
  };
}

/**
 * Main execution
 */
async function main() {
  try {
    // Get batch config file path from command line
    const configPath = process.argv[2];

    if (!configPath) {
      console.error('❌ Usage: node execute-batch.js <batch-config.json>');
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

    // Execute batch transaction
    const result = await executeBatch(config);

    // Write result to stdout as JSON
    console.log('\n📝 Final Result:');
    console.log(JSON.stringify(result, null, 2));

    // Write result to file for Python to read
    const resultPath = configPath.replace('.json', '-result.json');
    await fs.writeFile(resultPath, JSON.stringify(result, null, 2));
    console.log(`\n💾 Result saved to: ${resultPath}`);

    exit(0);

  } catch (error) {
    console.error('\n❌ Batch execution failed:');
    console.error(error);

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
