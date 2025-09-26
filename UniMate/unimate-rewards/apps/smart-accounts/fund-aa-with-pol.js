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
} = process.env;

async function fundSmartAccountWithPOL() {
  console.log("⛽ Funding Smart Account with POL (Native Gas)\n");

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

    console.log(`   📍 Signer: ${signer.address}`);
    console.log(`   📍 Smart Account: ${smartAccountAddress}`);

    // Check current balances
    const signerBalance = await provider.getBalance(signer.address);
    const smartAccountBalance = await provider.getBalance(smartAccountAddress);

    console.log(`\n   💰 Signer POL: ${ethers.formatEther(signerBalance)}`);
    console.log(`   💰 Smart Account POL: ${ethers.formatEther(smartAccountBalance)}`);

    // 3. Transfer some POL to Smart Account for gas
    const transferAmount = ethers.parseEther("0.05"); // 0.05 POL for batch transactions

    if (signerBalance < transferAmount) {
      console.log(`\n   ⚠️  Signer doesn't have enough POL to transfer!`);
      console.log(`   💡 Get more POL from: https://faucet.polygon.technology`);
      return;
    }

    console.log(`\n   💸 Transferring 0.05 POL for gas...`);

    const tx = await signer.sendTransaction({
      to: smartAccountAddress,
      value: transferAmount
    });

    console.log(`   ⏳ Transaction sent: ${tx.hash}`);
    await tx.wait();
    console.log(`   ✅ Transfer confirmed!`);

    // 4. Verify new balances
    const newSmartAccountBalance = await provider.getBalance(smartAccountAddress);
    console.log(`\n   💰 Smart Account now has: ${ethers.formatEther(newSmartAccountBalance)} POL`);

    console.log(`\n   🎯 Smart Account now has both:`);
    console.log(`   • POL for gas fees`);
    console.log(`   • WELL tokens for redemption`);
    console.log(`   Ready for batch transaction test!`);

  } catch (error) {
    console.error("\n❌ Failed to fund Smart Account:", error.message);
  }
}

fundSmartAccountWithPOL().catch(console.error);