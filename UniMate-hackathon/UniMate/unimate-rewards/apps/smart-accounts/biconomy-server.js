import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import BiconomyService from "./biconomy-service.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.BICONOMY_SERVER_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Biconomy service
const biconomyService = new BiconomyService();

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "UniMate Biconomy Smart Account Service",
    timestamp: new Date().toISOString()
  });
});

// Create smart account for user
app.post("/smart-account/create", async (req, res) => {
  try {
    const { userPrivateKey } = req.body;

    if (!userPrivateKey) {
      return res.status(400).json({
        success: false,
        error: "userPrivateKey is required"
      });
    }

    const result = await biconomyService.createSmartAccount(userPrivateKey);
    res.json(result);

  } catch (error) {
    console.error("Error in /smart-account/create:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get smart account address (deterministic)
app.post("/smart-account/address", async (req, res) => {
  try {
    const { userPrivateKey } = req.body;

    if (!userPrivateKey) {
      return res.status(400).json({
        success: false,
        error: "userPrivateKey is required"
      });
    }

    const result = await biconomyService.getSmartAccountAddress(userPrivateKey);
    res.json(result);

  } catch (error) {
    console.error("Error in /smart-account/address:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Execute single transaction
app.post("/smart-account/execute", async (req, res) => {
  try {
    const { userPrivateKey, transaction } = req.body;

    if (!userPrivateKey || !transaction) {
      return res.status(400).json({
        success: false,
        error: "userPrivateKey and transaction are required"
      });
    }

    const result = await biconomyService.executeTransaction(userPrivateKey, transaction);
    res.json(result);

  } catch (error) {
    console.error("Error in /smart-account/execute:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Execute batch transactions
app.post("/smart-account/execute-batch", async (req, res) => {
  try {
    const { userPrivateKey, transactions } = req.body;

    if (!userPrivateKey || !transactions || !Array.isArray(transactions)) {
      return res.status(400).json({
        success: false,
        error: "userPrivateKey and transactions array are required"
      });
    }

    const result = await biconomyService.executeBatchTransactions(userPrivateKey, transactions);
    res.json(result);

  } catch (error) {
    console.error("Error in /smart-account/execute-batch:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Estimate gas for transaction
app.post("/smart-account/estimate-gas", async (req, res) => {
  try {
    const { userPrivateKey, transaction } = req.body;

    if (!userPrivateKey || !transaction) {
      return res.status(400).json({
        success: false,
        error: "userPrivateKey and transaction are required"
      });
    }

    const result = await biconomyService.estimateTransactionGas(userPrivateKey, transaction);
    res.json(result);

  } catch (error) {
    console.error("Error in /smart-account/estimate-gas:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get account balance
app.get("/smart-account/balance/:address", async (req, res) => {
  try {
    const { address } = req.params;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: "Smart account address is required"
      });
    }

    const result = await biconomyService.getAccountBalance(address);
    res.json(result);

  } catch (error) {
    console.error("Error in /smart-account/balance:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generate new wallet for testing
app.get("/smart-account/generate-wallet", (req, res) => {
  try {
    const wallet = biconomyService.generateNewWallet();
    res.json({
      success: true,
      wallet
    });
  } catch (error) {
    console.error("Error in /smart-account/generate-wallet:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Specific endpoint for WELL token redemption
app.post("/smart-account/redeem-tokens", async (req, res) => {
  try {
    const { userPrivateKey, amount, userAddress } = req.body;

    if (!userPrivateKey || !amount || !userAddress) {
      return res.status(400).json({
        success: false,
        error: "userPrivateKey, amount, and userAddress are required"
      });
    }

    // Create batch transaction for approve + redeem
    const WELL_TOKEN_ADDRESS = process.env.WELL_TOKEN_ADDRESS;
    const REDEMPTION_ADDRESS = process.env.REDEMPTION_ADDRESS;

    // Encode approve transaction
    const approveData = "0xa9059cbb" + // approve(address,uint256)
      REDEMPTION_ADDRESS.slice(2).padStart(64, '0') + // spender
      parseInt(amount).toString(16).padStart(64, '0'); // amount

    // Encode redeem transaction
    const redeemData = "0x" + // redeem function selector would go here
      userAddress.slice(2).padStart(64, '0') + // user address
      parseInt(amount).toString(16).padStart(64, '0'); // amount

    const transactions = [
      {
        to: WELL_TOKEN_ADDRESS,
        data: approveData
      },
      {
        to: REDEMPTION_ADDRESS,
        data: redeemData
      }
    ];

    const result = await biconomyService.executeBatchTransactions(userPrivateKey, transactions);
    res.json(result);

  } catch (error) {
    console.error("Error in /smart-account/redeem-tokens:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handler
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  res.status(500).json({
    success: false,
    error: "Internal server error"
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Biconomy Smart Account Service running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 Network: Polygon Amoy (Chain ID: ${process.env.CHAIN_ID})`);
});

export default app;