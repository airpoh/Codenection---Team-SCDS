import { createSmartAccountClient } from "@biconomy/account";
import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const {
  AMOY_RPC_URL,
  CHAIN_ID,
  TEST_PRIVATE_KEY,
  BICONOMY_BUNDLER_URL,
  BICONOMY_PAYMASTER_API_KEY,
  WELL_TOKEN_ADDRESS,
  REDEMPTION_ADDRESS
} = process.env;

// ERC-20 ABI (minimal)
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

// RedemptionSystem ABI (minimal)
const REDEMPTION_ABI = [
  "function redeem(string calldata rewardId, uint256 wellAmount) external"
];

async function executeBatchFromAPI() {
  try {
    // Get batch data from command line argument (file path)
    const batchFilePath = process.argv[2];
    if (!batchFilePath) {
      console.error("Usage: node execute-batch-from-api.js <batch-file-path>");
      process.exit(1);
    }

    // Read batch data from file
    const batchData = JSON.parse(fs.readFileSync(batchFilePath, 'utf8'));

    console.log(`🚀 Executing batch transaction for Smart Account: ${batchData.smartAccountAddress}`);

    // Setup provider and signer
    const provider = new ethers.JsonRpcProvider(AMOY_RPC_URL);
    const signer = new ethers.Wallet(TEST_PRIVATE_KEY, provider);

    // Create Smart Account
    const smartAccount = await createSmartAccountClient({
      signer,
      chainId: parseInt(CHAIN_ID),
      bundlerUrl: BICONOMY_BUNDLER_URL,
      biconomyPaymasterApiKey: BICONOMY_PAYMASTER_API_KEY,
    });

    // Setup contract instances for ABI encoding
    const wellToken = new ethers.Contract(WELL_TOKEN_ADDRESS, ERC20_ABI, provider);
    const redemptionSystem = new ethers.Contract(REDEMPTION_ADDRESS, REDEMPTION_ABI, provider);

    // Process and encode the calls
    const encodedCalls = [];

    for (const call of batchData.calls) {
      let encodedData = call.data;

      // Handle special encoding patterns from FastAPI
      if (call.data.startsWith("approve_")) {
        const parts = call.data.split("_");
        const spender = parts[1];
        const amount = parts[2];
        encodedData = wellToken.interface.encodeFunctionData("approve", [spender, amount]);
        console.log(`   📝 Encoded approve: ${spender} for ${amount} wei`);

      } else if (call.data.startsWith("redeem_")) {
        const parts = call.data.split("_");
        const rewardId = parts[1];
        const amount = parts[2];
        encodedData = redemptionSystem.interface.encodeFunctionData("redeem", [rewardId, amount]);
        console.log(`   📝 Encoded redeem: "${rewardId}" for ${amount} wei`);
      }

      encodedCalls.push({
        to: call.to,
        data: encodedData,
        value: call.value || "0"
      });
    }

    console.log(`   🔄 Sending batch with ${encodedCalls.length} calls...`);

    // Execute batch transaction
    const userOpResponse = await smartAccount.sendTransaction(encodedCalls);
    console.log(`UserOpHash:${userOpResponse.userOpHash}`);

    // Wait for confirmation
    const userOpReceipt = await userOpResponse.wait();

    if (userOpReceipt.success) {
      console.log(`TransactionHash:${userOpReceipt.receipt?.transactionHash}`);
      console.log("SUCCESS");
    } else {
      console.log("FAILED");
      console.error("UserOp failed:", userOpReceipt);
    }

  } catch (error) {
    console.error("BatchError:", error.message);
    process.exit(1);
  }
}

// Handle cleanup on process exit
process.on('exit', () => {
  // Clean up any temporary files if needed
});

process.on('SIGINT', () => {
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.exit(0);
});

executeBatchFromAPI().catch(console.error);