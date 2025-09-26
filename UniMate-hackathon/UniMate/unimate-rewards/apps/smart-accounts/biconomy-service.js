import { createSmartAccountClient } from "@biconomy/account";
import { ethers } from "ethers";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const {
  AMOY_RPC_URL,
  CHAIN_ID,
  BICONOMY_BUNDLER_URL,
  BICONOMY_PAYMASTER_API_KEY,
  WELL_TOKEN_ADDRESS,
  REDEMPTION_ADDRESS
} = process.env;

class BiconomyService {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(AMOY_RPC_URL);
    this.chainId = parseInt(CHAIN_ID);
  }

  /**
   * Create a smart account for a user using their private key or wallet
   * @param {string} userPrivateKey - User's private key
   * @returns {Object} Smart account client and address
   */
  async createSmartAccount(userPrivateKey) {
    try {
      console.log("🚀 Creating Smart Account for user...");

      // Create signer from private key
      const signer = new ethers.Wallet(userPrivateKey, this.provider);
      console.log(`   ✅ Signer address: ${signer.address}`);

      // Create Smart Account
      const smartAccount = await createSmartAccountClient({
        signer,
        chainId: this.chainId,
        bundlerUrl: BICONOMY_BUNDLER_URL,
        biconomyPaymasterApiKey: BICONOMY_PAYMASTER_API_KEY,
      });

      const smartAccountAddress = await smartAccount.getAccountAddress();
      console.log(`   📍 Smart Account Address: ${smartAccountAddress}`);

      return {
        smartAccount,
        smartAccountAddress,
        signerAddress: signer.address,
        success: true
      };

    } catch (error) {
      console.error("❌ Error creating smart account:", error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get smart account address for a given signer address (deterministic)
   * @param {string} userPrivateKey - User's private key
   * @returns {string} Smart account address
   */
  async getSmartAccountAddress(userPrivateKey) {
    try {
      const signer = new ethers.Wallet(userPrivateKey, this.provider);

      const smartAccount = await createSmartAccountClient({
        signer,
        chainId: this.chainId,
        bundlerUrl: BICONOMY_BUNDLER_URL,
        biconomyPaymasterApiKey: BICONOMY_PAYMASTER_API_KEY,
      });

      const address = await smartAccount.getAccountAddress();
      return {
        success: true,
        smartAccountAddress: address,
        signerAddress: signer.address
      };

    } catch (error) {
      console.error("❌ Error getting smart account address:", error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute a transaction using the smart account
   * @param {string} userPrivateKey - User's private key
   * @param {Object} transaction - Transaction details {to, value, data}
   * @returns {Object} Transaction result
   */
  async executeTransaction(userPrivateKey, transaction) {
    try {
      console.log("🔄 Executing transaction via Smart Account...");

      const { smartAccount, smartAccountAddress } = await this.createSmartAccount(userPrivateKey);

      if (!smartAccount) {
        throw new Error("Failed to create smart account");
      }

      // Send transaction
      console.log("   📤 Sending transaction...");
      const userOpResponse = await smartAccount.sendTransaction({
        to: transaction.to,
        value: transaction.value || 0,
        data: transaction.data || "0x"
      });

      console.log("   ⏳ Waiting for transaction confirmation...");
      const { receipt, success } = await userOpResponse.wait();

      console.log(`   ✅ Transaction ${success ? 'successful' : 'failed'}!`);
      console.log(`   🔍 Transaction Hash: ${receipt.transactionHash}`);

      return {
        success,
        transactionHash: receipt.transactionHash,
        receipt,
        smartAccountAddress,
        gasUsed: receipt.gasUsed
      };

    } catch (error) {
      console.error("❌ Error executing transaction:", error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute batch transactions (multiple transactions in one UserOperation)
   * @param {string} userPrivateKey - User's private key
   * @param {Array} transactions - Array of transaction objects
   * @returns {Object} Transaction result
   */
  async executeBatchTransactions(userPrivateKey, transactions) {
    try {
      console.log(`🔄 Executing ${transactions.length} transactions in batch...`);

      const { smartAccount, smartAccountAddress } = await this.createSmartAccount(userPrivateKey);

      if (!smartAccount) {
        throw new Error("Failed to create smart account");
      }

      // Prepare batch transactions
      const batchTxs = transactions.map(tx => ({
        to: tx.to,
        value: tx.value || 0,
        data: tx.data || "0x"
      }));

      console.log("   📤 Sending batch transactions...");
      const userOpResponse = await smartAccount.sendTransaction(batchTxs);

      console.log("   ⏳ Waiting for batch transaction confirmation...");
      const { receipt, success } = await userOpResponse.wait();

      console.log(`   ✅ Batch transaction ${success ? 'successful' : 'failed'}!`);
      console.log(`   🔍 Transaction Hash: ${receipt.transactionHash}`);

      return {
        success,
        transactionHash: receipt.transactionHash,
        receipt,
        smartAccountAddress,
        gasUsed: receipt.gasUsed,
        transactionsCount: transactions.length
      };

    } catch (error) {
      console.error("❌ Error executing batch transactions:", error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Estimate gas for a transaction
   * @param {string} userPrivateKey - User's private key
   * @param {Object} transaction - Transaction to estimate
   * @returns {Object} Gas estimation
   */
  async estimateTransactionGas(userPrivateKey, transaction) {
    try {
      const { smartAccount } = await this.createSmartAccount(userPrivateKey);

      if (!smartAccount) {
        throw new Error("Failed to create smart account");
      }

      const estimation = await smartAccount.estimateUserOperationGas({
        target: transaction.to,
        data: transaction.data || "0x",
        value: transaction.value || 0
      });

      return {
        success: true,
        gasEstimation: estimation
      };

    } catch (error) {
      console.error("❌ Error estimating gas:", error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get smart account balance
   * @param {string} smartAccountAddress - Smart account address
   * @returns {Object} Balance information
   */
  async getAccountBalance(smartAccountAddress) {
    try {
      const balance = await this.provider.getBalance(smartAccountAddress);
      return {
        success: true,
        balance: ethers.formatEther(balance),
        balanceWei: balance.toString()
      };
    } catch (error) {
      console.error("❌ Error getting balance:", error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate a new wallet for testing
   * @returns {Object} New wallet details
   */
  generateNewWallet() {
    const wallet = ethers.Wallet.createRandom();
    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic.phrase
    };
  }
}

export default BiconomyService;