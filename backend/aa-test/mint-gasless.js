#!/usr/bin/env node

/**
 * ERC-4337 Gasless Token Minting Script
 *
 * Mints WELL tokens via Biconomy Smart Account with Paymaster sponsorship
 * TRUE gasless - Paymaster pays all gas fees
 *
 * Usage: node mint-gasless.js <recipient_address> <amount_in_tokens>
 */

import { createWalletClient, createPublicClient, http, parseUnits, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygonAmoy } from 'viem/chains';
import { createSmartAccountClient, PaymasterMode } from '@biconomy/account';
import fs from 'fs/promises';
import { exit } from 'process';

// WELL Token ABI (mint function)
const WELL_TOKEN_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
];

/**
 * Execute gasless mint via Biconomy Smart Account
 */
async function mintGasless(recipientAddress, tokenAmount) {
  console.log('🚀 Starting ERC-4337 gasless token minting...\n');

  // Load environment variables
  const {
    AMOY_RPC_URL,
    BICONOMY_BUNDLER_URL,
    BICONOMY_PAYMASTER_API_KEY,
    WELL_TOKEN_ADDRESS,
    OWNER_PRIVATE_KEY  // Owner's private key to sign minting transaction
  } = process.env;

  // Validate configuration
  if (!AMOY_RPC_URL || !BICONOMY_BUNDLER_URL || !BICONOMY_PAYMASTER_API_KEY) {
    throw new Error('Missing required environment variables (RPC/Bundler/Paymaster)');
  }

  if (!WELL_TOKEN_ADDRESS) {
    throw new Error('Missing WELL_TOKEN_ADDRESS');
  }

  if (!OWNER_PRIVATE_KEY) {
    throw new Error('Missing OWNER_PRIVATE_KEY for minting authorization');
  }

  console.log('📋 Configuration:');
  console.log(`   Recipient: ${recipientAddress}`);
  console.log(`   Amount: ${tokenAmount} WELL`);
  console.log(`   Token: ${WELL_TOKEN_ADDRESS}`);
  console.log(`   RPC: ${AMOY_RPC_URL}\n`);

  // Create owner account (has minting privileges on WELL token)
  const ownerAccount = privateKeyToAccount(`0x${OWNER_PRIVATE_KEY.replace('0x', '')}`);

  console.log(`🔑 Owner Account (minter): ${ownerAccount.address}\n`);

  // Create public client
  const publicClient = createPublicClient({
    chain: polygonAmoy,
    transport: http(AMOY_RPC_URL)
  });

  // Create wallet client with owner's account
  const walletClient = createWalletClient({
    account: ownerAccount,
    chain: polygonAmoy,
    transport: http(AMOY_RPC_URL)
  });

  // Convert token amount to wei (18 decimals)
  const amountWei = parseUnits(tokenAmount.toString(), 18);
  console.log(`💰 Amount in wei: ${amountWei}\n`);

  // Encode mint function call
  const mintCallData = encodeFunctionData({
    abi: WELL_TOKEN_ABI,
    functionName: 'mint',
    args: [recipientAddress, amountWei]
  });

  // Create mint transaction
  const mintTransaction = {
    to: WELL_TOKEN_ADDRESS,
    data: mintCallData,
    value: 0n
  };

  console.log('📞 Mint transaction prepared\n');

  // Create Biconomy Smart Account client for owner
  console.log('🔧 Creating Biconomy Smart Account client...');

  const smartAccountClient = await createSmartAccountClient({
    signer: walletClient,
    bundlerUrl: BICONOMY_BUNDLER_URL,
    biconomyPaymasterApiKey: BICONOMY_PAYMASTER_API_KEY,
    rpcUrl: AMOY_RPC_URL,
    chainId: polygonAmoy.id
  });

  const smartAccountAddress = await smartAccountClient.getAccountAddress();
  console.log(`✅ Smart Account: ${smartAccountAddress}\n`);

  // Send transaction via smart account (gasless - Paymaster pays)
  console.log('📤 Sending gasless UserOperation...');

  const userOpResponse = await smartAccountClient.sendTransaction(mintTransaction, {
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

  // Handle success as string "true" or boolean true or status === 1
  const successValue = receipt.success;
  const success = successValue === true || successValue === "true" ||
                  receipt.status === 1 || receipt.receipt?.status === 1 ||
                  receipt.receipt?.status === "0x1";

  console.log('📊 Mint Result:');
  console.log(`   Success: ${success}`);
  console.log(`   Transaction Hash: ${txHash}`);
  console.log(`   UserOp Hash: ${userOpResponse.userOpHash}`);
  console.log(`   Block Number: ${blockNum || 'pending'}`);
  console.log(`   Gas Used: ${gasUsed || 'N/A'}`);
  console.log(`   Explorer: https://amoy.polygonscan.com/tx/${txHash}\n`);

  // Output for Python backend to parse
  console.log(`Tx: ${txHash}`);
  console.log(`✅ UserOpHash: ${userOpResponse.userOpHash}`);

  return {
    success: success,
    userOpHash: userOpResponse.userOpHash,
    transactionHash: txHash,
    blockNumber: blockNum ? blockNum.toString() : 'pending',
    gasUsed: gasUsed ? gasUsed.toString() : '0',
    recipient: recipientAddress,
    amount: tokenAmount,
    smartAccount: smartAccountAddress
  };
}

/**
 * Main execution
 */
async function main() {
  try {
    // Get recipient and amount from command line
    const recipientAddress = process.argv[2];
    const tokenAmount = parseFloat(process.argv[3]);

    if (!recipientAddress || !tokenAmount) {
      console.error('❌ Usage: node mint-gasless.js <recipient_address> <amount_in_tokens>');
      console.error('   Example: node mint-gasless.js 0x1234...5678 5.5');
      exit(1);
    }

    // Validate recipient address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipientAddress)) {
      throw new Error('Invalid recipient address format');
    }

    // Validate amount
    if (isNaN(tokenAmount) || tokenAmount <= 0) {
      throw new Error('Amount must be a positive number');
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

    // Execute gasless mint
    const result = await mintGasless(recipientAddress, tokenAmount);

    // Write result as JSON for structured parsing
    console.log('\n📝 Final Result JSON:');
    console.log(JSON.stringify(result, null, 2));

    exit(0);

  } catch (error) {
    console.error('\n❌ Gasless mint failed:');
    console.error(error.message);
    console.error(error.stack);

    exit(1);
  }
}

// Run main function
main();
