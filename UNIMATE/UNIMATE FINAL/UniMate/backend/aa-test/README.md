# UniMate AA-Test: Node.js Blockchain Scripts

This directory contains **Node.js scripts for executing blockchain operations** via the **Biconomy SDK** (ERC-4337 Account Abstraction). These scripts are called by the Python FastAPI backend as subprocesses to handle all blockchain transactions with gasless execution.

## 📋 Overview

### Why Node.js?

The Python backend delegates blockchain operations to these Node.js scripts because:
- **Biconomy SDK** has mature JavaScript/TypeScript support
- **ERC-4337 (Account Abstraction)** is better supported in the JS ecosystem
- **Viem library** provides excellent Ethereum interaction tools
- Allows **clean separation** between API logic (Python) and blockchain execution (Node.js)

### Architecture

```
┌────────────────────┐
│  FastAPI Backend   │
│  (Python 3.10+)    │
└─────────┬──────────┘
          │ subprocess.run()
          │ Passes: user address, amount, config
          ▼
┌────────────────────┐
│  Node.js Scripts   │
│  (aa-test/*.js)    │
│  • Uses Biconomy   │
│  • Creates UserOps │
│  • Returns JSON    │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│  Biconomy SDK      │
│  • Bundler         │
│  • Paymaster       │
│  • Smart Accounts  │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│  Polygon Amoy      │
│  (Blockchain)      │
└────────────────────┘
```

## 📁 Scripts

### 1. `mint-gasless.js` - Gasless Token Minting

**Purpose:** Mints WELL tokens to a user's smart account with zero gas fees (Paymaster sponsored).

**Usage:**
```bash
node mint-gasless.js <recipient_address> <amount_in_tokens>
```

**Example:**
```bash
node mint-gasless.js 0x1234567890123456789012345678901234567890 5.5
# Mints 5.5 WELL tokens to address 0x1234...5678
```

**How it Works:**
1. Loads environment from `../smartaccount.env`
2. Creates owner account from `OWNER_PRIVATE_KEY` (has MINTER_ROLE)
3. Creates Biconomy Smart Account client
4. Encodes `mint(address to, uint256 amount)` function call
5. Sends UserOperation via Biconomy with Paymaster sponsorship
6. Waits for transaction confirmation
7. Returns JSON result with transaction hash and status

**Output (JSON):**
```json
{
  "success": true,
  "userOpHash": "0xabc...",
  "transactionHash": "0xdef...",
  "blockNumber": "12345678",
  "gasUsed": "0",
  "recipient": "0x1234...5678",
  "amount": 5.5,
  "smartAccount": "0xSmart...Account"
}
```

**Key Features:**
- ✅ **100% Gasless** - Paymaster pays all gas
- ✅ **ERC-4337** - Uses UserOperations
- ✅ **Secure** - Owner must have MINTER_ROLE on WELL contract
- ✅ **JSON Output** - Easy to parse in Python

---

### 2. `execute-batch.js` - Batch Transaction Execution

**Purpose:** Executes multiple transactions in a single UserOperation (approve + redeem voucher).

**Usage:**
```bash
node execute-batch.js <batch-config.json>
```

**Batch Config Format:**
```json
{
  "smart_account_address": "0xUser...SmartAccount",
  "user_private_key": "0xuser_private_key",
  "chain_id": 80002,
  "calls": [
    {
      "data": "approve_0xRedemptionSystemAddress_1000000000000000000"
    },
    {
      "data": "redeem_voucher_id_123_1000000000000000000"
    }
  ]
}
```

**Call Data Formats:**
- **Approve:** `approve_<spender_address>_<amount_wei>`
- **Redeem:** `redeem_<reward_id>_<amount_wei>`

**How it Works:**
1. Loads batch configuration from JSON file
2. Parses call data into structured transactions:
   - `approve` → Encodes ERC20 `approve(spender, amount)`
   - `redeem` → Encodes `RedemptionSystem.redeem(rewardId, amount)`
3. Creates Biconomy Smart Account from user's private key
4. Sends batch UserOperation with Paymaster sponsorship
5. Waits for confirmation
6. Saves result to `<config>-result.json`

**Output:**
```json
{
  "success": true,
  "userOpHash": "0xabc...",
  "transactionHash": "0xdef...",
  "blockNumber": "12345678",
  "gasUsed": "0",
  "receipt": { ... }
}
```

**Key Features:**
- ✅ **Atomic Execution** - All or nothing (approve + redeem)
- ✅ **Gasless** - Paymaster sponsors gas
- ✅ **Flexible** - Supports multiple call types
- ✅ **File-based I/O** - Easy integration with Python

---

### 3. `deploy-smart-account.js` - Smart Account Deployment

**Purpose:** Deploys a user's smart account contract if not already deployed.

**Usage:**
```bash
node deploy-smart-account.js <config.json>
```

**Config Format:**
```json
{
  "smart_account_address": "0xExpected...Address",
  "user_private_key": "0xuser_private_key",
  "chain_id": 80002
}
```

**How it Works:**
1. Creates Biconomy Smart Account client from user's private key
2. Derives smart account address using Biconomy's default factory
3. Checks if smart account is already deployed via `isAccountDeployed()`
4. If not deployed:
   - Sends a dummy transaction (0 ETH to self)
   - Triggers deployment via `initCode`
   - Paymaster sponsors deployment gas
5. Returns deployment status

**Output:**
```json
{
  "success": true,
  "already_deployed": false,
  "smart_account_address": "0xDeployed...Address",
  "signer_address": "0xUser...EOA",
  "transaction_hash": "0xabc...",
  "block_number": "12345678"
}
```

**Key Features:**
- ✅ **Idempotent** - Safe to call multiple times
- ✅ **Gasless Deployment** - Paymaster pays deployment gas
- ✅ **Address Validation** - Warns on address mismatch
- ✅ **Auto-deploy** - Deploys only if needed

---

### 4. `batch-reconcile.js` - Automated Points Reconciliation

**Purpose:** Converts off-chain points to on-chain WELL tokens via batch reconciliation (daily automated job).

**Usage:**
```bash
node batch-reconcile.js <batch-config.json>
```

**Example:**
```bash
# Create config file
cat > reconcile-batch.json << EOF
{
  "users": ["0x1234...", "0x5678..."],
  "points": [150, 250],
  "points_to_well_rate": 100
}
EOF

node batch-reconcile.js reconcile-batch.json
```

**How it Works:**
1. Loads backend OWNER_PRIVATE_KEY (has BACKEND_ROLE on RedemptionSystem)
2. Creates Biconomy Smart Account for backend
3. Encodes `batchReconcile(address[] users, uint256[] points)`
4. Sends UserOperation via Biconomy with Paymaster sponsorship
5. Waits for confirmation
6. Returns JSON result with transaction details

**Output:**
```json
{
  "success": true,
  "userOpHash": "0xabc...",
  "transactionHash": "0xdef...",
  "blockNumber": "12345678",
  "gasUsed": "0",
  "usersReconciled": 2,
  "totalPoints": 400,
  "totalWELL": 4.0,
  "smartAccount": "0xBackend...SmartAccount"
}
```

**Key Features:**
- ✅ **100% Gasless** - Paymaster sponsors all gas
- ✅ **Batch Processing** - Up to 200 users per transaction
- ✅ **Automated** - Called daily by backend scheduler
- ✅ **Secure** - Backend smart account needs BACKEND_ROLE

**Important:** Backend smart account must have BACKEND_ROLE:
```bash
# Grant role (one-time setup)
cast send $REDEMPTION_SYSTEM \
  "grantRole(bytes32,address)" \
  $(cast keccak "BACKEND_ROLE") \
  $BACKEND_SMART_ACCOUNT \
  --private-key $OWNER_PRIVATE_KEY
```

---

### 5. `test-setup.js` - Test Configuration

**Purpose:** Tests Biconomy setup and validates configuration.

**Usage:**
```bash
node test-setup.js
```

---

## 🔧 Setup & Installation

### Install Dependencies

```bash
cd backend/aa-test
npm install
```

### Dependencies (package.json)

```json
{
  "dependencies": {
    "@biconomy/account": "^4.0.0",
    "viem": "^2.0.0"
  },
  "type": "module"
}
```

**Key Packages:**
- **@biconomy/account** - Biconomy SDK for ERC-4337
- **viem** - Ethereum library (modern alternative to ethers.js/web3.js)

### Environment Configuration

Scripts load environment from `../smartaccount.env`:

```env
# RPC Configuration
AMOY_RPC_URL=https://rpc-amoy.polygon.technology/

# Biconomy Configuration
BICONOMY_BUNDLER_URL=https://bundler.biconomy.io/api/v2/80002/...
BICONOMY_PAYMASTER_API_KEY=your_api_key

# Contract Addresses
WELL_TOKEN_ADDRESS=0x2aabe1c44a3122776f84c22eb3e9ebcb881c2651
REDEMPTION_ADDRESS=0x06cd3f30bbd1765415ee5b3c84d34c5eaadca635

# Private Keys (SENSITIVE!)
OWNER_PRIVATE_KEY=0xyour_owner_key_with_minter_role
```

---

## 🔄 Python Backend Integration

### Example: Mint Tokens from FastAPI

```python
# backend/routers/blockchain.py
import subprocess
import json

@router.post("/chain/mint_gasless")
async def mint_gasless(recipient: str, amount: float):
    """Mint WELL tokens via Biconomy (gasless)"""

    # Validate inputs
    if not Web3.is_address(recipient):
        raise HTTPException(400, "Invalid address")

    # Execute Node.js script
    result = subprocess.run(
        ['node', 'aa-test/mint-gasless.js', recipient, str(amount)],
        capture_output=True,
        text=True,
        cwd='/path/to/backend',
        timeout=60  # 60 second timeout
    )

    # Check for errors
    if result.returncode != 0:
        raise HTTPException(500, f"Mint failed: {result.stderr}")

    # Parse JSON output (last line)
    output_lines = result.stdout.strip().split('\n')
    json_output = output_lines[-1]
    data = json.loads(json_output)

    if not data['success']:
        raise HTTPException(500, "Transaction failed")

    return {
        "success": True,
        "transaction_hash": data['transactionHash'],
        "userOpHash": data['userOpHash'],
        "amount": amount,
        "recipient": recipient
    }
```

### Example: Batch Transaction

```python
# Create batch config
batch_config = {
    "smart_account_address": user_smart_account,
    "user_private_key": encrypted_private_key,
    "chain_id": 80002,
    "calls": [
        {"data": f"approve_{redemption_address}_{amount_wei}"},
        {"data": f"redeem_{voucher_id}_{amount_wei}"}
    ]
}

# Save to temp file
config_path = f"/tmp/batch_{user_id}.json"
with open(config_path, 'w') as f:
    json.dump(batch_config, f)

# Execute
subprocess.run(['node', 'aa-test/execute-batch.js', config_path])

# Read result
with open(config_path.replace('.json', '-result.json')) as f:
    result = json.load(f)
```

### Error Handling

```python
try:
    result = subprocess.run(
        ['node', 'aa-test/mint-gasless.js', recipient, str(amount)],
        capture_output=True,
        text=True,
        timeout=60,
        check=True  # Raises CalledProcessError if returncode != 0
    )
except subprocess.TimeoutExpired:
    raise HTTPException(408, "Transaction timeout")
except subprocess.CalledProcessError as e:
    raise HTTPException(500, f"Script error: {e.stderr}")
except json.JSONDecodeError:
    raise HTTPException(500, "Invalid JSON response")
```

---

## 🔐 Security Considerations

### Private Key Management

**❌ NEVER:**
- Commit private keys to git
- Pass private keys via command line arguments (visible in `ps`)
- Log private keys to console

**✅ ALWAYS:**
- Load keys from environment files (`.env`, `smartaccount.env`)
- Encrypt user private keys in database
- Use temporary files for batch configs (delete after use)

### File-based Communication

When passing sensitive data to scripts:

```python
# ✅ GOOD: Use temporary files
import tempfile
import os

with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
    json.dump({"user_private_key": encrypted_key}, f)
    config_path = f.name

try:
    subprocess.run(['node', 'execute-batch.js', config_path])
finally:
    os.unlink(config_path)  # Delete temp file

# ❌ BAD: Pass via command line
subprocess.run(['node', 'script.js', encrypted_key])  # Visible in ps!
```

---

## 🧪 Testing

### Manual Testing

```bash
# Test mint
node mint-gasless.js 0x1234567890123456789012345678901234567890 1.5

# Test batch execution
cat > test-batch.json << EOF
{
  "smart_account_address": "0x...",
  "user_private_key": "0x...",
  "chain_id": 80002,
  "calls": [
    {"data": "approve_0xRedemptionAddress_1000000000000000000"}
  ]
}
EOF

node execute-batch.js test-batch.json

# Test deployment
cat > test-deploy.json << EOF
{
  "smart_account_address": "0x...",
  "user_private_key": "0x...",
  "chain_id": 80002
}
EOF

node deploy-smart-account.js test-deploy.json
```

### Integration Testing from Python

```python
# backend/tests/test_blockchain_scripts.py
import subprocess
import json

def test_mint_gasless():
    """Test mint-gasless.js script"""
    result = subprocess.run(
        ['node', 'aa-test/mint-gasless.js',
         '0xRecipientAddress', '1.0'],
        capture_output=True,
        text=True
    )

    assert result.returncode == 0
    output = json.loads(result.stdout.split('\n')[-1])
    assert output['success'] == True
    assert 'transactionHash' in output
```

---

## 📊 Output Format

All scripts return **JSON on the last line of stdout** for easy parsing:

```json
{
  "success": true,
  "userOpHash": "0x...",
  "transactionHash": "0x...",
  "blockNumber": "12345678",
  "gasUsed": "0",
  "... additional fields ..."
}
```

**Error Format:**
```json
{
  "success": false,
  "error": "Error message",
  "stack": "Error stack trace"
}
```

---

## 🔍 Troubleshooting

### Common Issues

**Issue:** `Cannot find module '@biconomy/account'`
- **Fix:** Run `npm install` to install dependencies

**Issue:** `Missing required environment variables`
- **Fix:** Ensure `smartaccount.env` exists in parent directory

**Issue:** `Transaction reverted`
- **Fix:** Check that owner has MINTER_ROLE on WELL contract

**Issue:** `Address mismatch`
- **Fix:** Smart account was created with different factory. Use derived address.

**Issue:** `Paymaster rejected`
- **Fix:** Check Paymaster API key is valid and has credits

**Issue:** `Insufficient funds for gas`
- **Fix:** Ensure signer account has MATIC (for non-sponsored operations)

### Debugging

Enable verbose logging by adding to scripts:
```javascript
console.log('🐛 Debug:', JSON.stringify(data, null, 2));
```

Check Biconomy SDK logs:
```python
result = subprocess.run(
    ['node', 'aa-test/mint-gasless.js', recipient, amount],
    capture_output=True,
    text=True
)

print("STDOUT:", result.stdout)  # Includes Biconomy logs
print("STDERR:", result.stderr)  # Errors
```

---

## 📚 Additional Resources

- **Biconomy Docs:** https://docs.biconomy.io/
- **Viem Docs:** https://viem.sh/
- **ERC-4337 Spec:** https://eips.ethereum.org/EIPS/eip-4337
- **Polygon Amoy Explorer:** https://amoy.polygonscan.com/

---

## 🤝 Contributing

When adding new scripts:

1. Follow existing naming convention: `action-description.js`
2. Include usage comment at top of file
3. Accept config via command line argument or JSON file
4. Return JSON result on last line of stdout
5. Handle errors gracefully with try/catch
6. Load environment from `../smartaccount.env`
7. Update this README with script documentation

---

**Last Updated:** 2025-10-21
**Maintained by:** UniMate Team
