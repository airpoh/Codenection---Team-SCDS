import { createSmartAccountClient } from "@biconomy/account";
import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const {
  AMOY_RPC_URL,
  CHAIN_ID,
  TEST_PRIVATE_KEY,
  BICONOMY_BUNDLER_URL,
  BICONOMY_PAYMASTER_API_KEY,
  WELL_TOKEN_ADDRESS
} = process.env;

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

async function transferToSmartAccount() {
  console.log("💸 Transferring WELL Tokens to Smart Account\n");

  try {
    // 1. Setup
    const provider = new ethers.JsonRpcProvider(AMOY_RPC_URL);
    const signer = new ethers.Wallet(TEST_PRIVATE_KEY, provider);

    // 2. Get Smart Account address
    const smartAccount = await createSmartAccountClient({
      signer,
      chainId: parseInt(CHAIN_ID),
      bundlerUrl: BICONOMY_BUNDLER_URL,
      biconomyPaymasterApiKey: BICONOMY_PAYMASTER_API_KEY,
    });

    const smartAccountAddress = await smartAccount.getAccountAddress();
    console.log(`   📍 From: ${signer.address}`);
    console.log(`   📍 To: ${smartAccountAddress}`);

    // 3. Transfer tokens from signer to Smart Account
    const wellToken = new ethers.Contract(WELL_TOKEN_ADDRESS, ERC20_ABI, signer);
    const decimals = await wellToken.decimals();
    const transferAmount = ethers.parseUnits("10", decimals); // Transfer 10 WELL

    console.log("\n   💸 Transferring 10 WELL tokens...");

    const tx = await wellToken.transfer(smartAccountAddress, transferAmount);
    console.log(`   ⏳ Transaction sent: ${tx.hash}`);

    await tx.wait();
    console.log(`   ✅ Transfer confirmed!`);

    // 4. Verify balances
    const smartAccountBalance = await wellToken.balanceOf(smartAccountAddress);
    const smartAccountFormatted = ethers.formatUnits(smartAccountBalance, decimals);

    console.log(`\n   💰 Smart Account now has: ${smartAccountFormatted} WELL`);
    console.log(`   🎯 Ready for batch redemption test!`);

  } catch (error) {
    console.error("\n❌ Transfer failed:", error.message);
  }
}

transferToSmartAccount().catch(console.error);