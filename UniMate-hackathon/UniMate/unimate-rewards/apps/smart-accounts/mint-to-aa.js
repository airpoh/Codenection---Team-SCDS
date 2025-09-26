import { createSmartAccountClient } from "@biconomy/account";
import { ethers } from "ethers";
import dotenv from "dotenv";
import http from "http";

dotenv.config();

const {
  AMOY_RPC_URL,
  CHAIN_ID,
  TEST_PRIVATE_KEY,
  BICONOMY_BUNDLER_URL,
  BICONOMY_PAYMASTER_API_KEY,
} = process.env;

async function mintToSmartAccount() {
  console.log("💰 Minting WELL Tokens to Smart Account\n");

  try {
    // 1. Create smart account to get address
    console.log("1️⃣ Getting Smart Account address...");
    const provider = new ethers.JsonRpcProvider(AMOY_RPC_URL);
    const signer = new ethers.Wallet(TEST_PRIVATE_KEY, provider);

    const smartAccount = await createSmartAccountClient({
      signer,
      chainId: parseInt(CHAIN_ID),
      bundlerUrl: BICONOMY_BUNDLER_URL,
      biconomyPaymasterApiKey: BICONOMY_PAYMASTER_API_KEY,
    });

    const smartAccountAddress = await smartAccount.getAccountAddress();
    console.log(`   ✅ Smart Account Address: ${smartAccountAddress}`);

    // 2. Call your existing API to mint tokens
    console.log("\n2️⃣ Calling existing mint API...");

    const mintData = JSON.stringify({
      to: smartAccountAddress,
      amount: 10.0
    });

    const options = {
      hostname: 'localhost',
      port: 8000,
      path: '/mint_via_minter',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(mintData)
      }
    };

    const response = await new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(mintData);
      req.end();
    });

    console.log(`   ✅ Minted 10 WELL tokens to Smart Account!`);
    console.log(`   📄 Transaction: ${response.tx_hash}`);
    console.log(`   🔍 Explorer: ${response.explorer}`);

    console.log("\n🎯 Ready for batch redemption test!");
    console.log("   Run: npm run batch-redeem");

  } catch (error) {
    console.error("\n❌ Failed to mint to Smart Account:", error.message);

    if (error.message.includes('ECONNREFUSED')) {
      console.log("\n💡 Solutions:");
      console.log("   1. Make sure your FastAPI server is running:");
      console.log("      cd ../../api && uvicorn main:app --reload --port 8000");
      console.log("   2. Or use the direct minting endpoint:");
      console.log("      curl -X POST http://localhost:8000/mint \\");
      console.log("        -H 'Content-Type: application/json' \\");
      console.log(`        -d '{"to": "YOUR_SMART_ACCOUNT_ADDRESS", "amount": 10.0, "ts": ${Math.floor(Date.now()/1000)}, "sig": "demo_sig"}'`);
    }
  }
}

mintToSmartAccount().catch(console.error);