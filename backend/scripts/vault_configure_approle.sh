#!/bin/bash
# Configure Vault AppRole for Production with Short-Lived Secret_ID
# Run this ONCE during production Vault setup

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Vault AppRole Production Configuration${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if VAULT_ADDR and VAULT_TOKEN are set
if [ -z "$VAULT_ADDR" ]; then
    echo -e "${RED}Error: VAULT_ADDR environment variable is not set${NC}"
    exit 1
fi

if [ -z "$VAULT_TOKEN" ]; then
    echo -e "${RED}Error: VAULT_TOKEN environment variable is not set${NC}"
    exit 1
fi

# Check if vault CLI is installed
if ! command -v vault &> /dev/null; then
    echo -e "${RED}Error: vault CLI is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Environment verified${NC}"
echo ""

# Create AppRole with PRODUCTION-HARDENED settings
echo -e "${YELLOW}Configuring AppRole with production security settings...${NC}"

vault write auth/approle/role/unimate-backend \
    token_ttl=1h \
    token_max_ttl=4h \
    token_policies="unimate-backend" \
    secret_id_ttl=5m \
    secret_id_num_uses=1 \
    bind_secret_id=true

echo -e "${GREEN}✓ AppRole configured with:${NC}"
echo "  - Token TTL: 1 hour"
echo "  - Token Max TTL: 4 hours"
echo "  - Secret ID TTL: 5 minutes (short-lived!)"
echo "  - Secret ID Uses: 1 (single-use!)"
echo "  - Policy: unimate-backend"
echo ""

# Get role-id (this is not secret, can be committed to config)
ROLE_ID=$(vault read -field=role_id auth/approle/role/unimate-backend/role-id)

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Configuration Complete${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}VAULT_ROLE_ID (can be in config):${NC}"
echo "$ROLE_ID"
echo ""
echo -e "${YELLOW}Important:${NC}"
echo "1. Store VAULT_ROLE_ID in your deployment configuration"
echo "2. DO NOT store secret_id - it will be generated at startup"
echo "3. Ensure your deployment pipeline has a Vault token with permission to generate secret_ids"
echo "4. Use production_start.sh to start the application"
echo ""
echo -e "${GREEN}Production security enhanced!${NC}"
