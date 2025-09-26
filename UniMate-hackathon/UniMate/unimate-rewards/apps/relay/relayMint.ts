import 'dotenv/config'
import { http, encodeFunctionData, toHex, Hex, Address, createPublicClient } from 'viem'
import { polygonAmoy } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { randomBytes } from 'node:crypto'

import { createSmartAccountClient } from 'permissionless'
import { createPimlicoBundlerClient, createPimlicoPaymasterClient } from 'permissionless/clients/pimlico'
import { toSimpleSmartAccount } from 'permissionless/accounts'
import { ENTRYPOINT_ADDRESS_V07 } from 'permissionless'

// Environment validation
const RELAY_MINTER = process.env.RELAY_MINTER as Address
const BUNDLER_URL = process.env.BUNDLER_URL!
const PAYMASTER_URL = process.env.PAYMASTER_URL!
const BACKEND_SIGNER_PK = process.env.BACKEND_SIGNER_PK as Hex
const DEMO_USER_PK = process.env.DEMO_USER_PK as Hex

if (!RELAY_MINTER || !BUNDLER_URL || !PAYMASTER_URL || !BACKEND_SIGNER_PK || !DEMO_USER_PK) {
  console.error('❌ Missing required environment variables')
  console.error('Required: RELAY_MINTER, BUNDLER_URL, PAYMASTER_URL, BACKEND_SIGNER_PK, DEMO_USER_PK')
  process.exit(1)
}

// EIP-712 domain for RelayMinter (name="RelayMinter", version="1")
const domain = (chainId: number, verifyingContract: Address) => ({
  name: 'RelayMinter',
  version: '1',
  chainId,
  verifyingContract,
})

async function main() {
  try {
    // Parse arguments
    const to = process.argv[2] as Address
    const amount = BigInt(process.argv[3] ?? '5')         // WELL units

    if (!to) {
      console.error('❌ Usage: npm run mint -- <recipient_address> [amount]')
      process.exit(1)
    }

    const amountWei = amount * 10n ** 18n
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300) // +5 min
    const actionId = toHex(randomBytes(32)) as Hex

    console.log('🚀 Starting gasless mint via ERC-4337...')
    console.log('📋 Parameters:')
    console.log(`   Recipient: ${to}`)
    console.log(`   Amount: ${amount} WELL (${amountWei} wei)`)
    console.log(`   ActionId: ${actionId}`)
    console.log(`   Deadline: ${new Date(Number(deadline) * 1000).toISOString()}`)

    // --- Clients & accounts (permissionless.js pattern) ---
    console.log('🔌 Setting up clients...')
    const publicClient = createPublicClient({
      chain: polygonAmoy,
      transport: http(polygonAmoy.rpcUrls.default.http[0])
    })

    const bundlerClient = createPimlicoBundlerClient({
      chain: polygonAmoy,
      transport: http(BUNDLER_URL),
      entryPoint: ENTRYPOINT_ADDRESS_V07,
    })

    const paymasterClient = createPimlicoPaymasterClient({
      chain: polygonAmoy,
      transport: http(PAYMASTER_URL),
      entryPoint: ENTRYPOINT_ADDRESS_V07,
    })

    // Simple smart account for the user (demo key)
    console.log('👤 Creating smart account...')
    const owner = privateKeyToAccount(DEMO_USER_PK)
    const simpleAccount = await toSimpleSmartAccount({ client: publicClient, owners: [owner] })

    console.log(`   Smart Account: ${simpleAccount.address}`)
    console.log(`   Owner: ${owner.address}`)

    const smartClient = createSmartAccountClient({
      account: simpleAccount,
      chain: polygonAmoy,
      bundlerTransport: http(BUNDLER_URL),
      middleware: {
        // Ask Pimlico to sponsor the UserOp
        sponsorUserOperation: paymasterClient.sponsorUserOperation,
        // (optional) gas price from bundler
        gasPrice: async () => (await bundlerClient.getUserOperationGasPrice()).fast,
      },
      userOperation: { entryPoint: ENTRYPOINT_ADDRESS_V07 },
    })

    const chainId = await smartClient.getChainId()
    console.log(`🔗 Chain ID: ${chainId}`)

    // --- Sign the EIP-712 Mint message with BACKEND_SIGNER_PK ---
    console.log('✍️ Signing EIP-712 message...')
    const backend = privateKeyToAccount(BACKEND_SIGNER_PK)
    const sig = await backend.signTypedData({
      domain: domain(chainId, RELAY_MINTER),
      types: {
        Mint: [
          { name: 'to', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
          { name: 'actionId', type: 'bytes32' },
        ],
      },
      primaryType: 'Mint',
      message: { to, amount: amountWei, deadline, actionId } as any,
    })

    console.log(`   Signature: ${sig}`)
    console.log(`   Signer: ${backend.address}`)

    // calldata for RelayMinter.mintWithSig(...)
    console.log('📦 Encoding function call...')
    const data = encodeFunctionData({
      abi: [{
        name: 'mintWithSig',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'to', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
          { name: 'actionId', type: 'bytes32' },
          { name: 'sig', type: 'bytes' },
        ],
        outputs: [],
      }],
      functionName: 'mintWithSig',
      args: [to, amountWei, deadline, actionId, sig as Hex],
    })

    console.log(`   Target: ${RELAY_MINTER}`)
    console.log(`   Calldata: ${data}`)

    // Send a sponsored UserOperation
    console.log('🎯 Sending sponsored UserOperation...')
    const userOpHash = await smartClient.sendUserOperation({
      target: RELAY_MINTER,
      data
    })

    console.log(`✅ UserOpHash: ${userOpHash}`)

    console.log('⏳ Waiting for transaction receipt...')
    const receipt = await smartClient.waitForUserOperationReceipt({ hash: userOpHash })

    console.log('🎉 Transaction successful!')
    console.log(`   Block: ${receipt.receipt.blockNumber}`)
    console.log(`   Gas Used: ${receipt.receipt.gasUsed}`)
    console.log(`   Status: ${receipt.receipt.status}`)
    console.log(`Tx: ${receipt.receipt.transactionHash}`)
    console.log(`Explorer: https://amoy.polygonscan.com/tx/${receipt.receipt.transactionHash}`)

  } catch (error: any) {
    console.error('❌ Error:', error.message)
    if (error.code) {
      console.error(`   Code: ${error.code}`)
    }
    if (error.cause) {
      console.error(`   Cause: ${error.cause}`)
    }
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('💥 Unexpected error:', e)
  process.exit(1)
})