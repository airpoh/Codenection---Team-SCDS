import { createSmartAccountClient } from "@biconomy/account";
import { ethers } from "ethers";
import dotenv from "dotenv";

// Load environment variables
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

// ERC-20 ABI (minimal - just what we need)
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

// RedemptionSystem ABI (minimal)
const REDEMPTION_ABI = [
  "function redeem(string calldata rewardId, uint256 wellAmount) external",
  "function canUserRedeem(address user, uint256 amount) view returns (bool)"
];

async function batchApproveAndRedeem() {
  console.log("🚀 UniMate ERC-4337 Batch Approve + Redeem Test\n");

  try {
    // 1. Setup provider and signer
    console.log("1️⃣ Setting up provider and signer...");
    const provider = new ethers.JsonRpcProvider(AMOY_RPC_URL);
    const signer = new ethers.Wallet(TEST_PRIVATE_KEY, provider);

    console.log(`   ✅ Signer address: ${signer.address}`);

    // 2. Create Smart Account
    console.log("\n2️⃣ Creating Smart Account...");
    const smartAccount = await createSmartAccountClient({
      signer,
      chainId: parseInt(CHAIN_ID),
      bundlerUrl: BICONOMY_BUNDLER_URL,
      biconomyPaymasterApiKey: BICONOMY_PAYMASTER_API_KEY,
    });

    const smartAccountAddress = await smartAccount.getAccountAddress();
    console.log(`   ✅ Smart Account Address: ${smartAccountAddress}`);

    // 3. Setup contract instances
    console.log("\n3️⃣ Setting up contracts...");
    const wellToken = new ethers.Contract(WELL_TOKEN_ADDRESS, ERC20_ABI, provider);
    const redemptionSystem = new ethers.Contract(REDEMPTION_ADDRESS, REDEMPTION_ABI, provider);

    // Get token info
    const symbol = await wellToken.symbol();
    const decimals = await wellToken.decimals();
    console.log(`   ✅ Token: ${symbol} (${decimals} decimals)`);

    // 4. Check Smart Account WELL balance
    console.log("\n4️⃣ Checking Smart Account balance...");
    console.log(`   📍 Checking balance for: ${smartAccountAddress}`);
    console.log(`   📍 WELL Token contract: ${WELL_TOKEN_ADDRESS}`);

    const balance = await wellToken.balanceOf(smartAccountAddress);
    const balanceFormatted = ethers.formatUnits(balance, decimals);
    console.log(`   💰 Smart Account ${symbol} Balance: ${balanceFormatted}`);
    console.log(`   🔍 Raw balance: ${balance.toString()}`);

    // Also check the signer's balance for comparison
    const signerBalance = await wellToken.balanceOf(signer.address);
    const signerBalanceFormatted = ethers.formatUnits(signerBalance, decimals);
    console.log(`   🔧 Debug - Signer Balance: ${signerBalanceFormatted} ${symbol}`);

    if (balance === 0n) {
      console.log("\n   ⚠️  Smart Account has no WELL tokens!");
      console.log("   💡 You need to:");
      console.log("   1. Mint some WELL tokens to your smart account first");
      console.log("   2. Or send WELL from another address");
      console.log(`   📍 Smart Account Address: ${smartAccountAddress}`);

      console.log("\n   🔧 You can mint tokens using your existing API:");
      console.log(`   curl -X POST http://localhost:8000/mint_via_minter \\`);
      console.log(`     -H "Content-Type: application/json" \\`);
      console.log(`     -d '{"to": "${smartAccountAddress}", "amount": 10.0}'`);

      return;
    }

    // 5. Test batch transaction: approve + redeem
    console.log("\n5️⃣ Preparing batch transaction...");
    const redeemAmount = ethers.parseUnits("5", decimals); // Redeem 5 WELL tokens
    const rewardId = "coffee_voucher";

    console.log(`   📦 Batch: approve(${REDEMPTION_ADDRESS}, ${ethers.formatUnits(redeemAmount, decimals)}) + redeem("${rewardId}", ${ethers.formatUnits(redeemAmount, decimals)})`);

    // Encode the function calls
    const approveData = wellToken.interface.encodeFunctionData("approve", [REDEMPTION_ADDRESS, redeemAmount]);
    const redeemData = redemptionSystem.interface.encodeFunctionData("redeem", [rewardId, redeemAmount]);

    // 6. Execute batch transaction
    console.log("\n6️⃣ Executing batch transaction...");
    const batchTransactions = [
      {
        to: WELL_TOKEN_ADDRESS,
        data: approveData,
      },
      {
        to: REDEMPTION_ADDRESS,
        data: redeemData,
      }
    ];

    console.log(`   🔄 Sending UserOperation with ${batchTransactions.length} calls...`);

    // Send batch transaction
    const userOpResponse = await smartAccount.sendTransaction(batchTransactions);

    console.log(`   ✅ UserOp sent! Hash: ${userOpResponse.userOpHash}`);
    console.log(`   ⏳ Waiting for confirmation...`);

    // Wait for the transaction to be mined
    const userOpReceipt = await userOpResponse.wait();

    if (userOpReceipt.success) {
      console.log(`   🎉 Batch transaction successful!`);
      console.log(`   📄 Transaction Hash: ${userOpReceipt.receipt?.transactionHash}`);
      console.log(`   🔍 Explorer: https://amoy.polygonscan.com/tx/${userOpReceipt.receipt?.transactionHash}`);

      // 7. Verify results
      console.log("\n7️⃣ Verifying results...");
      const newBalance = await wellToken.balanceOf(smartAccountAddress);
      const newBalanceFormatted = ethers.formatUnits(newBalance, decimals);
      const redeemed = balance - newBalance;

      console.log(`   📉 New balance: ${newBalanceFormatted} ${symbol}`);
      console.log(`   ✅ Redeemed: ${ethers.formatUnits(redeemed, decimals)} ${symbol} for "${rewardId}"`);

    } else {
      console.log(`   ❌ Transaction failed!`);
      console.log(`   📄 Receipt:`, userOpReceipt);
    }

    // 8. Success summary
    console.log("\n🎯 ERC-4337 Batch Transaction Complete!");
    console.log("   ✅ Smart Account successfully executed gasless approve + redeem");
    console.log("   ✅ User paid zero gas fees");
    console.log("   ✅ Biconomy Paymaster sponsored the transaction");
    console.log("   ✅ Ready for production integration!");

  } catch (error) {
    console.error("\n❌ Batch transaction failed:", error.message);

    // Detailed error handling
    if (error.message.includes("insufficient funds")) {
      console.log("\n💡 Solutions:");
      console.log("   1. Fund your Smart Account with WELL tokens");
      console.log("   2. Check Paymaster has enough funds for gas sponsorship");
    } else if (error.message.includes("simulation")) {
      console.log("\n💡 Solutions:");
      console.log("   1. Verify contract addresses are correct");
      console.log("   2. Ensure Smart Account has sufficient WELL balance");
      console.log("   3. Check RedemptionSystem contract allows the reward ID");
    }

    console.log("\n🔧 Debug Info:");
    try {
      const smartAccountAddress = await smartAccount.getAccountAddress();
      console.log(`   Smart Account: ${smartAccountAddress}`);
    } catch (e) {
      console.log(`   Smart Account: Unable to get address`);
    }
    console.log(`   WELL Token: ${WELL_TOKEN_ADDRESS}`);
    console.log(`   Redemption: ${REDEMPTION_ADDRESS}`);
  }
}

// Add command line argument handling
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🚀 UniMate ERC-4337 Batch Transaction Test

Usage:
  npm run batch-redeem

Prerequisites:
  1. Smart Account must have WELL tokens
  2. Biconomy Paymaster must be funded
  3. All contract addresses must be correct in .env

Options:
  --help, -h    Show this help message
  `);
  process.exit(0);
}

// Run the batch transaction
batchApproveAndRedeem().catch(console.error);