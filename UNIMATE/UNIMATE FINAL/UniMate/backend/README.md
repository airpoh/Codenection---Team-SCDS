# UniMate Backend

FastAPI-based backend service for UniMate platform.

## Features

- **Authentication:** Supabase Auth integration
- **Blockchain Integration:** Biconomy SDK + OpenZeppelin Relayer
- **Task Management:** CRUD operations for tasks, calendar, reminders
- **Rewards System:** Points, challenges, voucher redemption
- **Smart Accounts:** Gasless transaction support via Biconomy
- **Backend Operations:** Secure blockchain operations via Defender Relayer

## Tech Stack

- **Framework:** FastAPI 0.104+
- **Database:** Supabase (PostgreSQL)
- **Blockchain:** Web3.py, eth-abi
- **Authentication:** Supabase Auth
- **Async:** asyncio, httpx
- **Scheduling:** APScheduler

## Directory Structure

```
backend/
├── app.py                 # Main FastAPI application
├── config.py              # Configuration management
├── models.py              # Database models
├── requirements.txt       # Python dependencies
│
├── routers/               # API endpoints
│   ├── core.py           # Auth, tasks, calendar
│   ├── biconomy.py       # Smart account operations
│   ├── blockchain.py     # Blockchain interactions
│   ├── relayer.py        # Backend operations via Relayer
│   ├── tasks.py          # Task management
│   ├── profile.py        # User profiles
│   ├── lighthouse.py     # Emergency features
│   ├── rewards.py        # Rewards and vouchers
│   ├── challenges.py     # Daily challenges
│   └── calendar.py       # Calendar management
│
├── services/              # Business logic
│   ├── biconomy_client.py          # Biconomy SDK wrapper
│   ├── defender_relayer_client.py  # Relayer API client
│   ├── supabase_client.py          # Database client
│   └── blockchain_service.py       # Blockchain utilities
│
├── utils/                 # Utility functions
│   ├── crypto.py         # Encryption/decryption
│   └── validators.py     # Input validation
│
├── cron/                  # Scheduled jobs
│   └── daily_reconciliation.py  # Point reconciliation
│
└── tests/                 # Test suite
    ├── unit/
    ├── integration/
    └── conftest.py
```

## Setup

### 1. Install Dependencies

```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Biconomy Configuration
BICONOMY_BUNDLER_URL=https://bundler.biconomy.io/api/v2/80002/bundler_xxx
BICONOMY_PAYMASTER_API_KEY=your_paymaster_api_key
CHAIN_ID=80002

# Smart Contract Addresses (Polygon Amoy)
WELL_ADDRESS=0x2AaBE1C44a3122776f84C22eB3E9EBcb881c2651
REDEMPTION_SYSTEM_ADDRESS=0x06CD3f30bbD1765415eE5B3C84D34c5eaaDCa635
ACHIEVEMENTS_ADDRESS=0xE3cd50cD801aDCe2B50f0e3D707F6D02876E7a92

# Relayer Configuration
RELAYER_API_URL=http://localhost:8080
RELAYER_API_KEY=your_relayer_api_key
WEBHOOK_SIGNING_KEY=your_webhook_signing_key

# Security
ENCRYPTION_KEY=your-32-byte-encryption-key  # For private key encryption
JWT_SECRET=your-jwt-secret

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://192.168.1.39:8000
```

### 3. Initialize Database

```bash
python -c "from models import init_database; init_database()"
```

### 4. Run Development Server

```bash
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

Server runs at: http://localhost:8000

## API Endpoints

### Core & Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/sign-up` | Register new user |
| POST | `/auth/login` | Login with email/password |
| POST | `/auth/refresh` | Refresh access token |
| GET | `/auth/verify` | Verify current token |

### Smart Accounts (Biconomy)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/biconomy/smart-account/create` | Create smart account |
| POST | `/biconomy/smart-account/address` | Get smart account address |
| POST | `/biconomy/smart-account/execute` | Execute transaction |
| POST | `/biconomy/smart-account/execute-batch` | Execute batch transactions |
| POST | `/biconomy/smart-account/redeem-with-points` | Redeem voucher with points (gasless) |
| POST | `/biconomy/smart-account/batch-claim` | Batch claim rewards (gasless) |
| GET | `/biconomy/smart-account/well-balance` | Get WELL token balance |
| GET | `/biconomy/smart-account/points-to-well` | Convert points to WELL preview |

### Backend Operations (Relayer)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/relayer/backend-ops/reconcile-points` | Reconcile pending points |
| POST | `/relayer/backend-ops/pause-contract` | Emergency pause contract |
| POST | `/relayer/backend-ops/unpause-contract` | Unpause contract |
| GET | `/relayer/backend-ops/transaction/{id}` | Get transaction status |
| POST | `/relayer/backend-ops/trigger-reconciliation` | Manual reconciliation trigger |
| POST | `/relayer/webhook` | Receive Relayer webhooks |

### Tasks & Calendar

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tasks` | Get user tasks |
| POST | `/tasks` | Create task |
| PUT | `/tasks/{id}` | Update task |
| DELETE | `/tasks/{id}` | Delete task |
| GET | `/calendar/events` | Get calendar events |

### Rewards & Challenges

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/challenges/daily` | Get daily challenges |
| POST | `/challenges/{id}/complete` | Mark challenge complete |
| GET | `/rewards/vouchers` | Get available vouchers |
| GET | `/rewards/points` | Get user points balance |

**Full API documentation:** http://localhost:8000/docs (FastAPI Swagger UI)

## Development

### Running Tests

```bash
# All tests
pytest

# Unit tests only
pytest tests/unit/

# Integration tests
pytest tests/integration/

# With coverage
pytest --cov=. --cov-report=html
```

### Code Quality

```bash
# Format code
black .

# Lint
flake8 .
pylint routers/ services/ utils/

# Type checking
mypy .
```

### Database Migrations

```bash
# Generate migration
alembic revision --autogenerate -m "Description"

# Apply migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

## Scheduled Jobs

### Daily Reconciliation (00:00 UTC)

Automatically reconciles pending points to blockchain:

```python
# Configured in app.py
scheduler.add_job(
    daily_reconciliation_job,
    CronTrigger(hour=0, minute=0, timezone='UTC'),
    id='daily_reconciliation'
)
```

**Manual trigger:**
```bash
curl -X POST http://localhost:8000/relayer/backend-ops/trigger-reconciliation \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## Security

### Private Key Management

- User private keys stored **encrypted** in database
- Encryption key stored in environment variable
- Keys decrypted only server-side when needed
- Never sent to frontend

### API Authentication

- JWT tokens from Supabase Auth
- Required for all authenticated endpoints
- Include in header: `Authorization: Bearer <token>`

### Webhook Validation

- Relayer webhooks validated with HMAC signature
- Signing key configured in `.env`
- Invalid signatures rejected with 401

## Monitoring

### Health Checks

```bash
# Main API health
curl http://localhost:8000/

# Relayer health
curl http://localhost:8000/relayer/health

# Biconomy health
curl http://localhost:8000/biconomy/health
```

### Logs

```bash
# View logs
tail -f logs/app.log

# Filter errors
grep ERROR logs/app.log

# Filter by module
grep "relayer" logs/app.log
```

## Troubleshooting

### Common Issues

**Issue:** `ModuleNotFoundError: No module named 'fastapi'`
```bash
# Ensure virtual environment is activated
source venv/bin/activate
pip install -r requirements.txt
```

**Issue:** `Connection refused to Supabase`
```bash
# Check environment variables
echo $SUPABASE_URL
# Verify network connectivity
curl https://your-project.supabase.co/rest/v1/
```

**Issue:** `Relayer health check failed`
```bash
# Ensure Relayer is running
cd ../infrastructure/relayer
cargo run --release
```

**Issue:** `Transaction reverted: Invalid signature`
```bash
# Check backend signer address matches contract
# Verify EIP-712 domain separator matches
```

## Production Deployment

### Gunicorn (Production Server)

```bash
pip install gunicorn[gevent]

gunicorn app:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --log-level info \
  --access-logfile - \
  --error-logfile -
```

### Docker

```bash
docker build -t unimate-backend .
docker run -p 8000:8000 --env-file .env unimate-backend
```

### Environment Variables for Production

- Set `DEBUG=False`
- Use strong `JWT_SECRET`
- Use production database URL
- Configure proper CORS origins
- Enable HTTPS only
- Set up monitoring and alerting

## Contributing

1. Create feature branch
2. Write tests for new features
3. Ensure all tests pass
4. Update documentation
5. Submit pull request

## License

MIT License - see ../LICENSE
