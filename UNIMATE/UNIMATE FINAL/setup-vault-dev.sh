#!/bin/bash
# HashiCorp Vault Setup Script for UniMate Backend (Development Mode)
# This script sets up a development Vault server and configures secrets for blockchain integration

set -e

echo "🔐 Setting up HashiCorp Vault for UniMate Backend (Development Mode)"
echo "=================================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
VAULT_ADDR="http://127.0.0.1:8200"
VAULT_DATA_DIR="./vault-data"
VAULT_CONFIG_FILE="./vault-config.hcl"

# Check if Vault is already running
if pgrep -x "vault" > /dev/null; then
    echo -e "${YELLOW}⚠️  Vault server is already running${NC}"
    echo "   Stopping existing Vault server..."
    pkill -9 vault || true
    sleep 2
fi

# Create Vault data directory
mkdir -p "$VAULT_DATA_DIR"

# Create Vault configuration file for development
cat > "$VAULT_CONFIG_FILE" << 'EOF'
storage "file" {
  path = "./vault-data"
}

listener "tcp" {
  address     = "127.0.0.1:8200"
  tls_disable = 1
}

api_addr = "http://127.0.0.1:8200"
ui = true
EOF

echo -e "${GREEN}✅ Created Vault configuration file${NC}"
echo ""

# Start Vault server in dev mode (simpler for development)
echo "🚀 Starting Vault server in development mode..."
echo "   Server will run on: http://127.0.0.1:8200"
echo ""

# Start Vault in background
vault server -dev > vault-server.log 2>&1 &
VAULT_PID=$!

# Wait for Vault to start
sleep 3

# Check if Vault started successfully
if ! ps -p $VAULT_PID > /dev/null; then
    echo -e "${RED}❌ Failed to start Vault server${NC}"
    echo "   Check vault-server.log for details"
    exit 1
fi

# Get the root token from the log
VAULT_ROOT_TOKEN=$(grep "Root Token:" vault-server.log | awk '{print $3}')

if [ -z "$VAULT_ROOT_TOKEN" ]; then
    echo -e "${RED}❌ Failed to get Vault root token${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Vault server started successfully${NC}"
echo "   PID: $VAULT_PID"
echo "   Root Token: $VAULT_ROOT_TOKEN"
echo ""

# Export Vault address and token for this session
export VAULT_ADDR="http://127.0.0.1:8200"
export VAULT_TOKEN="$VAULT_ROOT_TOKEN"

# Enable AppRole auth method
echo "🔑 Enabling AppRole authentication..."
vault auth enable approle || true

# Create policy for backend application
echo "📜 Creating Vault policy for backend..."
vault policy write unimate-backend - <<EOF
path "secret/data/backend/*" {
  capabilities = ["read", "list"]
}

path "secret/metadata/backend/*" {
  capabilities = ["list"]
}
EOF

# Create AppRole for backend
echo "🎭 Creating AppRole for backend application..."
vault write auth/approle/role/unimate-backend \
    token_policies="unimate-backend" \
    secret_id_ttl=0 \
    token_ttl=24h \
    token_max_ttl=48h

# Get Role ID and Secret ID
ROLE_ID=$(vault read -field=role_id auth/approle/role/unimate-backend/role-id)
SECRET_ID=$(vault write -field=secret_id -f auth/approle/role/unimate-backend/secret-id)

echo -e "${GREEN}✅ AppRole created successfully${NC}"
echo "   Role ID: $ROLE_ID"
echo "   Secret ID: $SECRET_ID"
echo ""

# Generate unique private keys for production
echo "🔐 Generating unique private keys for each role..."

# Generate using Python (Web3 is already installed)
cat > /tmp/generate_keys.py << 'PYTHON'
from eth_account import Account
import secrets

def generate_key():
    priv = secrets.token_hex(32)
    account = Account.from_key(priv)
    return priv, account.address

owner_pk, owner_addr = generate_key()
signer_pk, signer_addr = generate_key()
minter_pk, minter_addr = generate_key()

print(f"OWNER_PK={owner_pk}")
print(f"OWNER_ADDR={owner_addr}")
print(f"SIGNER_PK={signer_pk}")
print(f"SIGNER_ADDR={signer_addr}")
print(f"MINTER_PK={minter_pk}")
print(f"MINTER_ADDR={minter_addr}")
PYTHON

# Generate keys using the backend's Python environment
KEYS_OUTPUT=$(cd UniMate/backend && ./venv/bin/python /tmp/generate_keys.py)

# Parse the keys
OWNER_PRIVATE_KEY=$(echo "$KEYS_OUTPUT" | grep "OWNER_PK=" | cut -d'=' -f2)
OWNER_ADDRESS=$(echo "$KEYS_OUTPUT" | grep "OWNER_ADDR=" | cut -d'=' -f2)
SIGNER_PRIVATE_KEY=$(echo "$KEYS_OUTPUT" | grep "SIGNER_PK=" | cut -d'=' -f2)
SIGNER_ADDRESS=$(echo "$KEYS_OUTPUT" | grep "SIGNER_ADDR=" | cut -d'=' -f2)
MINTER_PRIVATE_KEY=$(echo "$KEYS_OUTPUT" | grep "MINTER_PK=" | cut -d'=' -f2)
MINTER_ADDRESS=$(echo "$KEYS_OUTPUT" | grep "MINTER_ADDR=" | cut -d'=' -f2)

echo -e "${GREEN}✅ Generated unique private keys:${NC}"
echo "   Owner Address: $OWNER_ADDRESS"
echo "   Signer Address: $SIGNER_ADDRESS"
echo "   Minter Address: $MINTER_ADDRESS"
echo ""

# Generate strong API secret
API_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))")

# Generate encryption password
ENCRYPTION_PASSWORD=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))")

# Store blockchain secrets in Vault
echo "💾 Storing secrets in Vault..."
vault kv put secret/backend/blockchain \
    private_key="$OWNER_PRIVATE_KEY" \
    owner_private_key="$OWNER_PRIVATE_KEY" \
    signer_private_key="$SIGNER_PRIVATE_KEY"

vault kv put secret/backend/encryption \
    master_password="$ENCRYPTION_PASSWORD"

vault kv put secret/backend/api \
    api_secret="$API_SECRET"

echo -e "${GREEN}✅ Secrets stored in Vault${NC}"
echo ""

# Create .env.vault file for production use
cat > UniMate/backend/.env.vault << EOF
# HashiCorp Vault Configuration for Production
# Copy these values to your production .env file

# Vault Configuration
USE_VAULT=true
VAULT_ADDR=http://127.0.0.1:8200
VAULT_ROLE_ID=$ROLE_ID
VAULT_SECRET_ID=$SECRET_ID
VAULT_NAMESPACE=

# New Wallet Addresses (fund these addresses on Polygon Amoy testnet)
OWNER_ADDRESS=$OWNER_ADDRESS
SIGNER_ADDRESS=$SIGNER_ADDRESS
MINTER_ADDRESS=$MINTER_ADDRESS

# API Configuration
API_SECRET=$API_SECRET

# IMPORTANT: DO NOT commit this file to version control!
# Add .env.vault to .gitignore
EOF

echo -e "${GREEN}✅ Created .env.vault configuration file${NC}"
echo ""

# Save Vault credentials for reference
cat > vault-credentials.txt << EOF
HashiCorp Vault Development Credentials
========================================

Vault Address: $VAULT_ADDR
Root Token: $VAULT_ROOT_TOKEN

AppRole Authentication:
-----------------------
Role ID: $ROLE_ID
Secret ID: $SECRET_ID

Generated Wallet Addresses:
---------------------------
Owner Address: $OWNER_ADDRESS
Signer Address: $SIGNER_ADDRESS
Minter Address: $MINTER_ADDRESS

⚠️  IMPORTANT SECURITY NOTES:
1. Fund these new addresses on Polygon Amoy testnet
2. These are NEW addresses - do not reuse old private keys
3. For production, run Vault on a secure server with TLS enabled
4. Store these credentials securely (do NOT commit to git)
5. Add vault-credentials.txt to .gitignore

Next Steps:
-----------
1. Fund the new addresses on Polygon Amoy testnet
2. Test Vault integration: USE_VAULT=true in .env
3. Verify blockchain services work with new keys
4. Update contract ownership if needed
EOF

echo -e "${GREEN}🎉 Vault setup complete!${NC}"
echo ""
echo "📋 Summary:"
echo "   ✅ Vault server running on http://127.0.0.1:8200"
echo "   ✅ AppRole authentication configured"
echo "   ✅ Unique private keys generated for each role"
echo "   ✅ Secrets stored in Vault"
echo "   ✅ Configuration saved to:"
echo "      - UniMate/backend/.env.vault (Vault configuration)"
echo "      - vault-credentials.txt (credentials backup)"
echo ""
echo -e "${YELLOW}⚠️  Action Required:${NC}"
echo "   1. Fund these addresses on Polygon Amoy testnet:"
echo "      Owner: $OWNER_ADDRESS"
echo "      Signer: $SIGNER_ADDRESS"
echo "      Minter: $MINTER_ADDRESS"
echo ""
echo "   2. Test Vault integration:"
echo "      cd UniMate/backend"
echo "      USE_VAULT=true ./venv/bin/uvicorn app:app --reload"
echo ""
echo "   3. Stop Vault server when done:"
echo "      kill $VAULT_PID"
echo ""
echo -e "${GREEN}📝 Vault server PID saved to: vault-pid.txt${NC}"
echo "$VAULT_PID" > vault-pid.txt
