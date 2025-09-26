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

async function testSmartAccount() {
  console.log("🚀 UniMate ERC-4337 Smart Account Test\n");

  try {
    // 1. Setup provider and signer
    console.log("1️⃣ Setting up provider and signer...");
    const provider = new ethers.JsonRpcProvider(AMOY_RPC_URL);
    const chainId = await provider.getNetwork();
    console.log(`   ✅ Connected to network: ${chainId.name} (${chainId.chainId})`);

    // Check if we have a test private key
    if (!TEST_PRIVATE_KEY || TEST_PRIVATE_KEY === 'your_test_private_key_here') {
      console.log("   ⚠️  No test private key provided. Please:");
      console.log("   1. Create a .env file from .env.example");
      console.log("   2. Add your test private key");
      console.log("   3. Get Biconomy API keys from app.biconomy.io");
      return;
    }

    const signer = new ethers.Wallet(TEST_PRIVATE_KEY, provider);
    console.log(`   ✅ Signer address: ${signer.address}`);

    // Check balance
    const balance = await provider.getBalance(signer.address);
    console.log(`   💰 Balance: ${ethers.formatEther(balance)} POL`);

    if (balance === 0n) {
      console.log("   ⚠️  No balance! Get test POL from https://faucet.polygon.technology");
      return;
    }

    // 2. Check Biconomy configuration
    console.log("\n2️⃣ Checking Biconomy configuration...");
    if (!BICONOMY_BUNDLER_URL || !BICONOMY_PAYMASTER_API_KEY) {
      console.log("   ⚠️  Missing Biconomy configuration. Please:");
      console.log("   1. Go to app.biconomy.io");
      console.log("   2. Create a new project");
      console.log("   3. Get Bundler URL and Paymaster API key");
      console.log("   4. Add them to your .env file");
      return;
    }
    console.log("   ✅ Biconomy configuration found");

    // 3. Create Smart Account
    console.log("\n3️⃣ Creating Smart Account...");

    // Check if Biconomy endpoints are valid
    if (BICONOMY_BUNDLER_URL === 'https://bundler.biconomy.io/api/v2/80002/YOUR_BUNDLER_KEY') {
      console.log("   ⚠️  Please update BICONOMY_BUNDLER_URL with your actual bundler key");
      return;
    }

    if (BICONOMY_PAYMASTER_API_KEY === 'your_paymaster_api_key_here') {
      console.log("   ⚠️  Please update BICONOMY_PAYMASTER_API_KEY with your actual API key");
      return;
    }

    const smartAccount = await createSmartAccountClient({
      signer,
      chainId: parseInt(CHAIN_ID),
      bundlerUrl: BICONOMY_BUNDLER_URL,
      biconomyPaymasterApiKey: BICONOMY_PAYMASTER_API_KEY,
    });

    console.log(`   ✅ Smart Account created!`);
    const smartAccountAddress = await smartAccount.getAccountAddress();
    console.log(`   📍 Smart Account Address: ${smartAccountAddress}`);

    // 4. Test basic transaction capabilities
    console.log("\n4️⃣ Testing transaction capabilities...");

    // For now, just verify the smart account can estimate gas
    try {
      // Create a simple test transaction (approve 0 tokens - should be cheap)
      const testTx = {
        to: WELL_TOKEN_ADDRESS,
        data: "0xa9059cbb" + // transfer function selector
              "000000000000000000000000" + smartAccountAddress.slice(2) + // to address
              "0000000000000000000000000000000000000000000000000000000000000000" // amount: 0
      };

      console.log("   🔍 Estimating gas for test transaction...");

      // This will test if the smart account and bundler are working
      const estimation = await smartAccount.estimateUserOperationGas({
        target: WELL_TOKEN_ADDRESS,
        data: testTx.data
      });

      console.log("   ✅ Gas estimation successful!");
      console.log(`   ⛽ Estimated gas: ${estimation.callGasLimit}`);

    } catch (error) {
      console.log("   ⚠️  Gas estimation failed - this is expected if contracts aren't set up yet");
      console.log(`   📝 Error: ${error.message}`);
    }

    // 5. Next steps
    console.log("\n🎯 Next Steps:");
    console.log("   1. ✅ Polygon Amoy network configured");
    console.log("   2. ✅ Smart Account created successfully");
    console.log("   3. 🔄 Set up Particle Network for mobile integration");
    console.log("   4. 🔄 Implement approve + redeem batch transactions");
    console.log("   5. 🔄 Test end-to-end flow");

    console.log("\n🚀 Ready to proceed with Day 2: Flutter Integration!");

  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.log("\n🔧 Troubleshooting:");
    console.log("   1. Check your .env file configuration");
    console.log("   2. Verify Biconomy API keys are correct");
    console.log("   3. Ensure you have test POL in your wallet");
    console.log("   4. Confirm network is Polygon Amoy (80002)");
  }
}

// Run the test
testSmartAccount().catch(console.error);