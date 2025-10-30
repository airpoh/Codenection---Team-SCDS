#!/bin/bash
# Store secrets in HashiCorp Vault
# This script helps you migrate secrets from environment variables to Vault

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}UniMate Vault Secret Storage${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if VAULT_ADDR is set
if [ -z "$VAULT_ADDR" ]; then
    echo -e "${RED}Error: VAULT_ADDR environment variable is not set${NC}"
    exit 1
fi

# Check if vault CLI is installed
if ! command -v vault &> /dev/null; then
    echo -e "${RED}Error: vault CLI is not installed${NC}"
    exit 1
fi

# Function to securely read input
read_secret() {
    local prompt="$1"
    local var_name="$2"
    local env_default="$3"

    # Check if value exists in environment
    local env_value="${!env_default}"

    if [ -n "$env_value" ]; then
        echo -e "${BLUE}Found existing value for $var_name in environment${NC}"
        read -p "Use existing value? (y/n): " use_existing
        if [ "$use_existing" = "y" ]; then
            echo "$env_value"
            return
        fi
    fi

    # Read new value
    read -sp "$prompt: " secret
    echo ""
    echo "$secret"
}

echo -e "${YELLOW}This script will help you store secrets in Vault.${NC}"
echo -e "${YELLOW}You can either:${NC}"
echo -e "${YELLOW}1. Use values from your current environment variables${NC}"
echo -e "${YELLOW}2. Enter new values manually${NC}"
echo ""
read -p "Press Enter to continue..."
echo ""

# Load .env if it exists
if [ -f ".env" ]; then
    echo -e "${BLUE}Loading environment variables from .env...${NC}"
    set -a
    source .env
    set +a
    echo -e "${GREEN}✓ Loaded .env${NC}"
    echo ""
fi

# Collect blockchain secrets
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Blockchain Private Keys${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

PRIVATE_KEY=$(read_secret "Enter PRIVATE_KEY (blockchain private key)" "PRIVATE_KEY" "PRIVATE_KEY")
OWNER_PRIVATE_KEY=$(read_secret "Enter OWNER_PRIVATE_KEY" "OWNER_PRIVATE_KEY" "OWNER_PRIVATE_KEY")
SIGNER_PRIVATE_KEY=$(read_secret "Enter SIGNER_PRIVATE_KEY" "SIGNER_PRIVATE_KEY" "SIGNER_PRIVATE_KEY")

# Store blockchain secrets
echo ""
echo -e "${YELLOW}Storing blockchain secrets in Vault...${NC}"
vault kv put secret/backend/blockchain \
    private_key="$PRIVATE_KEY" \
    owner_private_key="$OWNER_PRIVATE_KEY" \
    signer_private_key="$SIGNER_PRIVATE_KEY"
echo -e "${GREEN}✓ Stored blockchain secrets${NC}"
echo ""

# Collect encryption password
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Encryption Master Password${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

ENCRYPTION_PASSWORD=$(read_secret "Enter PRIVATE_KEY_ENCRYPTION_PASSWORD" "ENCRYPTION_PASSWORD" "PRIVATE_KEY_ENCRYPTION_PASSWORD")

# Store encryption password
echo ""
echo -e "${YELLOW}Storing encryption password in Vault...${NC}"
vault kv put secret/backend/encryption \
    master_password="$ENCRYPTION_PASSWORD"
echo -e "${GREEN}✓ Stored encryption password${NC}"
echo ""

# Verify storage
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Verification${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

echo -e "${YELLOW}Verifying stored secrets...${NC}"

# Test reading blockchain secrets
if vault kv get secret/backend/blockchain > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Blockchain secrets verified${NC}"
else
    echo -e "${RED}✗ Failed to verify blockchain secrets${NC}"
    exit 1
fi

# Test reading encryption password
if vault kv get secret/backend/encryption > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Encryption password verified${NC}"
else
    echo -e "${RED}✗ Failed to verify encryption password${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Success!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}All secrets have been stored in Vault.${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Set USE_VAULT=true in your .env file"
echo "2. Remove plaintext secrets from .env (PRIVATE_KEY, OWNER_PRIVATE_KEY, etc.)"
echo "3. Keep only Vault connection variables (VAULT_ADDR, VAULT_ROLE_ID, VAULT_SECRET_ID)"
echo "4. Restart your application"
echo ""
echo -e "${GREEN}Vault integration complete!${NC}"
