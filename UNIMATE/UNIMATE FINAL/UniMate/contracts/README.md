# UniMate Smart Contracts

Solidity smart contracts for the UniMate blockchain rewards system, built with Foundry.

## Contracts

### WELL Token (ERC-20)
Wellness token for rewarding student activities.

- **Standard:** ERC-20 with OpenZeppelin extensions
- **Features:** Pausable, AccessControl, Burnable
- **Deployed:** `0x2AaBE1C44a3122776f84C22eB3E9EBcb881c2651` (Polygon Amoy)

### RedemptionSystem
Manages voucher redemption and point-to-token conversion.

- **Features:** EIP-712 signatures, Point-based redemption, Batch reconciliation
- **Deployed:** `0x06CD3f30bbD1765415eE5B3C84D34c5eaaDCa635` (Polygon Amoy)

### Achievements
Tracks user achievements and badges.

- **Deployed:** `0xE3cd50cD801aDCe2B50f0e3D707F6D02876E7a92` (Polygon Amoy)

## Setup

### Install Dependencies

```shell
forge install
```

### Configure Environment

```shell
cp .env.example .env
# Edit .env with your PRIVATE_KEY and RPC_URL
```

## Development

### Build

```shell
forge build
```

### Test

```shell
# All tests
forge test

# With gas report
forge test --gas-report

# With verbosity (-vvv shows stack traces)
forge test -vvv

# Specific test
forge test --match-test testMint
```

### Code Coverage

```shell
forge coverage
```

### Format Code

```shell
forge fmt
```

### Gas Snapshots

```shell
forge snapshot
```

## Deployment

### Deploy to Polygon Amoy

```shell
forge script script/Deploy.s.sol \
  --rpc-url polygon-amoy \
  --broadcast \
  --verify
```

### Deploy to Local Network

```shell
# Terminal 1: Start local node
anvil

# Terminal 2: Deploy
forge script script/Deploy.s.sol \
  --rpc-url http://localhost:8545 \
  --broadcast
```

## Contract Interaction

### Using Cast

```shell
# Get WELL balance
cast call $WELL_ADDRESS \
  "balanceOf(address)(uint256)" \
  $USER_ADDRESS \
  --rpc-url $RPC_URL

# Mint tokens (as MINTER_ROLE)
cast send $WELL_ADDRESS \
  "mint(address,uint256)" \
  $RECIPIENT 1000000000000000000 \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC_URL
```

## Deployed Addresses (Polygon Amoy)

```
Chain ID: 80002
RPC: https://rpc-amoy.polygon.technology/

WELL Token:       0x2AaBE1C44a3122776f84C22eB3E9EBcb881c2651
RedemptionSystem: 0x06CD3f30bbD1765415eE5B3C84D34c5eaaDCa635
Achievements:     0xE3cd50cD801aDCe2B50f0e3D707F6D02876E7a92

Admin/Relayer:    0x76d8CfF46209a8969389c3ff4d48ec36cc47241C
```

## Resources

- **Foundry Book:** https://book.getfoundry.sh/
- **OpenZeppelin Contracts:** https://docs.openzeppelin.com/contracts/
- **Solidity Docs:** https://docs.soliditylang.org/

## Help

```shell
forge --help
anvil --help
cast --help
```
