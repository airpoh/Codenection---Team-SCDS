import { Bundler } from "@biconomy/account";
import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const {
  AMOY_RPC_URL,
  CHAIN_ID,
  BICONOMY_BUNDLER_URL,
  BICONOMY_PAYMASTER_API_KEY
} = process.env;

async function queryUserOpStatus() {
  try {
    // Get userOpHash from command line argument
    const userOpHash = process.argv[2];
    if (!userOpHash) {
      console.error("Usage: node query-userop-status.js <userOpHash>");
      process.exit(1);
    }

    console.log(`🔍 Querying status for UserOp: ${userOpHash}`);

    // Create bundler instance
    const bundler = new Bundler({
      bundlerUrl: BICONOMY_BUNDLER_URL,
      chainId: parseInt(CHAIN_ID || "80002"),
    });

    // Query UserOp receipt
    try {
      const receipt = await bundler.getUserOpReceipt(userOpHash);

      if (receipt && receipt.receipt) {
        // Check if the UserOp was successful
        const status = receipt.success === true ? "success" : "failed";
        console.log(`Status:${status}`);
        console.log(`EntryPointTxHash:${receipt.receipt.transactionHash || 'unknown'}`);

        if (!receipt.success && receipt.reason) {
          console.log(`RevertReason:${receipt.reason}`);
        }
      } else {
        // If no receipt, try to get status
        try {
          const userOpStatus = await bundler.getUserOpStatus(userOpHash);
          if (userOpStatus && userOpStatus.state) {
            // Biconomy status mapping
            switch (userOpStatus.state) {
              case "pending":
              case "submitted":
                console.log(`Status:pending`);
                break;
              case "success":
                console.log(`Status:success`);
                if (userOpStatus.transactionHash) {
                  console.log(`EntryPointTxHash:${userOpStatus.transactionHash}`);
                }
                break;
              case "failed":
              case "reverted":
                console.log(`Status:failed`);
                if (userOpStatus.reason) {
                  console.log(`RevertReason:${userOpStatus.reason}`);
                }
                break;
              default:
                console.log(`Status:pending`);
            }
          } else {
            console.log(`Status:failed`);
            console.log(`RevertReason:UserOperation not found`);
          }
        } catch (statusError) {
          console.log(`Status:failed`);
          console.log(`RevertReason:UserOperation not found or expired`);
        }
      }

    } catch (error) {
      // UserOp not found or failed
      console.log(`Status:failed`);
      console.log(`RevertReason:${error.message}`);
    }

  } catch (error) {
    console.error("QueryError:", error.message);
    process.exit(1);
  }
}

// Handle cleanup on process exit
process.on('exit', () => {
  // Clean up any resources if needed
});

process.on('SIGINT', () => {
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.exit(0);
});

queryUserOpStatus().catch(console.error);