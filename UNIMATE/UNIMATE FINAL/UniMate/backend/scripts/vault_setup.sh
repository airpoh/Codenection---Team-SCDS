#!/bin/bash
# HashiCorp Vault Setup Script for UniMate Backend
# This script sets up Vault with all necessary secrets for the application

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}UniMate Vault Setup Script${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if VAULT_ADDR is set
if [ -z "$VAULT_ADDR" ]; then
    echo -e "${RED}Error: VAULT_ADDR environment variable is not set${NC}"
    echo "Please set it to your Vault server address (e.g., http://localhost:8200)"
    exit 1
fi

# Check if vault CLI is installed
if ! command -v vault &> /dev/null; then
    echo -e "${RED}Error: vault CLI is not installed${NC}"
    echo "Install it from: https://www.vaultproject.io/downloads"
    exit 1
fi

# Check if we can connect to Vault
echo -e "${YELLOW}Checking Vault connectivity...${NC}"
if ! vault status &> /dev/null; then
    echo -e "${RED}Error: Cannot connect to Vault at $VAULT_ADDR${NC}"
    echo "Please ensure Vault is running and VAULT_ADDR is correct"
    exit 1
fi

echo -e "${GREEN}✓ Connected to Vault at $VAULT_ADDR${NC}"
echo ""

# Enable KV secrets engine v2 if not already enabled
echo -e "${YELLOW}Setting up KV secrets engine...${NC}"
if ! vault secrets list | grep -q "^secret/"; then
    vault secrets enable -path=secret kv-v2
    echo -e "${GREEN}✓ Enabled KV v2 secrets engine at 'secret/'${NC}"
else
    echo -e "${GREEN}✓ KV v2 secrets engine already enabled${NC}"
fi
echo ""

# Enable AppRole auth method if not already enabled
echo -e "${YELLOW}Setting up AppRole authentication...${NC}"
if ! vault auth list | grep -q "^approle/"; then
    vault auth enable approle
    echo -e "${GREEN}✓ Enabled AppRole authentication${NC}"
else
    echo -e "${GREEN}✓ AppRole authentication already enabled${NC}"
fi
echo ""

# Create policy for backend service
echo -e "${YELLOW}Creating Vault policy for backend service...${NC}"
vault policy write unimate-backend - <<EOF
# Read blockchain secrets
path "secret/data/backend/blockchain" {
  capabilities = ["read"]
}

# Read encryption secrets
path "secret/data/backend/encryption" {
  capabilities = ["read"]
}

# Allow token renewal
path "auth/token/renew-self" {
  capabilities = ["update"]
}

# Allow looking up own token
path "auth/token/lookup-self" {
  capabilities = ["read"]
}
EOF
echo -e "${GREEN}✓ Created 'unimate-backend' policy${NC}"
echo ""

# Create AppRole
echo -e "${YELLOW}Creating AppRole for backend service...${NC}"
vault write auth/approle/role/unimate-backend \
    token_ttl=1h \
    token_max_ttl=4h \
    secret_id_ttl=0 \
    policies="unimate-backend"
echo -e "${GREEN}✓ Created AppRole 'unimate-backend'${NC}"
echo ""

# Get role-id and secret-id
echo -e "${YELLOW}Generating AppRole credentials...${NC}"
ROLE_ID=$(vault read -field=role_id auth/approle/role/unimate-backend/role-id)
SECRET_ID=$(vault write -f -field=secret_id auth/approle/role/unimate-backend/secret-id)

echo -e "${GREEN}✓ Generated AppRole credentials${NC}"
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}AppRole Credentials (SAVE THESE SECURELY)${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}VAULT_ROLE_ID=${NC}$ROLE_ID"
echo -e "${YELLOW}VAULT_SECRET_ID=${NC}$SECRET_ID"
echo ""
echo -e "${YELLOW}Add these to your .env file:${NC}"
echo ""
cat <<EOF
USE_VAULT=true
VAULT_ADDR=$VAULT_ADDR
VAULT_ROLE_ID=$ROLE_ID
VAULT_SECRET_ID=$SECRET_ID
EOF
echo ""

# Prompt for secret storage
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Secret Storage${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Now you need to store your secrets in Vault."
echo "Run the following script to store secrets:"
echo ""
echo -e "${YELLOW}./scripts/vault_store_secrets.sh${NC}"
echo ""
echo -e "${GREEN}Setup complete!${NC}"
