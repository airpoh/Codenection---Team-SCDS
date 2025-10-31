# UniMate - University Student Wellness Platform

> 🎓 A comprehensive wellness and productivity platform for university students with blockchain-powered rewards

[![Status](https://img.shields.io/badge/status-active-success.svg)]()
[![License](https://img.shields.io/badge/license-MIT-blue.svg)]()

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Development](#development)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [Contributing](#contributing)

## 🎯 Overview

UniMate is a full-stack application that helps university students:
- ✅ Manage tasks, calendar, and reminders with push notifications
- 🎯 Complete daily wellness challenges
- 🏆 Earn blockchain rewards (WELL tokens)
- 🎁 Redeem vouchers using points (gasless transactions)
- 🚨 Access emergency resources and wellness support

**Key Innovation:** Hybrid blockchain architecture using:
- **Biconomy (ERC-4337)** for ALL blockchain operations (gasless transactions)
- **HashiCorp Vault** for secure backend key management (optional)
- **Expo Push Notifications** for real-time task and reminder alerts

## ✨ Features

### 🎓 Student Features
- **Smart Task Management:** Tasks, calendar, reminders with intelligent scheduling
- **Push Notifications:** Real-time alerts for upcoming tasks and reminders
- **Wellness Challenges:** Daily activities that promote physical and mental health
- **Blockchain Rewards:** Earn WELL tokens for completing challenges
- **Gasless Experience:** Zero gas fees for all transactions
- **Voucher Marketplace:** Redeem points for real-world rewards
- **Emergency Support:** Quick access to campus resources and emergency contacts

### 🔐 Technical Features
- **Account Abstraction (ERC-4337):** Biconomy SDK for seamless UX
- **Gasless Transactions:** Biconomy Paymaster sponsors all transactions
- **Hybrid Architecture:** Python FastAPI + Node.js for blockchain operations
- **Push Notification System:** Expo Push Notification service with APScheduler
- **Centralized Auth:** React Context-based authentication state management
- **Secure Backend:** HashiCorp Vault integration (optional)
- **EIP-712 Signatures:** Secure off-chain to on-chain validation
- **Role-Based Access:** OpenZeppelin AccessControl for granular permissions
- **Soulbound Achievements:** Non-transferable ERC-1155 NFTs

## 🏗️ Architecture

### System Overview

UniMate uses a **hybrid Python + Node.js architecture** where Python handles API orchestration and Node.js executes blockchain transactions via Biconomy SDK.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     SMART CONTRACTS (Polygon Amoy)                      │
│  • WELL Token (ERC-20 + ERC20Votes + Pausable + AccessControl)          │
│  • RedemptionSystem (EIP-712 Signatures + Role-Based Access)            │
│  • Achievements (Soulbound ERC-1155)                                    │
└───────────────────────┬─────────────────────────────────────────────────┘
                        │
            ┌───────────▼──────────────────┐
            │   BICONOMY INFRASTRUCTURE    │
            │   (ERC-4337 Account          │
            │    Abstraction)              │
            │   • Bundler (Tx Packaging)   │
            │   • Paymaster (Gas Sponsor)  │
            │   • Smart Accounts (1/user)  │
            └───────────┬──────────────────┘
                        │
    ┌───────────────────┴───────────────────┐
    │                                       │
┌───▼────────┐                    ┌─────────▼─────────┐
│  Node.js   │                    │  FastAPI Backend  │
│  Scripts   │◄──────────────────┤  (Python 3.10+)   │
│ (aa-test/) │   subprocess      │  • API Routes     │
│ • Biconomy │   execution       │  • Auth (Context) │
│ • UserOps  │                   │  • APScheduler    │
│ • Gasless  │                   │  • Push Notifs    │
└────────────┘                   └─────────┬─────────┘
                                           │
    ┌──────────────────────────────────────┴────────────┐
    │                                                    │
┌───▼──────────┐                              ┌─────────▼─────────┐
│  React Native│                              │  Supabase         │
│  Frontend    │◄─────────HTTP API────────────┤  • PostgreSQL DB  │
│  (Expo)      │                              │  • Auth (JWT)     │
│  • AuthCtx   │                              │  • User Data      │
│  • Push Reg  │                              │  • Points Ledger  │
└──────────────┘                              └───────────────────┘
                                                        │
                                               ┌────────▼────────┐
                                               │ Expo Push API   │
                                               │ • Task Reminders│
                                               │ • Notifications │
                                               └─────────────────┘
```

### Architecture Layers

#### 1. **Frontend Layer** (React Native + Expo)
   - **Technology:** React Native 0.81, Expo 54, TypeScript
   - **Key Features:**
     - Native mobile app for iOS and Android
     - React Navigation for seamless navigation
     - **AuthContext** for centralized authentication state
     - **Push Notifications** via Expo for task/reminder alerts
     - Device integrations (camera, image picker, calendar)
   - **Main Screens:**
     - **Island Screen:** Main dashboard
     - **Challenge Screens:** Gym, Run, wellness activities
     - **Calendar & Tasks:** Productivity management with notifications
     - **Lighthouse:** Emergency alerts & wellness check-ins
     - **Rewards Market:** Voucher redemption
     - **Profile:** User settings and medical info

#### 2. **Backend Layer** (FastAPI + Python)
   - **Technology:** FastAPI 0.104+, Python 3.10+, Uvicorn
   - **Key Components:**
     - **Authentication:** Supabase Auth with JWT tokens
     - **API Routers:**
       - `core.py` - Auth, basic user operations
       - `biconomy.py` - Smart account operations (ERC-4337)
       - `blockchain.py` - Blockchain interactions (delegates to Node.js)
       - `tasks.py`, `calendar.py` - Productivity features
       - `challenges.py`, `rewards.py` - Gamification & rewards
       - `lighthouse.py` - Emergency & wellness features
       - `profile.py` - User profiles & medical data
     - **Services:**
       - `biconomy_client.py` - Biconomy SDK integration
       - `supabase_client.py` - Database operations
       - `push_notifications.py` - Expo Push Notification service
       - `notification_scheduler.py` - APScheduler background jobs
       - `vault_service.py` - HashiCorp Vault (optional)
       - `redis_service.py` - Caching (optional)
     - **Push Notification System:**
       - Automatic task reminders (configurable minutes before)
       - Scheduled reminder notifications
       - Background jobs running every minute (APScheduler)
       - Supports iOS and Android via Expo
     - **Security:** HMAC request signing, rate limiting (SlowAPI)

#### 3. **Blockchain Execution Layer** (Node.js + Biconomy SDK)
   - **Location:** `/backend/aa-test/` directory
   - **Key Scripts:**
     - `mint-gasless.js` - Gasless WELL token minting
     - `execute-batch.js` - Batch transactions
     - `deploy-smart-account.js` - Smart account deployment
   - **Function:** Python backend spawns Node.js subprocesses to execute blockchain operations
   - **Why Node.js?** Biconomy SDK has mature JavaScript support for ERC-4337

#### 4. **Database Layer** (Supabase + Redis)
   - **Primary Database:** Supabase (PostgreSQL)
     - User profiles & authentication
     - Tasks, calendar events, reminders
     - Challenge completions & points ledger
     - Voucher inventory & redemptions
     - Push notification tokens (per device)
     - Trusted contacts & medical info
   - **Cache Layer:** Redis (Optional)
     - Rate limiting counters
     - Session management
     - Temporary data storage

#### 5. **Blockchain Layer** (Polygon Amoy Testnet)
   - **Smart Contracts:**
     - **WELL Token** (`0x2AaBE1C44a3122776f84C22eB3E9EBcb881c2651`)
       - ERC-20 with governance (ERC20Votes)
       - Pausable for emergencies
       - Role-based minting (MINTER_ROLE, PAUSER_ROLE, ADMIN_ROLE)
       - 1,000,000 WELL initial supply
     - **RedemptionSystem** (`0x06CD3f30bbD1765415eE5B3C84D34c5eaaDCa635`)
       - Points-to-WELL conversion with EIP-712 signatures
       - Batch reconciliation capability
       - Role-based access (BACKEND_ROLE, ADMIN_ROLE)
       - Nonce-based replay protection
     - **Achievements** (`0xE3cd50cD801aDCe2B50f0e3D707F6D02876E7a92`)
       - Soulbound ERC-1155 tokens (non-transferable)
       - Achievement NFTs for wellness milestones
       - Cannot be sold or transferred

#### 6. **Account Abstraction Layer** (Biconomy ERC-4337)
   - **Bundler:** Biconomy Bundler (Polygon Amoy)
   - **Paymaster:** Biconomy Paymaster (sponsors all gas fees)
   - **Smart Accounts:** One per user, deployed on-demand
   - **User Operations:**
     - Gasless token minting
     - Voucher redemption
     - Token approvals and transfers
     - Batch operations
   - **Key Benefit:** Users never need private keys or gas tokens

#### 7. **Notification Layer** (Expo Push Notifications)
   - **Push Token Management:**
     - Tokens stored per device in Supabase
     - Automatic registration after login
     - Support for multiple devices per user
   - **Notification Types:**
     - **Task Reminders:** Sent N minutes before task starts (configurable)
     - **Reminder Notifications:** One-time and recurring reminders
     - **Points Earned:** Notifications when user earns points
   - **Scheduling:**
     - APScheduler jobs run every minute
     - Checks upcoming tasks and reminders
     - Sends notifications via Expo Push API
   - **Features:**
     - Timezone-aware (Asia/Kuala_Lumpur)
     - Automatic retry logic
     - Error handling and logging
     - Prevents duplicate notifications

#### 8. **Security & Infrastructure Layer**
   - **HashiCorp Vault (Optional):**
     - Secure storage of backend private keys
     - API key management
     - Environment-based activation (`USE_VAULT=true`)
   - **Encryption:**
     - User private keys encrypted at rest (if stored)
     - AES-256 encryption via `utils/crypto.py`
     - Encryption password managed via Vault or env
   - **Request Security:**
     - HMAC signature validation for sensitive endpoints
     - Timestamp-based replay protection
     - Rate limiting via SlowAPI middleware
   - **CORS:** Configured for mobile and web clients

### Data Flow Examples

#### Example 1: User Creates Task with Reminder Notification
```
1. User creates task with reminder (e.g., 30 minutes before)
   → Frontend: POST /tasks/create
   → Includes: title, start_time, end_time, remind_minutes_before

2. Backend stores task in Supabase
   → FastAPI validates and saves task
   → Returns task confirmation

3. APScheduler checks tasks every minute
   → notification_scheduler.py runs background job
   → Calculates reminder time (start_time - remind_minutes_before)

4. When reminder time arrives
   → Fetches user's push tokens from Supabase
   → Calls send_task_reminder() in push_notifications.py
   → Sends notification via Expo Push API

5. User receives notification
   → Notification appears on all user devices
   → Tapping opens TaskDetail screen
   → Zero manual refresh needed
```

#### Example 2: User Logs In → Data Auto-Loads
```
1. User enters credentials
   → Frontend: Calls AuthContext.login()
   → AuthContext validates with backend

2. Backend validates & returns tokens
   → Supabase Auth verifies credentials
   → Returns JWT access token

3. AuthContext stores auth state
   → Saves token to AsyncStorage
   → Sets token in Context state
   → Registers push notification token

4. All screens auto-refresh
   → RewardMarketScreen useEffect detects token change
   → ProfileScreen loads user data
   → CalendarScreen fetches tasks
   → No manual refresh needed - reactive!
```

#### Example 3: User Completes Challenge & Earns WELL Tokens
```
1. User completes wellness challenge
   → Frontend: POST /challenges/{id}/complete

2. Backend validates completion
   → FastAPI: Validates user, checks challenge rules
   → Updates Supabase DB: Marks challenge complete
   → Awards points

3. Backend triggers blockchain reward
   → FastAPI: POST /chain/mint_gasless (internal)
   → Validates HMAC signature, rate limits

4. Node.js executes gasless mint
   → Python spawns subprocess: node aa-test/mint-gasless.js
   → Biconomy SDK creates UserOperation
   → Paymaster sponsors gas fee
   → Bundler submits to blockchain

5. WELL tokens minted to user's smart account
   → Transaction confirmed on-chain
   → Zero gas fees paid by user
   → Push notification sent: "You earned X points!"
   → Frontend displays updated balance
```

### Automated Points Reconciliation ✅

**✅ Points Reconciliation System (IMPLEMENTED):**
- **Daily automatic conversion** of off-chain points → on-chain WELL tokens
- Runs every midnight UTC via APScheduler
- **100% Gasless** using Biconomy Smart Account
- Users keep their cumulative points total (never reset)
- Only **NEW points** reconciled each day
- **Tracking:** `total_points` - `points_reconciled` = `pending_points`

**How it works:**
1. User earns points in Supabase (challenges, tasks, etc.)
2. Midnight: Backend queries pending points (total - reconciled)
3. Calls `batch-reconcile.js` (Biconomy gasless)
4. Smart contract mints WELL tokens to users
5. Updates `points_reconciled` = `total_points`
6. Users see same points in app + WELL tokens in wallet

**See:** [RECONCILIATION_SYSTEM.md](RECONCILIATION_SYSTEM.md) for detailed documentation

**⚠️ OpenZeppelin Defender:**
- Previously planned but **not in use** (`DEFENDER_ENABLED=false`)
- Service discontinued for new users
- All blockchain operations now handled via Biconomy

### Technology Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React Native 0.81, Expo 54, TypeScript | Mobile app (iOS/Android) |
| **Backend API** | FastAPI 0.104+, Python 3.10+, Uvicorn | API orchestration, business logic |
| **Blockchain Execution** | Node.js, Biconomy SDK | ERC-4337 UserOperation execution |
| **Database** | Supabase (PostgreSQL) | User data, tasks, points |
| **Push Notifications** | Expo Push Notification Service | Task/reminder alerts |
| **Scheduling** | APScheduler | Background jobs (notifications, reconciliation) |
| **Cache** | Redis (optional) | Rate limiting, sessions |
| **Blockchain** | Solidity 0.8.24, Foundry, Polygon Amoy | Smart contracts |
| **Account Abstraction** | Biconomy (Bundler + Paymaster) | Gasless transactions |
| **Security** | HashiCorp Vault (optional) | Secret management |
| **Authentication** | Supabase Auth (JWT) + AuthContext | User authentication |

**See:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed architecture

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 18.x
- **Python** >= 3.10
- **Docker** (optional, for Vault)
- **Expo CLI** (`npm install -g expo-cli`)

### One-Command Setup

```bash
# Clone and setup
git clone <repository-url>
cd UniMate
./scripts/setup.sh
```

### Manual Setup

#### 1. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your configuration
uvicorn app:app --reload
```

#### 2. Frontend Setup
```bash
cd frontend
npm install
cp .env.example .env
# Edit .env with backend URL
npm start
```

#### 3. Smart Contracts Setup
```bash
cd contracts
forge install
cp .env.example .env
# Add your private key
forge script script/Deploy.s.sol --broadcast --rpc-url polygon-amoy
```

#### 4. Node.js Blockchain Scripts Setup
```bash
cd backend/aa-test
npm install
# Scripts are called by Python backend via subprocess
```

#### 5. Expo Push Notification Setup
```bash
# Link project to EAS
cd frontend
eas init

# Configure push notifications
# Add your EAS project ID to app.json:
# "extra": { "eas": { "projectId": "your-project-id" } }

# For development builds (required for background notifications):
eas build --profile development --platform android
```

## 📁 Project Structure

```
UniMate/
├── backend/                      # FastAPI backend services
│   ├── routers/                  # API endpoints
│   │   ├── core.py               # Core operations (legacy)
│   │   ├── core_supabase.py      # Supabase auth & core functions
│   │   ├── biconomy.py           # Smart account operations (ERC-4337)
│   │   ├── blockchain.py         # Blockchain interactions (delegates to Node.js)
│   │   ├── challenges.py         # Wellness challenges
│   │   ├── rewards.py            # Rewards & vouchers
│   │   ├── tasks.py              # Task management
│   │   ├── calendar.py           # Calendar operations
│   │   ├── lighthouse.py         # Emergency & wellness features
│   │   └── profile.py            # User profiles & medical info
│   │
│   ├── services/                 # Business logic & integrations
│   │   ├── biconomy_client.py    # Biconomy SDK integration
│   │   ├── supabase_client.py    # Database operations
│   │   ├── push_notifications.py # Expo Push Notification service
│   │   ├── notification_scheduler.py # APScheduler background jobs
│   │   ├── vault_service.py      # HashiCorp Vault (optional)
│   │   └── redis_service.py      # Redis caching (optional)
│   │
│   ├── auth/                     # Authentication modules
│   │   └── supabase_verify.py    # JWT verification
│   │
│   ├── utils/                    # Utility functions
│   │   └── crypto.py             # Encryption/decryption (AES-256)
│   │
│   ├── aa-test/                  # Node.js blockchain scripts (Biconomy SDK)
│   │   ├── mint-gasless.js       # Gasless WELL token minting
│   │   ├── execute-batch.js      # Batch UserOperation execution
│   │   ├── deploy-smart-account.js  # Smart account deployment
│   │   └── package.json          # Node.js dependencies
│   │
│   ├── app.py                    # Main FastAPI application
│   ├── config.py                 # Configuration management
│   ├── models.py                 # Database models
│   ├── requirements.txt          # Python dependencies
│   └── .env.example              # Environment variables template
│
├── frontend/                     # React Native mobile app (Expo)
│   ├── src/
│   │   ├── components/           # Reusable UI components
│   │   │   ├── TaskCard.tsx
│   │   │   ├── LabeledInput.tsx
│   │   │   ├── CustomDatePicker.tsx
│   │   │   └── CustomTimePicker.tsx
│   │   │
│   │   ├── screens/              # App screens
│   │   │   ├── StartupScreen.tsx      # Initial loading
│   │   │   ├── LoginScreen.tsx        # Authentication
│   │   │   ├── SignUpScreen.tsx       # Registration
│   │   │   ├── IslandScreen.tsx       # Main dashboard
│   │   │   ├── ChallengeGymScreen.tsx # Gym challenge
│   │   │   ├── ChallengeRunScreen.tsx # Running challenge
│   │   │   ├── CalendarScreen.tsx     # Calendar view
│   │   │   ├── LighthouseScreen.tsx   # Emergency hub
│   │   │   ├── RewardMarketScreen.tsx # Voucher marketplace
│   │   │   ├── MyRewardsScreen.tsx    # User rewards
│   │   │   ├── ProfileScreen.tsx      # User profile
│   │   │   └── ProfileSettings.tsx    # Settings
│   │   │
│   │   ├── services/             # API client services
│   │   │   ├── api.ts            # API service
│   │   │   └── notificationService.ts # Push notification registration
│   │   │
│   │   ├── contexts/             # React contexts
│   │   │   └── AuthContext.tsx   # Centralized authentication state
│   │   │
│   │   ├── navigation/           # Navigation configuration
│   │   │   └── MainTabs.tsx      # Tab navigation
│   │   │
│   │   ├── theme/                # Theme & styling
│   │   └── types/                # TypeScript type definitions
│   │       └── api.ts
│   │
│   ├── App.tsx                   # Main app component
│   ├── app.json                  # Expo configuration
│   ├── package.json              # Node.js dependencies
│   └── .env.example              # Environment template
│
├── contracts/                    # Solidity smart contracts (Foundry)
│   ├── src/                      # Contract source code
│   │   ├── WELL.sol              # ERC-20 token with governance
│   │   ├── RedemptionSystem.sol  # Points redemption & vouchers
│   │   └── Achievements.sol      # Soulbound ERC-1155 NFTs
│   │
│   ├── script/                   # Deployment scripts
│   │   └── Deploy.s.sol          # Main deployment script
│   │
│   ├── test/                     # Contract unit tests
│   │   ├── WELL.t.sol
│   │   ├── RedemptionSystem.t.sol
│   │   └── Achievements.t.sol
│   │
│   └── foundry.toml              # Foundry configuration
│
└── docs/                         # Documentation
    ├── ARCHITECTURE.md
    ├── API_REFERENCE.md
    ├── DEVELOPMENT.md
    ├── DEPLOYMENT.md
    └── INTEGRATION_GUIDE.md
```

## 🛠️ Development

### Start All Services

```bash
# Development mode - starts all services
./scripts/dev.sh
```

This starts:
- Backend API (http://localhost:8000)
- Frontend (Expo dev server)

### Run Tests

```bash
# Run all tests
./scripts/test.sh

# Or individually:
cd backend && pytest
cd frontend && npm test
cd contracts && forge test
```

### Environment Variables

#### Backend (.env)
```env
# Database
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Biconomy (ERC-4337)
BICONOMY_BUNDLER_URL=https://bundler.biconomy.io/api/v2/80002/...
BICONOMY_PAYMASTER_API_KEY=your_api_key
CHAIN_ID=80002

# Blockchain
AMOY_RPC_URL=https://rpc-amoy.polygon.technology/
WELL_ADDRESS=0x2AaBE1C44a3122776f84C22eB3E9EBcb881c2651
REDEMPTION_SYSTEM_ADDRESS=0x06CD3f30bbD1765415eE5B3C84D34c5eaaDCa635
ACHIEVEMENTS_ADDRESS=0xE3cd50cD801aDCe2B50f0e3D707F6D02876E7a92

# Security (KEEP PRIVATE - DO NOT COMMIT)
PRIVATE_KEY=your_private_key
OWNER_PRIVATE_KEY=your_owner_key
SIGNER_PRIVATE_KEY=your_signer_key

# Vault (Optional)
USE_VAULT=false
VAULT_ADDR=http://127.0.0.1:8200
VAULT_ROLE_ID=your_role_id
VAULT_SECRET_ID=your_secret_id

# Defender (DISABLED - service discontinued)
DEFENDER_ENABLED=false
```

#### Frontend (.env)
```env
# Use your local IP address or deployed backend URL
API_BASE_URL=http://localhost:8000
```

#### Contracts (.env)
```env
# KEEP PRIVATE - DO NOT COMMIT
PRIVATE_KEY=0xyour_private_key
RPC_URL=https://rpc-amoy.polygon.technology/
```

## 🚢 Deployment

### Deployed Contracts (Polygon Amoy Testnet)

```
Chain ID: 80002

WELL Token:         0x2AaBE1C44a3122776f84C22eB3E9EBcb881c2651
RedemptionSystem:   0x06CD3f30bbD1765415eE5B3C84D34c5eaaDCa635
Achievements:       0xE3cd50cD801aDCe2B50f0e3D707F6D02876E7a92
```

### Deploy to Production

```bash
./scripts/deploy.sh production
```

**⚠️ Important Security Notes:**
- Never commit private keys to version control
- Use environment variables or HashiCorp Vault for secrets
- Rotate keys regularly in production
- Use hardware wallets for high-value accounts

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed deployment instructions.

## 📚 Documentation

- **[Architecture Guide](docs/ARCHITECTURE.md)** - System design and integration
- **[API Reference](docs/API_REFERENCE.md)** - Backend API endpoints
- **[Development Guide](docs/DEVELOPMENT.md)** - Local development setup
- **[Deployment Guide](docs/DEPLOYMENT.md)** - Production deployment
- **[Integration Guide](docs/INTEGRATION_GUIDE.md)** - Biconomy integration

### Recent Updates
- ✅ **Push Notification System** - Real-time task and reminder notifications
- ✅ **AuthContext Migration** - Centralized authentication state management
- ✅ **Calendar Auto-Refresh** - Tasks automatically hide when completed
- ✅ **Profile Integration** - Real-time points and challenge sync

## 🧪 Testing

### Unit Tests
```bash
# Backend
cd backend && pytest tests/unit/

# Contracts
cd contracts && forge test
```

### Integration Tests
```bash
cd backend && pytest tests/integration/
```

### E2E Tests
```bash
cd frontend && npm run test:e2e
```

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines first.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

**Note:** Please ensure no sensitive information (private keys, personal data, IP addresses) is included in commits.

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **Biconomy** for Account Abstraction infrastructure
- **Expo** for mobile development framework and push notifications
- **OpenZeppelin** for smart contract libraries
- **Polygon** for the Amoy testnet
- **Supabase** for database and authentication

---

**Built with ❤️ by the UniMate Team**

For questions or support, please open an issue or contact the maintainers.
