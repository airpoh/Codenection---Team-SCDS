from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from web3 import Web3
from dotenv import load_dotenv
import os
import hmac, hashlib, time
from pathlib import Path
from dotenv import load_dotenv
from collections import defaultdict, deque
import logging
import threading
from eth_account import Account
from eth_account.messages import encode_typed_data
import secrets
import subprocess
import json
from typing import List, Optional

def new_voucher_code() -> str:
    return "V-" + secrets.token_hex(20)

def db():
    return SessionLocal()

ENV_PATH = Path(__file__).with_name(".env")
load_dotenv(dotenv_path=ENV_PATH, override=True)

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("unimate-api")

RPC = os.getenv("AMOY_RPC_URL")
WELL = os.getenv("WELL_ADDRESS")
OWNER_PK = os.getenv("OWNER_PRIVATE_KEY")  # test key only!
API_SECRET = os.getenv("API_SECRET", "dev-secret")
MAX_PER_MINT = int(os.getenv("MAX_PER_MINT", "10"))
RATE_LIMIT_PER_MIN = int(os.getenv("RATE_LIMIT_PER_MIN", "5"))

# RelayMinter configuration
MINTER = os.getenv("MINTER_ADDRESS")
SIGNER_PK = os.getenv("SIGNER_PRIVATE_KEY")

# Achievement and RedemptionSystem configuration
ACH = os.getenv("ACH_ADDRESS")
RS = os.getenv("RS_ADDRESS")

# Demo user for permit-based redemption testing
DEMO_USER_PK = os.getenv("DEMO_USER_PRIVATE_KEY")
DEMO_USER_ADDR = os.getenv("DEMO_USER_ADDRESS")

# ERC-4337 Smart Account configuration
BICONOMY_BUNDLER_URL = os.getenv("BICONOMY_BUNDLER_URL")
BICONOMY_PAYMASTER_API_KEY = os.getenv("BICONOMY_PAYMASTER_API_KEY")
REDEMPTION_ADDRESS = os.getenv("REDEMPTION_ADDRESS", RS)  # Use RS_ADDRESS as fallback

if not RPC or not WELL:
    raise RuntimeError("Set AMOY_RPC_URL and WELL_ADDRESS in .env")

if OWNER_PK and not OWNER_PK.startswith("0x"):
    OWNER_PK = "0x" + OWNER_PK

if DEMO_USER_PK and not DEMO_USER_PK.startswith("0x"):
    DEMO_USER_PK = "0x" + DEMO_USER_PK

w3 = Web3(Web3.HTTPProvider(RPC))
erc20_abi = [
    {"constant":True,"inputs":[],"name":"name","outputs":[{"name":"","type":"string"}],"type":"function"},
    {"constant":True,"inputs":[],"name":"symbol","outputs":[{"name":"","type":"string"}],"type":"function"},
    {"constant":True,"inputs":[],"name":"decimals","outputs":[{"name":"","type":"uint8"}],"type":"function"},
    {"constant":True,"inputs":[{"name":"account","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"type":"function"},
    {"inputs": [{"name": "to", "type": "address"}, {"name": "amount", "type": "uint256"}], "name": "mint", "outputs": [], "stateMutability": "nonpayable", "type": "function"},
    {"inputs": [{"name": "spender", "type": "address"}, {"name": "amount", "type": "uint256"}], "name": "approve", "outputs": [{"name": "", "type": "bool"}], "stateMutability": "nonpayable", "type": "function"},
    # EIP-2612 permit functions
    {"constant": True, "inputs": [{"name":"owner","type":"address"}], "name":"nonces","outputs":[{"name":"","type":"uint256"}], "type":"function"},
    {"inputs":[
        {"name":"owner","type":"address"},
        {"name":"spender","type":"address"},
        {"name":"value","type":"uint256"},
        {"name":"deadline","type":"uint256"},
        {"name":"v","type":"uint8"},
        {"name":"r","type":"bytes32"},
        {"name":"s","type":"bytes32"}
    ], "name":"permit", "outputs":[], "stateMutability":"nonpayable","type":"function"}
]
token = w3.eth.contract(address=Web3.to_checksum_address(WELL), abi=erc20_abi)
decimals = token.functions.decimals().call()

app = FastAPI(title="UniMate Rewards API")

# Security helpers - rate limiting, idempotency, concurrency
rate_limits = defaultdict(deque)
RATE_LIMIT_WINDOW = 60   # seconds
_idempotent = {}   # key -> expiry_ts
IDEMP_TTL = 120    # seconds
lock = threading.Lock()

def enforce_rate_limit(client_ip: str):
    now = time.time()
    client_requests = rate_limits[client_ip]

    # Remove old requests outside the window
    while client_requests and client_requests[0] <= now - RATE_LIMIT_WINDOW:
        client_requests.popleft()

    # Check if under limit
    if len(client_requests) >= RATE_LIMIT_PER_MIN:
        raise HTTPException(429, f"Rate limit exceeded. Max {RATE_LIMIT_PER_MIN} requests per minute.")

    # Add current request
    client_requests.append(now)

def check_idempotent(key: str):
    now = int(time.time())
    # Purge old entries
    expired = [k for k, t in _idempotent.items() if t <= now]
    for k in expired:
        _idempotent.pop(k, None)

    if key in _idempotent:
        raise HTTPException(409, "Duplicate request")
    _idempotent[key] = now + IDEMP_TTL

def verify_sig(msg: str, sig_hex: str) -> bool:
    """Verify HMAC signature for request authentication"""
    mac = hmac.new(API_SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(mac, sig_hex)

class Health(BaseModel):
    chain_id: int
    well: str
    name: str
    symbol: str
    decimals: int

# ERC-4337 Smart Account Models
class SmartAccountRequest(BaseModel):
    signer_address: str
    chain_id: int = 80002

class BatchTransactionCall(BaseModel):
    to: str
    data: str
    value: Optional[str] = "0"

class BatchExecuteRequest(BaseModel):
    smart_account_address: str
    calls: List[BatchTransactionCall]
    chain_id: int = 80002

class SmartAccountResponse(BaseModel):
    smart_account_address: str
    signer_address: str
    chain_id: int

class BatchExecuteResponse(BaseModel):
    user_op_hash: str
    transaction_hash: Optional[str]
    success: bool
    error: Optional[str]

@app.get("/health", response_model=Health)
def health():
    return Health(
        chain_id=w3.eth.chain_id,
        well=WELL,
        name=token.functions.name().call(),
        symbol=token.functions.symbol().call(),
        decimals=decimals,
    )

@app.get("/balance/{address}")
def balance(address: str):
    try:
        addr = Web3.to_checksum_address(address)
    except Exception:
        raise HTTPException(400, detail="Invalid address")
    wei = token.functions.balanceOf(addr).call()
    human = wei / (10 ** decimals)
    return {"address": addr, "wei": str(wei), "balance": f"{human:.18f}"}

# ---- Owner-signed mint (dev/demo) ----
class MintBody(BaseModel):
    to: str
    amount: float  # in WELL units
    ts: int
    sig: str

@app.post("/mint")
def mint_tokens(body: MintBody, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    logger.info(f"Mint request from {client_ip}: {body.to} for {body.amount} WELL")

    if not OWNER_PK:
        logger.error("OWNER_PRIVATE_KEY missing in .env")
        raise HTTPException(503, detail="/mint disabled: OWNER_PRIVATE_KEY missing in .env")

    # Timestamp validation (freshness check)
    now = int(time.time())
    if abs(now - body.ts) > 60:
        logger.warning(f"Stale request from {client_ip}, timestamp {body.ts}")
        raise HTTPException(400, "stale request (>60s)")

    # Amount bounds validation
    if body.amount <= 0 or body.amount > MAX_PER_MINT:
        logger.warning(f"Invalid amount from {client_ip}: {body.amount}")
        raise HTTPException(400, f"amount must be >0 and <= {MAX_PER_MINT}")

    # Signature validation
    raw = f"{body.to}|{body.amount}|{body.ts}"
    if not verify_sig(raw, body.sig):
        logger.warning(f"Invalid signature from {client_ip}")
        raise HTTPException(401, "bad signature")

    # Validate recipient address early
    try:
        to_addr = Web3.to_checksum_address(body.to)
        logger.debug(f"Validated recipient address: {to_addr}")
    except Exception as e:
        logger.error(f"Invalid address {body.to}: {e}")
        raise HTTPException(400, detail="Invalid 'to' address")

    # Rate limit and idempotency checks
    enforce_rate_limit(client_ip)
    check_idempotent(raw)  # Use raw message as idempotency key

    wei_amount = int(body.amount * (10 ** decimals))
    logger.debug(f"Converting {body.amount} WELL to {wei_amount} wei")

    # Serialize mints to avoid nonce races - critical for concurrency
    with lock:
        try:
            owner_acct = w3.eth.account.from_key(OWNER_PK)
            owner_addr = owner_acct.address
            logger.debug(f"Using owner address: {owner_addr}")

            # Get nonce and gas price
            nonce = w3.eth.get_transaction_count(owner_addr)
            gas_price = w3.eth.gas_price
            logger.debug(f"Nonce: {nonce}, Gas price: {gas_price}")

            # Prepare mint function call
            fn = token.functions.mint(to_addr, wei_amount)

            # Estimate gas with detailed error handling
            try:
                gas_limit = fn.estimate_gas({"from": owner_addr})
                gas_limit = int(gas_limit * 110 // 100)  # +10% buffer
                logger.debug(f"Estimated gas limit: {gas_limit}")
            except Exception as e:
                logger.error(f"Gas estimation failed: {e}")
                raise HTTPException(400, detail=f"gas estimation failed: {e}")

            # Build and sign transaction
            tx = fn.build_transaction({
                "from": owner_addr,
                "nonce": nonce,
                "gasPrice": gas_price,
                "gas": gas_limit,
                "chainId": w3.eth.chain_id,
            })

            signed = w3.eth.account.sign_transaction(tx, OWNER_PK)
            tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)

            h = tx_hash.hex()
            logger.info(f"Mint successful: {h} - {body.amount} WELL to {to_addr}")
            return {
                "tx_hash": h,
                "explorer": f"https://amoy.polygonscan.com/tx/{h}",
                "to": to_addr,
                "amount": str(body.amount),
                "gas_price": str(gas_price),
                "gas": gas_limit,
                "rate_ip": client_ip
            }

        except Exception as e:
            logger.error(f"Transaction failed: {e}")
            if "insufficient funds" in str(e).lower():
                raise HTTPException(503, detail="Server wallet has insufficient funds")
            elif "nonce too low" in str(e).lower() or "replacement transaction underpriced" in str(e).lower():
                raise HTTPException(503, detail="Transaction nonce conflict, please retry")
            else:
                raise HTTPException(500, detail=f"Transaction failed: {str(e)}")

# --- RelayMinter (EIP-712) gasless-for-user, server-paid for now ---

if not MINTER:
    logger.warning("MINTER_ADDRESS missing — /mint_via_minter disabled")

if not ACH or not RS:
    logger.warning("ACH_ADDRESS/RS_ADDRESS missing — /award and /redeem will be disabled")

minter_abi = [
    {
      "name": "mintWithSig",
      "type": "function",
      "stateMutability": "nonpayable",
      "inputs": [
        {"name":"to","type":"address"},
        {"name":"amount","type":"uint256"},
        {"name":"deadline","type":"uint256"},
        {"name":"actionId","type":"bytes32"},
        {"name":"sig","type":"bytes"}
      ],
      "outputs":[]
    }
]

minter = w3.eth.contract(
    address=Web3.to_checksum_address(MINTER) if MINTER else "0x0000000000000000000000000000000000000000",
    abi=minter_abi
)

# Achievement contract ABI
ach_abi = [
    {
        "name": "mint",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "to", "type": "address"},
            {"name": "id", "type": "uint256"},
            {"name": "amount", "type": "uint256"}
        ],
        "outputs": []
    }
]

# RedemptionSystem contract ABI
rs_abi = [
    {
        "name": "redeem",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "rewardId", "type": "string"},
            {"name": "wellAmount", "type": "uint256"}
        ],
        "outputs": []
    },
    {
        "name": "ratePerVoucher",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"type": "uint256"}]
    }
]

# Initialize contracts
ach = w3.eth.contract(
    address=Web3.to_checksum_address(ACH) if ACH else "0x0000000000000000000000000000000000000000",
    abi=ach_abi
)

rs = w3.eth.contract(
    address=Web3.to_checksum_address(RS) if RS else "0x0000000000000000000000000000000000000000",
    abi=rs_abi
)

class MintViaMinterBody(BaseModel):
    to: str
    amount: float  # WELL units (e.g., 5)

@app.post("/mint_via_minter")
def mint_via_minter(body: MintViaMinterBody):
    if not (MINTER and OWNER_PK and SIGNER_PK):
        raise HTTPException(503, "/mint_via_minter disabled: missing MINTER_ADDRESS / OWNER_PRIVATE_KEY / SIGNER_PRIVATE_KEY")

    logger.info(f"RelayMinter request: {body.to} for {body.amount} WELL")

    try:
        to_addr = Web3.to_checksum_address(body.to)
    except Exception:
        raise HTTPException(400, "Invalid 'to' address")

    if body.amount <= 0:
        raise HTTPException(400, "amount must be > 0")

    amount_wei = int(body.amount * (10 ** decimals))
    deadline = int(time.time()) + 300  # 5 min
    action_id = "0x" + secrets.token_hex(32)

    # EIP-712 typed data
    domain = {
        "name": "RelayMinter",
        "version": "1",
        "chainId": w3.eth.chain_id,
        "verifyingContract": Web3.to_checksum_address(MINTER),
    }
    types = {
        "Mint": [
            {"name":"to","type":"address"},
            {"name":"amount","type":"uint256"},
            {"name":"deadline","type":"uint256"},
            {"name":"actionId","type":"bytes32"},
        ],
    }
    message = {
        "to": to_addr,
        "amount": amount_wei,
        "deadline": deadline,
        "actionId": action_id,
    }
    signable = encode_typed_data(domain, types, message)
    signed = Account.sign_message(signable, private_key=SIGNER_PK if SIGNER_PK.startswith("0x") else "0x"+SIGNER_PK)
    sig = signed.signature

    logger.debug(f"EIP-712 signature created for actionId: {action_id}")

    # send tx calling RelayMinter (payer = OWNER_PK)
    try:
        payer = w3.eth.account.from_key(OWNER_PK if OWNER_PK.startswith("0x") else "0x"+OWNER_PK)
        nonce = w3.eth.get_transaction_count(payer.address)
        gas_price = w3.eth.gas_price

        fn = minter.functions.mintWithSig(to_addr, amount_wei, deadline, action_id, sig)
        gas_limit = fn.estimate_gas({"from": payer.address})
        tx = fn.build_transaction({
            "from": payer.address,
            "nonce": nonce,
            "gasPrice": gas_price,
            "gas": int(gas_limit * 110 // 100),
            "chainId": w3.eth.chain_id,
        })
        stx = w3.eth.account.sign_transaction(tx, private_key=payer.key)
        tx_hash = w3.eth.send_raw_transaction(stx.raw_transaction)

        h = tx_hash.hex()
        logger.info(f"RelayMinter mint successful: {h} - {body.amount} WELL to {to_addr}")
        return {
            "tx_hash": h,
            "explorer": f"https://amoy.polygonscan.com/tx/{h}",
            "to": to_addr,
            "amount": str(body.amount),
            "action_id": action_id,
            "method": "RelayMinter"
        }

    except Exception as e:
        logger.error(f"RelayMinter transaction failed: {e}")
        if "insufficient funds" in str(e).lower():
            raise HTTPException(503, detail="Server wallet has insufficient funds")
        elif "ExpiredSignature" in str(e):
            raise HTTPException(400, detail="Signature expired")
        elif "ActionAlreadyUsed" in str(e):
            raise HTTPException(409, detail="Action ID already used")
        elif "InvalidSigner" in str(e):
            raise HTTPException(401, detail="Invalid signature")
        else:
            raise HTTPException(500, detail=f"RelayMinter transaction failed: {str(e)}")

# --- ERC-4337 Gasless via Pimlico (requires Pimlico API key setup) ---

class MintGaslessBody(BaseModel):
    to: str
    amount: float
    ts: int
    sig: str

@app.post("/mint_gasless")
def mint_gasless(body: MintGaslessBody, request: Request):
    """
    True gasless minting via ERC-4337 + Pimlico sponsorship
    Uses same HMAC authentication as /mint endpoint for security
    """
    client_ip = request.client.host if request.client else "unknown"
    logger.info(f"Gasless mint request from {client_ip}: {body.to} for {body.amount} WELL")

    # Reuse existing security checks (freshness, HMAC, rate-limit)
    if abs(time.time() - body.ts) > 60:
        logger.warning(f"Stale gasless request from {client_ip}, timestamp {body.ts}")
        raise HTTPException(400, "stale request (>60s)")

    if body.amount <= 0 or body.amount > MAX_PER_MINT:
        logger.warning(f"Invalid gasless amount from {client_ip}: {body.amount}")
        raise HTTPException(400, f"amount must be >0 and <= {MAX_PER_MINT}")

    raw = f"{body.to}|{body.amount}|{body.ts}"
    if not verify_sig(raw, body.sig):
        logger.warning(f"Invalid gasless signature from {client_ip}")
        raise HTTPException(401, "bad signature")

    # Rate limit and idempotency
    enforce_rate_limit(client_ip)
    check_idempotent(raw)

    # Validate address
    try:
        to_addr = Web3.to_checksum_address(body.to)
    except Exception:
        raise HTTPException(400, "Invalid 'to' address")

    # Execute via Node.js relay script
    relay_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "relay")
    amount_str = str(int(body.amount))  # Integer WELL units for the script

    try:
        logger.debug(f"Executing relay script: {relay_dir}")
        result = subprocess.run(
            ["npm", "run", "mint", "--", to_addr, amount_str],
            cwd=relay_dir,
            capture_output=True,
            text=True,
            timeout=120  # 2 minute timeout for ERC-4337 operations
        )

        if result.returncode != 0:
            logger.error(f"Relay script failed: {result.stderr}")
            error_msg = result.stderr[-400:] if result.stderr else "Unknown relay error"
            raise HTTPException(500, detail=f"Gasless transaction failed: {error_msg}")

        # Parse transaction hash from output
        tx_hash = None
        user_op_hash = None
        for line in result.stdout.splitlines():
            if line.startswith("Tx: "):
                tx_hash = line.split("Tx: ")[1].strip()
            elif line.startswith("✅ UserOpHash: "):
                user_op_hash = line.split("✅ UserOpHash: ")[1].strip()

        logger.info(f"Gasless mint successful: {tx_hash} - {body.amount} WELL to {to_addr}")
        return {
            "tx_hash": tx_hash,
            "user_op_hash": user_op_hash,
            "explorer": f"https://amoy.polygonscan.com/tx/{tx_hash}" if tx_hash else None,
            "to": to_addr,
            "amount": str(body.amount),
            "method": "ERC4337-Pimlico",
            "stdout": result.stdout,
            "rate_ip": client_ip
        }

    except subprocess.TimeoutExpired:
        logger.error(f"Relay script timeout for {client_ip}")
        raise HTTPException(408, detail="Gasless transaction timeout")
    except Exception as e:
        logger.error(f"Relay script execution error: {e}")
        raise HTTPException(500, detail=f"Gasless transaction failed: {str(e)}")

# --- Achievement System: /award endpoint ---

class AwardBody(BaseModel):
    to: str
    id: int
    amount: int
    ts: int
    sig: str

@app.post("/award")
def award(body: AwardBody, request: Request):
    """
    Award achievement badges to users
    Uses HMAC authentication and server-paid transactions
    """
    if not (ACH and OWNER_PK):
        raise HTTPException(503, "/award disabled: ACH_ADDRESS or OWNER_PRIVATE_KEY missing")

    client_ip = request.client.host if request.client else "unknown"
    logger.info(f"Award request from {client_ip}: badge {body.id} (x{body.amount}) to {body.to}")

    # Security checks (freshness + HMAC + rate-limit + idempotency)
    now = int(time.time())
    if abs(now - body.ts) > 60:
        logger.warning(f"Stale award request from {client_ip}")
        raise HTTPException(400, "stale request")

    raw = f"{body.to}|{body.id}|{body.amount}|{body.ts}"
    if not verify_sig(raw, body.sig):
        logger.warning(f"Invalid award signature from {client_ip}")
        raise HTTPException(401, "bad signature")

    enforce_rate_limit(client_ip)
    check_idempotent(raw)

    # Validate inputs
    try:
        to_addr = Web3.to_checksum_address(body.to)
    except Exception:
        raise HTTPException(400, "Invalid 'to' address")

    if body.id < 0 or body.amount <= 0:
        raise HTTPException(400, "id must be >= 0 and amount must be > 0")

    try:
        # Setup transaction
        owner = w3.eth.account.from_key(OWNER_PK if OWNER_PK.startswith("0x") else "0x"+OWNER_PK)
        nonce = w3.eth.get_transaction_count(owner.address)
        gas_price = w3.eth.gas_price

        # Prepare mint function call
        fn = ach.functions.mint(to_addr, body.id, body.amount)
        gas_limit = fn.estimate_gas({"from": owner.address})

        # Build and sign transaction
        tx = fn.build_transaction({
            "from": owner.address,
            "nonce": nonce,
            "gasPrice": gas_price,
            "gas": int(gas_limit * 110 // 100),  # +10% buffer
            "chainId": w3.eth.chain_id,
        })

        stx = w3.eth.account.sign_transaction(tx, owner.key)
        tx_hash = w3.eth.send_raw_transaction(stx.raw_transaction)

        logger.info(f"Award successful: {tx_hash.hex()} - badge {body.id} (x{body.amount}) to {to_addr}")
        return {
            "tx_hash": tx_hash.hex(),
            "explorer": f"https://amoy.polygonscan.com/tx/{tx_hash.hex()}",
            "to": to_addr,
            "badge_id": body.id,
            "amount": body.amount,
            "method": "Achievement-Award"
        }

    except Exception as e:
        logger.error(f"Award transaction failed: {e}")
        if "insufficient funds" in str(e).lower():
            raise HTTPException(503, detail="Server wallet has insufficient funds")
        else:
            raise HTTPException(500, detail=f"Award transaction failed: {str(e)}")

# --- Redemption System: /redeem endpoint ---

class RedeemBody(BaseModel):
    from_addr: str      # for demo: must equal owner address
    amount: float       # WELL units
    rewardId: str
    ts: int
    sig: str

@app.post("/redeem")
def redeem(body: RedeemBody, request: Request):
    """
    Redeem WELL tokens for vouchers/rewards
    Demo mode: only owner address can redeem (keeps it simple)
    """
    if not (RS and OWNER_PK):
        raise HTTPException(503, "/redeem disabled: RS_ADDRESS or OWNER_PRIVATE_KEY missing")

    client_ip = request.client.host if request.client else "unknown"
    logger.info(f"Redeem request from {client_ip}: {body.amount} WELL for {body.rewardId}")

    # Security checks (freshness + HMAC + rate-limit + idempotency)
    now = int(time.time())
    if abs(now - body.ts) > 60:
        logger.warning(f"Stale redeem request from {client_ip}")
        raise HTTPException(400, "stale request")

    raw = f"{body.from_addr}|{body.amount}|{body.rewardId}|{body.ts}"
    if not verify_sig(raw, body.sig):
        logger.warning(f"Invalid redeem signature from {client_ip}")
        raise HTTPException(401, "bad signature")

    enforce_rate_limit(client_ip)
    check_idempotent(raw)

    # Validate inputs
    try:
        user = Web3.to_checksum_address(body.from_addr)
    except Exception:
        raise HTTPException(400, "Invalid 'from_addr' address")

    if body.amount <= 0:
        raise HTTPException(400, "amount must be > 0")

    if not body.rewardId or len(body.rewardId) > 100:
        raise HTTPException(400, "rewardId must be non-empty and <= 100 chars")

    # Demo mode: only owner can redeem
    owner = w3.eth.account.from_key(OWNER_PK if OWNER_PK.startswith("0x") else "0x"+OWNER_PK)
    if user != owner.address:
        raise HTTPException(400, "demo mode: from_addr must equal owner address")

    amt_wei = int(body.amount * (10 ** decimals))

    try:
        # Transaction 1: approve RS to spend WELL
        n0 = w3.eth.get_transaction_count(owner.address)
        gas_price = w3.eth.gas_price

        approve_fn = token.functions.approve(rs.address, amt_wei)
        g1 = approve_fn.estimate_gas({"from": owner.address})
        tx1 = approve_fn.build_transaction({
            "from": owner.address,
            "nonce": n0,
            "gasPrice": gas_price,
            "gas": int(g1 * 110 // 100),
            "chainId": w3.eth.chain_id,
        })
        stx1 = w3.eth.account.sign_transaction(tx1, owner.key)
        h1 = w3.eth.send_raw_transaction(stx1.raw_transaction)

        logger.debug(f"Approve transaction: {h1.hex()}")

        # Transaction 2: redeem
        n1 = n0 + 1
        redeem_fn = rs.functions.redeem(body.rewardId, amt_wei)
        g2 = redeem_fn.estimate_gas({"from": owner.address})
        tx2 = redeem_fn.build_transaction({
            "from": owner.address,
            "nonce": n1,
            "gasPrice": gas_price,
            "gas": int(g2 * 110 // 100),
            "chainId": w3.eth.chain_id,
        })
        stx2 = w3.eth.account.sign_transaction(tx2, owner.key)
        h2 = w3.eth.send_raw_transaction(stx2.raw_transaction)

        logger.info(f"Redeem successful: approve={h1.hex()}, redeem={h2.hex()} - {body.amount} WELL for {body.rewardId}")

        # Save voucher to Supabase
        voucher_code = f"VCH-{h2.hex()[-8:]}"  # Use last 8 chars of redeem tx as voucher code
        session = db()
        try:
            voucher = Voucher(
                code=voucher_code,
                address=user,
                reward_id=body.rewardId,
                amount_wei=str(amt_wei),
                approve_tx=h1.hex(),
                redeem_tx=h2.hex(),
                status="issued",
                created_at=now,
                note=f"Redeemed {body.amount} WELL for {body.rewardId}"
            )
            session.add(voucher)
            session.commit()
            logger.info(f"Voucher saved: {voucher_code}")
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to save voucher: {e}")
        finally:
            session.close()

        return {
            "approve_tx": h1.hex(),
            "redeem_tx": h2.hex(),
            "approve_explorer": f"https://amoy.polygonscan.com/tx/{h1.hex()}",
            "redeem_explorer": f"https://amoy.polygonscan.com/tx/{h2.hex()}",
            "amount": str(body.amount),
            "rewardId": body.rewardId,
            "voucher_code": voucher_code,
            "method": "WELL-Redemption"
        }

    except Exception as e:
        logger.error(f"Redeem transaction failed: {e}")
        if "insufficient funds" in str(e).lower():
            raise HTTPException(503, detail="Server wallet has insufficient funds")
        elif "insufficient allowance" in str(e).lower():
            raise HTTPException(500, detail="Approval failed or insufficient allowance")
        else:
            raise HTTPException(500, detail=f"Redeem transaction failed: {str(e)}")
        
# --- Persistence: Supabase Postgres via SQLAlchemy ---
from sqlalchemy import create_engine, Column, String, BigInteger, Text
from sqlalchemy.orm import declarative_base, sessionmaker
import os

DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    raise RuntimeError("Set SUPABASE_DB_URL in .env")

engine = create_engine(DB_URL, echo = False, future = True)
Base = declarative_base()
SessionLocal = sessionmaker(bind = engine, autoflush = False, autocommit = False)

class Voucher(Base):
    __tablename__ = "vouchers"
    code = Column(String(64), primary_key = True)
    address = Column(String(42), index = True, nullable = False)
    reward_id = Column(String(128), nullable = False)
    amount_wei = Column(String(78),  nullable = False)
    approve_tx = Column(String(66), nullable = False)
    redeem_tx = Column(String(66), nullable = False)
    status = Column(String(16), default = "issued")
    created_at = Column(BigInteger, nullable = False)
    note = Column(Text, default = "")

def db():
    return SessionLocal()

@app.get("/vouchers/{address}")
def get_vouchers(address: str):
    """
    Get all vouchers for a specific address
    """
    try:
        # Validate address format
        checksum_address = Web3.to_checksum_address(address)
    except Exception:
        raise HTTPException(400, "Invalid address format")

    session = db()
    try:
        vouchers = session.query(Voucher).filter(Voucher.address == checksum_address).all()
        result = []
        for v in vouchers:
            result.append({
                "code": v.code,
                "address": v.address,
                "reward_id": v.reward_id,
                "amount_wei": v.amount_wei,
                "approve_tx": v.approve_tx,
                "redeem_tx": v.redeem_tx,
                "status": v.status,
                "created_at": v.created_at,
                "note": v.note
            })
        return {"vouchers": result, "count": len(result)}
    except Exception as e:
        logger.error(f"Failed to fetch vouchers for {checksum_address}: {e}")
        raise HTTPException(500, "Database error")
    finally:
        session.close()

# EIP-2612 Permit-based Redemption Endpoints
class RedeemPermitBody(BaseModel):
    owner: str           # user address holding WELL
    amount: float        # WELL units
    rewardId: str
    deadline: int        # unix seconds
    v: int
    r: str               # 0x…32 bytes
    s: str               # 0x…32 bytes
    ts: int = None       # optional: if you apply your HMAC freshness window
    sig: str = None      # optional: your HMAC if you keep that check

def new_voucher_code():
    """Generate a unique voucher code"""
    import uuid
    return f"VCH-{uuid.uuid4().hex[:8].upper()}"

@app.post("/redeem_permit")
def redeem_permit(body: RedeemPermitBody, request: Request = None):
    """
    EIP-2612 Permit-based redemption: users sign permits off-chain, server pays gas
    """
    if not (RS and OWNER_PK):
        raise HTTPException(503, "/redeem_permit disabled: RS_ADDRESS or OWNER_PRIVATE_KEY missing")

    client_ip = request.client.host if request and request.client else "unknown"
    logger.info(f"Permit redeem request from {client_ip}: {body.amount} WELL for {body.rewardId}")

    # Optional: keep HMAC/rate-limit/idempotency guards
    if body.ts and body.sig:
        now = int(time.time())
        if abs(now - body.ts) > 60:
            logger.warning(f"Stale permit request from {client_ip}")
            raise HTTPException(400, "stale request")

        raw = f"{body.owner}|{body.amount}|{body.rewardId}|{body.deadline}|{body.ts}"
        if not verify_sig(raw, body.sig):
            logger.warning(f"Invalid permit signature from {client_ip}")
            raise HTTPException(401, "bad signature")

    # Validate inputs
    try:
        owner_addr = Web3.to_checksum_address(body.owner)
    except Exception:
        raise HTTPException(400, "Invalid 'owner' address")

    if body.amount <= 0:
        raise HTTPException(400, "amount must be > 0")

    amt_wei = int(body.amount * (10 ** decimals))
    payer = w3.eth.account.from_key(OWNER_PK)
    chain_id = w3.eth.chain_id

    try:
        # Transaction 1: permit (spender is RedemptionSystem)
        n0 = w3.eth.get_transaction_count(payer.address)
        gas_price = w3.eth.gas_price
        permit_fn = token.functions.permit(
            owner_addr, rs.address, amt_wei, int(body.deadline),
            int(body.v), Web3.to_bytes(hexstr=body.r), Web3.to_bytes(hexstr=body.s)
        )
        g1 = permit_fn.estimate_gas({"from": payer.address})
        tx1 = permit_fn.build_transaction({
            "from": payer.address, "nonce": n0, "gasPrice": gas_price,
            "gas": int(g1*1.1), "chainId": chain_id
        })
        stx1 = w3.eth.account.sign_transaction(tx1, payer.key)
        h1 = w3.eth.send_raw_transaction(stx1.raw_transaction)
        logger.debug(f"Permit transaction: {h1.hex()}")

        # Transaction 2: redeem
        n1 = n0 + 1
        redeem_fn = rs.functions.redeem(body.rewardId, amt_wei)
        g2 = redeem_fn.estimate_gas({"from": payer.address})
        tx2 = redeem_fn.build_transaction({
            "from": payer.address, "nonce": n1, "gasPrice": gas_price,
            "gas": int(g2*1.1), "chainId": chain_id
        })
        stx2 = w3.eth.account.sign_transaction(tx2, payer.key)
        h2 = w3.eth.send_raw_transaction(stx2.raw_transaction)
        logger.info(f"Permit redeem successful: permit={h1.hex()}, redeem={h2.hex()} - {body.amount} WELL for {body.rewardId}")

        # Store voucher in Supabase (same as regular redeem)
        voucher_code = new_voucher_code()
        session = db()
        try:
            voucher = Voucher(
                code=voucher_code,
                address=owner_addr,
                reward_id=body.rewardId,
                amount_wei=str(amt_wei),
                approve_tx=h1.hex(),
                redeem_tx=h2.hex(),
                status="issued",
                created_at=int(time.time()),
                note="EIP-2612 permit flow"
            )
            session.add(voucher)
            session.commit()
            logger.info(f"Voucher saved: {voucher_code}")
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to save voucher: {e}")
        finally:
            session.close()

        return {
            "approve_tx": h1.hex(),
            "redeem_tx": h2.hex(),
            "approve_explorer": f"https://amoy.polygonscan.com/tx/{h1.hex()}",
            "redeem_explorer": f"https://amoy.polygonscan.com/tx/{h2.hex()}",
            "voucher_code": voucher_code,
            "amount": str(body.amount),
            "rewardId": body.rewardId,
            "method": "WELL-Permit-Redemption"
        }

    except Exception as e:
        logger.error(f"Permit redeem transaction failed: {e}")
        if "insufficient funds" in str(e).lower():
            raise HTTPException(503, detail="Server wallet has insufficient funds")
        else:
            raise HTTPException(500, detail=f"Permit redeem failed: {str(e)}")

# Demo endpoint for permit-based redemption
class RedeemPermitDemoBody(BaseModel):
    amount: float        # WELL units
    rewardId: str
    deadline: int = None # optional: defaults to 5 minutes from now

@app.post("/redeem_permit_demo")
def redeem_permit_demo(body: RedeemPermitDemoBody, request: Request = None):
    """
    Demo endpoint: creates EIP-712 permit signature for demo user, then calls redeem_permit
    """
    if not (DEMO_USER_PK and DEMO_USER_ADDR):
        raise HTTPException(503, "/redeem_permit_demo disabled: DEMO_USER_PRIVATE_KEY or DEMO_USER_ADDRESS missing")

    client_ip = request.client.host if request and request.client else "unknown"
    logger.info(f"Demo permit redeem request from {client_ip}: {body.amount} WELL for {body.rewardId}")

    # Set deadline if not provided (5 minutes from now)
    deadline = body.deadline or (int(time.time()) + 300)
    amt_wei = int(body.amount * (10 ** decimals))
    chain_id = w3.eth.chain_id

    try:
        # Get current nonce for demo user
        demo_account = Account.from_key(DEMO_USER_PK)
        nonce = token.functions.nonces(DEMO_USER_ADDR).call()

        # Create EIP-712 typed data for permit
        typed_data = {
            "types": {
                "EIP712Domain": [
                    {"name": "name", "type": "string"},
                    {"name": "version", "type": "string"},
                    {"name": "chainId", "type": "uint256"},
                    {"name": "verifyingContract", "type": "address"}
                ],
                "Permit": [
                    {"name": "owner", "type": "address"},
                    {"name": "spender", "type": "address"},
                    {"name": "value", "type": "uint256"},
                    {"name": "nonce", "type": "uint256"},
                    {"name": "deadline", "type": "uint256"}
                ]
            },
            "primaryType": "Permit",
            "domain": {
                "name": token.functions.name().call(),
                "version": "1",
                "chainId": chain_id,
                "verifyingContract": token.address
            },
            "message": {
                "owner": DEMO_USER_ADDR,
                "spender": rs.address,
                "value": str(amt_wei),
                "nonce": str(nonce),
                "deadline": str(deadline)
            }
        }

        # Create EIP-712 encoded message and sign
        encoded_message = encode_typed_data(full_message=typed_data)
        signature = demo_account.sign_message(encoded_message)

        logger.info(f"Demo permit signature created: v={signature.v}, r={hex(signature.r)}, s={hex(signature.s)}")

        # Create request for /redeem_permit
        permit_request = RedeemPermitBody(
            owner=DEMO_USER_ADDR,
            amount=body.amount,
            rewardId=body.rewardId,
            deadline=deadline,
            v=signature.v,
            r=hex(signature.r),
            s=hex(signature.s)
        )

        # Call the main redeem_permit function
        return redeem_permit(permit_request, request)

    except Exception as e:
        logger.error(f"Demo permit creation failed: {e}")
        raise HTTPException(500, detail=f"Demo permit failed: {str(e)}")