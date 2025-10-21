#!/bin/bash
# Production Startup Script with Short-Lived Vault Secret_ID
# This script implements Gemini's recommendation for secure AppRole credential handling

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}UniMate Production Startup${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Verify required environment variables
REQUIRED_VARS=(
    "VAULT_ADDR"
    "VAULT_ROLE_ID"
    "VAULT_TOKEN"  # Root/admin token for generating secret_id
)

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo -e "${RED}Error: $var environment variable is not set${NC}"
        exit 1
    fi
done

echo -e "${GREEN}✓ Required environment variables verified${NC}"
echo ""

# Check if vault CLI is installed
if ! command -v vault &> /dev/null; then
    echo -e "${RED}Error: vault CLI is not installed${NC}"
    echo "Install it from: https://www.vaultproject.io/downloads"
    exit 1
fi

echo -e "${GREEN}✓ Vault CLI found${NC}"
echo ""

# Generate short-lived secret_id
echo -e "${YELLOW}Generating short-lived secret_id...${NC}"

# Export VAULT_TOKEN for vault CLI
export VAULT_TOKEN

# Generate secret_id with:
# - TTL: 5 minutes (enough time to start the app)
# - Num uses: 1 (can only be used once)
SECRET_ID=$(vault write -f -field=secret_id auth/approle/role/unimate-backend/secret-id \
    ttl=5m \
    num_uses=1 2>&1)

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to generate secret_id${NC}"
    echo -e "${RED}$SECRET_ID${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Generated short-lived secret_id (TTL: 5m, Uses: 1)${NC}"
echo ""

# Unset VAULT_TOKEN for security (app should not have root token)
unset VAULT_TOKEN

# Set production environment
export ENV=production
export USE_VAULT=true
export VAULT_SECRET_ID=$SECRET_ID

echo -e "${YELLOW}Environment Configuration:${NC}"
echo "  ENV=production"
echo "  USE_VAULT=true"
echo "  VAULT_ADDR=$VAULT_ADDR"
echo "  VAULT_ROLE_ID=$VAULT_ROLE_ID"
echo "  VAULT_SECRET_ID=<short-lived>"
echo ""

# Start the application
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Starting UniMate Backend...${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Use exec to replace shell process with uvicorn
# This ensures signals (SIGTERM, etc.) are properly handled
exec uvicorn main:app \
    --host 0.0.0.0 \
    --port "${PORT:-8000}" \
    --workers "${WORKERS:-4}" \
    --log-level info \
    --no-access-log \
    --proxy-headers \
    --forwarded-allow-ips='*'
