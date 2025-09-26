from fastapi import APIRouter, HTTPException, Request, Depends, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware
import os
import hmac, hashlib, time
from collections import defaultdict, deque
import logging
import threading
from eth_account import Account
from eth_account.messages import encode_typed_data
import secrets
import subprocess
import json
from typing import List, Optional, Dict, Any, Union
from jose import jwt, JWTError
import requests
import asyncio
from pydantic import validator, ValidationError, Field
from enum import Enum
from datetime import datetime, timedelta
from config import (
    RPC, WELL, REDEMPTION_SYSTEM, ACHIEVEMENTS, PRIVATE_KEY,
    BICONOMY_PAYMASTER_API_KEY,  # PARTICLE_* removed
    OWNER_PK, API_SECRET, MAX_PER_MINT, RATE_LIMIT_PER_MIN, MINTER, SIGNER_PK,
    ACH, RS, DEMO_USER_PK, DEMO_USER_ADDR, BICONOMY_BUNDLER_URL, DB_URL, ALLOWED_ORIGINS
)
from routers.core_supabase import get_authenticated_user

# Create blockchain router with /chain prefix
router = APIRouter(prefix="/chain", tags=["blockchain"])

# Rate limiting function needed for decorators
def get_user_id_for_rate_limit(request: Request):
    """Extract user ID for rate limiting from Authorization header"""
    try:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1]
            # For Supabase JWT
            try:
                payload = jwt.decode(token, options={"verify_signature": False})
                return payload.get("sub", get_remote_address(request))
            except Exception:
                pass
        return get_remote_address(request)
    except Exception:
        return get_remote_address(request)

# Create limiter instance
limiter = Limiter(key_func=get_user_id_for_rate_limit)

def new_voucher_code() -> str:
    return "V-" + secrets.token_hex(20)

def db():
    return SessionLocal()

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("unimate-api")

# Use REDEMPTION_SYSTEM as the main redemption address, with RS as fallback
REDEMPTION_ADDRESS = REDEMPTION_SYSTEM or RS

# Security Configuration - Enhanced allowlisted addresses and function selectors
class SecurityConfig:
    """Enhanced security configuration for allowlisted addresses and function selectors"""

    # Allowlisted token addresses (include WELL token)
    ALLOWLISTED_TOKENS = {
        WELL.lower() if WELL else "0x0",
        "0x0000000000000000000000000000000000000000",  # Native token
        # Add additional verified token addresses here
    }

    # Allowlisted contract addresses for redemption
    ALLOWLISTED_REDEEMERS = {
        RS.lower() if RS else "0x0",
        REDEMPTION_ADDRESS.lower() if REDEMPTION_ADDRESS else "0x0",
        # Add additional verified redeemer addresses here
    }

    # Allowlisted function selectors (strictly controlled)
    ALLOWLISTED_FUNCTION_SELECTORS = {
        "0x095ea7b3",  # approve(address,uint256) - ERC20 approval
        "0x6c83cb85",  # redeem(string,uint256) - custom redeem function
        "0xa9059cbb",  # transfer(address,uint256) - emergency transfers only
        "0x23b872dd",  # transferFrom(address,address,uint256) - controlled transfers
    }

    # Maximum transaction value limits (in wei)
    MAX_APPROVAL_AMOUNT = int(1000000 * (10 ** 18))  # 1M tokens max
    MAX_REDEEM_AMOUNT = int(100000 * (10 ** 18))     # 100K tokens max
    MAX_TRANSFER_AMOUNT = int(50000 * (10 ** 18))    # 50K tokens max for transfers

    # Rate limiting configuration (per endpoint)
    MAX_REQUESTS_PER_MINUTE = 10
    MAX_REQUESTS_PER_HOUR = 100
    MAX_REQUESTS_PER_DAY = 1000

    # Enhanced rate limits for high-risk endpoints
    HIGH_RISK_ENDPOINTS_RATE_LIMIT = 3  # per minute
    MINT_ENDPOINT_RATE_LIMIT = 5        # per minute
    REDEEM_ENDPOINT_RATE_LIMIT = 3      # per minute

    # Blocklist configuration with exponential backoff
    BLOCKLIST_INITIAL_DELAY = 60      # 1 minute
    BLOCKLIST_MAX_DELAY = 86400       # 24 hours
    BLOCKLIST_MULTIPLIER = 2          # Exponential backoff multiplier

    # Abuse detection thresholds
    SUSPICIOUS_REQUEST_THRESHOLD = 20   # requests per minute before flagging
    FAILED_VALIDATION_THRESHOLD = 5    # validation failures before blocking
    INVALID_SIGNATURE_THRESHOLD = 3    # invalid signatures before blocking

    # Input validation limits
    MAX_CALLDATA_SIZE = 10000          # Maximum calldata bytes
    MAX_BATCH_CALLS = 5                # Maximum calls per batch
    MAX_IDEMPOTENCY_KEY_LENGTH = 64    # Maximum idempotency key length

    # Allowed chain IDs (strict whitelist)
    ALLOWED_CHAIN_IDS = {80002}        # Only Amoy testnet for now

    # Security monitoring configuration
    ENABLE_SECURITY_LOGGING = True
    LOG_FAILED_VALIDATIONS = True
    LOG_RATE_LIMIT_HITS = True
    LOG_BLOCKLIST_EVENTS = True

# Biconomy Configuration already imported from config

if not RPC or not WELL:
    raise RuntimeError("Set AMOY_RPC_URL and WELL_ADDRESS in .env")

if OWNER_PK and not OWNER_PK.startswith("0x"):
    OWNER_PK = "0x" + OWNER_PK

if DEMO_USER_PK and not DEMO_USER_PK.startswith("0x"):
    DEMO_USER_PK = "0x" + DEMO_USER_PK

# Supabase JWT verification setup
security = HTTPBearer()

# Cache for JWKS
jwks_cache = {}
jwks_cache_expiry = 0

# REMOVED: AuthenticatedUser model (was for Particle Network)
# Now using standard Supabase user dict from get_authenticated_user

# REMOVED: Particle Network authentication functions
# Now using Supabase authentication via get_authenticated_user

def verify_aa_ownership(user: dict, aa_address: str) -> bool:
    """
    Verify that the authenticated user owns the specified Smart Account address
    """
    # Get user's smart account from database
    session = db()
    try:
        user_id = user["sub"]
        account = session.query(Account).filter(
            Account.user_id == user_id,
            Account.address == aa_address.lower()
        ).first()
        return account is not None
    finally:
        session.close()

# Initialize Web3 with POA middleware for Polygon Amoy compatibility
w3 = Web3(Web3.HTTPProvider(RPC))
# Inject POA middleware at layer 0 to handle extended extraData field in POA chains
w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
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
class BlocklistManager:
    """Manages IP and Smart Account address blocklist with exponential backoff"""

    def __init__(self):
        self.ip_blocklist = {}      # ip -> {blocked_until: timestamp, attempt_count: int}
        self.aa_blocklist = {}      # aa_address -> {blocked_until: timestamp, attempt_count: int}
        self.lock = threading.Lock()

    def _get_block_duration(self, attempt_count: int) -> int:
        """Calculate exponential backoff duration"""
        duration = SecurityConfig.BLOCKLIST_INITIAL_DELAY * (SecurityConfig.BLOCKLIST_MULTIPLIER ** (attempt_count - 1))
        return min(duration, SecurityConfig.BLOCKLIST_MAX_DELAY)

    def is_ip_blocked(self, ip: str) -> bool:
        """Check if IP is currently blocked"""
        with self.lock:
            if ip not in self.ip_blocklist:
                return False

            blocked_until = self.ip_blocklist[ip]['blocked_until']
            if time.time() >= blocked_until:
                # Block has expired, remove from blocklist
                del self.ip_blocklist[ip]
                return False

            return True

    def is_aa_blocked(self, aa_address: str) -> bool:
        """Check if Smart Account address is currently blocked"""
        with self.lock:
            aa_key = aa_address.lower()
            if aa_key not in self.aa_blocklist:
                return False

            blocked_until = self.aa_blocklist[aa_key]['blocked_until']
            if time.time() >= blocked_until:
                # Block has expired, remove from blocklist
                del self.aa_blocklist[aa_key]
                return False

            return True

    def block_ip(self, ip: str, reason: str = "abuse_detected"):
        """Add IP to blocklist with exponential backoff"""
        with self.lock:
            current_time = time.time()

            if ip in self.ip_blocklist:
                # Increase attempt count for exponential backoff
                self.ip_blocklist[ip]['attempt_count'] += 1
            else:
                self.ip_blocklist[ip] = {'attempt_count': 1}

            duration = self._get_block_duration(self.ip_blocklist[ip]['attempt_count'])
            self.ip_blocklist[ip]['blocked_until'] = current_time + duration

            logger.warning(f"IP {ip} blocked for {duration}s (attempt #{self.ip_blocklist[ip]['attempt_count']}) - {reason}")

    def block_aa(self, aa_address: str, reason: str = "abuse_detected"):
        """Add Smart Account to blocklist with exponential backoff"""
        with self.lock:
            aa_key = aa_address.lower()
            current_time = time.time()

            if aa_key in self.aa_blocklist:
                # Increase attempt count for exponential backoff
                self.aa_blocklist[aa_key]['attempt_count'] += 1
            else:
                self.aa_blocklist[aa_key] = {'attempt_count': 1}

            duration = self._get_block_duration(self.aa_blocklist[aa_key]['attempt_count'])
            self.aa_blocklist[aa_key]['blocked_until'] = current_time + duration

            logger.warning(f"AA {aa_address} blocked for {duration}s (attempt #{self.aa_blocklist[aa_key]['attempt_count']}) - {reason}")

    def get_blocklist_status(self) -> Dict[str, Any]:
        """Get current blocklist status for monitoring"""
        with self.lock:
            current_time = time.time()
            return {
                "ip_blocklist_count": len([ip for ip, data in self.ip_blocklist.items() if data['blocked_until'] > current_time]),
                "aa_blocklist_count": len([aa for aa, data in self.aa_blocklist.items() if data['blocked_until'] > current_time]),
                "total_blocked": len(self.ip_blocklist) + len(self.aa_blocklist)
            }

# Initialize blocklist manager
blocklist_manager = BlocklistManager()

# Enhanced Security Logging
class SecurityLogger:
    """Enhanced security logging with sanitized user data"""

    @staticmethod
    def sanitize_address(address: str) -> str:
        """Sanitize Ethereum address for logging (show first 6 + last 4 chars)"""
        if not address or len(address) < 10:
            return "INVALID_ADDRESS"
        return f"{address[:6]}...{address[-4:]}"

    @staticmethod
    def log_security_event(event_type: str, details: Dict[str, Any], client_ip: str = "unknown"):
        """Log security events with sanitized data"""
        sanitized_details = {}
        for key, value in details.items():
            if "address" in key.lower() and isinstance(value, str) and value.startswith("0x"):
                sanitized_details[key] = SecurityLogger.sanitize_address(value)
            elif key == "amount" and isinstance(value, (int, float)):
                # Log amounts but cap for privacy
                sanitized_details[key] = min(value, 1000000) if value else 0
            else:
                sanitized_details[key] = str(value)[:100]  # Truncate long strings

        logger.warning(f"SECURITY_EVENT: {event_type} | IP: {client_ip} | Details: {sanitized_details}")

    @staticmethod
    def log_validation_failure(validation_type: str, error: str, client_ip: str = "unknown"):
        """Log validation failures"""
        logger.warning(f"VALIDATION_FAILURE: {validation_type} | IP: {client_ip} | Error: {error[:200]}")

    @staticmethod
    def log_rate_limit_exceeded(identifier: str, client_ip: str = "unknown"):
        """Log rate limit violations"""
        logger.warning(f"RATE_LIMIT_EXCEEDED: {identifier} | IP: {client_ip}")

security_logger = SecurityLogger()

# Input Validation with Pydantic
class TransactionMode(str, Enum):
    INTENT = "intent"
    CALLDATA = "calldata"

class ValidatedBatchTransactionCall(BaseModel):
    """Enhanced BatchTransactionCall with comprehensive security validation"""
    to: str = Field(..., description="Contract address to call")
    data: str = Field(..., description="Transaction calldata")
    value: str = Field(default="0", description="ETH value to send")

    @validator('to')
    def validate_to_address(cls, v):
        try:
            # Validate Ethereum address format
            checksum_addr = Web3.to_checksum_address(v)

            # Check if address is in allowlist (either token or redeemer)
            addr_lower = checksum_addr.lower()
            if (addr_lower not in SecurityConfig.ALLOWLISTED_TOKENS and
                addr_lower not in SecurityConfig.ALLOWLISTED_REDEEMERS):
                # Log security event for unauthorized address access attempt
                security_logger.log_security_event("unauthorized_address_access", {
                    "attempted_address": SecurityLogger.sanitize_address(checksum_addr),
                    "allowlisted_tokens": len(SecurityConfig.ALLOWLISTED_TOKENS),
                    "allowlisted_redeemers": len(SecurityConfig.ALLOWLISTED_REDEEMERS)
                })
                raise ValueError(f"Contract address not allowlisted: {SecurityLogger.sanitize_address(checksum_addr)}")

            return checksum_addr
        except Exception as e:
            raise ValueError(f"Invalid contract address: {str(e)}")

    @validator('data')
    def validate_function_selector(cls, v):
        if not v or not v.startswith('0x'):
            raise ValueError("Calldata must start with '0x'")

        if len(v) < 10:
            raise ValueError("Calldata too short - must include function selector")

        if len(v) > SecurityConfig.MAX_CALLDATA_SIZE:
            raise ValueError(f"Calldata exceeds maximum size: {SecurityConfig.MAX_CALLDATA_SIZE}")

        # Extract function selector (first 4 bytes after 0x)
        selector = v[:10].lower()

        if selector not in SecurityConfig.ALLOWLISTED_FUNCTION_SELECTORS:
            # Log security event for unauthorized selector
            security_logger.log_security_event("unauthorized_function_selector", {
                "attempted_selector": selector,
                "allowlisted_selectors": list(SecurityConfig.ALLOWLISTED_FUNCTION_SELECTORS)
            })
            raise ValueError(f"Function selector not allowlisted: {selector}")

        # Enhanced validation for specific function calls
        if selector == "0x095ea7b3":  # approve(address,uint256)
            try:
                if len(v) >= 138:  # Full approve calldata
                    # Extract spender address (bytes 4-36)
                    spender_hex = v[34:74]  # Skip 0x and selector
                    spender_addr = "0x" + spender_hex[24:]  # Last 20 bytes

                    # Extract amount (bytes 36-68)
                    amount_hex = v[74:138]
                    amount = int(amount_hex, 16) if amount_hex else 0

                    if amount > SecurityConfig.MAX_APPROVAL_AMOUNT:
                        security_logger.log_security_event("excessive_approval_amount", {
                            "amount": amount,
                            "max_allowed": SecurityConfig.MAX_APPROVAL_AMOUNT,
                            "spender": SecurityLogger.sanitize_address(spender_addr)
                        })
                        raise ValueError(f"Approval amount exceeds maximum: {amount}")
            except Exception as decode_error:
                logger.warning(f"Failed to decode approve calldata: {decode_error}")

        elif selector == "0xa9059cbb":  # transfer(address,uint256)
            try:
                if len(v) >= 138:
                    amount_hex = v[74:138]
                    amount = int(amount_hex, 16) if amount_hex else 0

                    if amount > SecurityConfig.MAX_TRANSFER_AMOUNT:
                        security_logger.log_security_event("excessive_transfer_amount", {
                            "amount": amount,
                            "max_allowed": SecurityConfig.MAX_TRANSFER_AMOUNT
                        })
                        raise ValueError(f"Transfer amount exceeds maximum: {amount}")
            except Exception as decode_error:
                logger.warning(f"Failed to decode transfer calldata: {decode_error}")

        return v

    @validator('value')
    def validate_value(cls, v):
        try:
            value_int = int(v)
            if value_int < 0:
                raise ValueError("Value cannot be negative")
            if value_int > 0:
                # Log non-zero ETH value transactions for monitoring
                security_logger.log_security_event("non_zero_eth_value", {
                    "value": value_int
                })
                logger.warning(f"Non-zero ETH value in transaction: {value_int}")
            return v
        except ValueError as e:
            if "Value cannot be negative" in str(e):
                raise e
            raise ValueError("Invalid value format")

class ValidatedAASendIntentRequest(BaseModel):
    """Enhanced intent request with strict validation"""
    amount: float = Field(..., gt=0, le=100000, description="Amount in token units")
    beneficiary: str = Field(..., description="Beneficiary address")
    aa_address: str = Field(..., description="Smart Account address")
    idempotency_key: str = Field(..., min_length=1, max_length=64, description="Idempotency key")
    chain_id: int = Field(default=80002, description="Chain ID")

    @validator('beneficiary')
    def validate_beneficiary(cls, v):
        try:
            return Web3.to_checksum_address(v)
        except Exception:
            raise ValueError("Invalid beneficiary address")

    @validator('aa_address')
    def validate_aa_address(cls, v):
        try:
            return Web3.to_checksum_address(v)
        except Exception:
            raise ValueError("Invalid Smart Account address")

    @validator('amount')
    def validate_amount_limits(cls, v):
        max_amount = SecurityConfig.MAX_REDEEM_AMOUNT / (10 ** 18)  # Convert to token units
        if v > max_amount:
            raise ValueError(f"Amount exceeds maximum allowed: {max_amount}")
        return v

    @validator('chain_id')
    def validate_chain_id(cls, v):
        if v not in [80002]:  # Only Amoy testnet for now
            raise ValueError(f"Unsupported chain ID: {v}")
        return v

class ValidatedAASendCalldataRequest(BaseModel):
    """Enhanced calldata request with strict validation"""
    calls: List[ValidatedBatchTransactionCall] = Field(..., min_items=1, max_items=5, description="Transaction calls")
    aa_address: str = Field(..., description="Smart Account address")
    idempotency_key: str = Field(..., min_length=1, max_length=64, description="Idempotency key")
    chain_id: int = Field(default=80002, description="Chain ID")

    @validator('aa_address')
    def validate_aa_address(cls, v):
        try:
            return Web3.to_checksum_address(v)
        except Exception:
            raise ValueError("Invalid Smart Account address")

    @validator('calls')
    def validate_call_sequence(cls, v):
        if not v:
            raise ValueError("At least one call is required")

        if len(v) > SecurityConfig.MAX_BATCH_CALLS:
            raise ValueError(f"Too many calls in batch: {len(v)} > {SecurityConfig.MAX_BATCH_CALLS}")

        # Check for suspicious call patterns
        selectors = [call.data[:10].lower() for call in v if call.data and len(call.data) >= 10]

        # Ensure approve comes before redeem in redemption flows
        approve_indices = [i for i, sel in enumerate(selectors) if sel == "0x095ea7b3"]
        redeem_indices = [i for i, sel in enumerate(selectors) if sel == "0x6c83cb85"]

        if approve_indices and redeem_indices:
            if not all(ai < ri for ai in approve_indices for ri in redeem_indices):
                security_logger.log_security_event("invalid_call_sequence", {
                    "approve_indices": approve_indices,
                    "redeem_indices": redeem_indices,
                    "selectors": selectors
                })
                raise ValueError("Invalid call sequence: approve must come before redeem")

        # Check for duplicate function calls (potential replay attacks)
        selector_counts = {}
        for selector in selectors:
            selector_counts[selector] = selector_counts.get(selector, 0) + 1

        suspicious_duplicates = [sel for sel, count in selector_counts.items() if count > 2]
        if suspicious_duplicates:
            security_logger.log_security_event("suspicious_duplicate_calls", {
                "duplicated_selectors": suspicious_duplicates,
                "selector_counts": selector_counts
            })
            logger.warning(f"Suspicious duplicate function calls detected: {suspicious_duplicates}")

        return v

    @validator('chain_id')
    def validate_chain_id(cls, v):
        if v not in SecurityConfig.ALLOWED_CHAIN_IDS:
            security_logger.log_security_event("invalid_chain_id", {
                "attempted_chain_id": v,
                "allowed_chain_ids": list(SecurityConfig.ALLOWED_CHAIN_IDS)
            })
            raise ValueError(f"Unsupported chain ID: {v}")
        return v

    @validator('idempotency_key')
    def validate_idempotency_key(cls, v):
        if len(v) > SecurityConfig.MAX_IDEMPOTENCY_KEY_LENGTH:
            raise ValueError(f"Idempotency key too long: {len(v)} > {SecurityConfig.MAX_IDEMPOTENCY_KEY_LENGTH}")

        # Basic format validation - alphanumeric, dashes, underscores only
        import re
        if not re.match(r'^[a-zA-Z0-9_-]+$', v):
            raise ValueError("Idempotency key contains invalid characters")

        return v

# Rate limiting setup
def get_user_id_for_rate_limit(request: Request) -> str:
    """
    Get user identifier for rate limiting (supabase user_id if authenticated, IP otherwise)
    """
    # Try to get authenticated user
    try:
        auth_header = request.headers.get("authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:]
            # Extract user ID from token without full verification (for rate limiting only)
            from jose import jwt
            payload = jwt.get_unverified_claims(token)
            user_id = payload.get("sub")
            if user_id:
                return f"user:{user_id}"
    except Exception:
        pass

    # Fallback to IP address
    return f"ip:{get_remote_address(request)}"

# Enhanced rate limiting with blocklist integration
def enhanced_rate_limit_check(request: Request, user_id: str = None) -> str:
    """Enhanced rate limiting with blocklist and abuse detection"""
    client_ip = get_remote_address(request)

    # Check if IP is blocked
    if blocklist_manager.is_ip_blocked(client_ip):
        security_logger.log_security_event("blocked_ip_access_attempt", {"ip": client_ip})
        raise HTTPException(429, "IP address is temporarily blocked due to abuse")

    # Get user identifier for rate limiting
    rate_limit_id = user_id or get_user_id_for_rate_limit(request)

    # Check Smart Account blocklist if applicable
    if "aa:" in rate_limit_id:
        aa_address = rate_limit_id.split("aa:")[1]
        if blocklist_manager.is_aa_blocked(aa_address):
            security_logger.log_security_event("blocked_aa_access_attempt", {"aa_address": aa_address, "ip": client_ip})
            raise HTTPException(429, "Smart Account is temporarily blocked due to abuse")

    return rate_limit_id

# Abuse detection system
class AbuseDetector:
    """Detects and responds to abuse patterns"""

    def __init__(self):
        self.suspicious_patterns = defaultdict(lambda: {'count': 0, 'last_seen': 0})
        self.lock = threading.Lock()

    def detect_suspicious_activity(self, client_ip: str, pattern_type: str, details: dict = None) -> bool:
        """Detect suspicious activity patterns"""
        with self.lock:
            current_time = time.time()
            pattern_key = f"{client_ip}:{pattern_type}"

            # Reset count if last seen was more than 1 hour ago
            if current_time - self.suspicious_patterns[pattern_key]['last_seen'] > 3600:
                self.suspicious_patterns[pattern_key]['count'] = 0

            self.suspicious_patterns[pattern_key]['count'] += 1
            self.suspicious_patterns[pattern_key]['last_seen'] = current_time

            # Thresholds for different pattern types
            thresholds = {
                'validation_failure': 10,
                'rate_limit_hit': 5,
                'unauthorized_access': 3,
                'large_transaction': 2,
                'repeated_errors': 15
            }

            threshold = thresholds.get(pattern_type, 10)

            if self.suspicious_patterns[pattern_key]['count'] >= threshold:
                # Block the IP
                blocklist_manager.block_ip(client_ip, f"suspicious_pattern_{pattern_type}")
                security_logger.log_security_event("abuse_detected", {
                    "pattern_type": pattern_type,
                    "count": self.suspicious_patterns[pattern_key]['count'],
                    "details": details or {}
                }, client_ip)
                return True

            return False

abuse_detector = AbuseDetector()

# Idempotency key handling
idempotency_cache = {}
idempotency_cache_lock = threading.Lock()
IDEMPOTENCY_TTL = 86400  # 24 hours

class IdempotencyManager:
    @staticmethod
    def get_cache_key(user_id: str, idempotency_key: str) -> str:
        return f"idem:{user_id}:{idempotency_key}"

    @staticmethod
    def store_result(user_id: str, idempotency_key: str, result: dict):
        """Store result with TTL"""
        cache_key = IdempotencyManager.get_cache_key(user_id, idempotency_key)
        with idempotency_cache_lock:
            idempotency_cache[cache_key] = {
                "result": result,
                "timestamp": int(time.time())
            }

    @staticmethod
    def get_cached_result(user_id: str, idempotency_key: str) -> Optional[dict]:
        """Get cached result if not expired"""
        cache_key = IdempotencyManager.get_cache_key(user_id, idempotency_key)
        with idempotency_cache_lock:
            cached = idempotency_cache.get(cache_key)
            if cached:
                # Check if expired
                if int(time.time()) - cached["timestamp"] > IDEMPOTENCY_TTL:
                    del idempotency_cache[cache_key]
                    return None
                return cached["result"]
            return None

    @staticmethod
    def cleanup_expired():
        """Clean up expired entries"""
        current_time = int(time.time())
        with idempotency_cache_lock:
            expired_keys = [
                key for key, value in idempotency_cache.items()
                if current_time - value["timestamp"] > IDEMPOTENCY_TTL
            ]
            for key in expired_keys:
                del idempotency_cache[key]

# Cleanup expired idempotency entries every hour
def cleanup_idempotency_cache():
    while True:
        try:
            IdempotencyManager.cleanup_expired()
            time.sleep(3600)  # 1 hour
        except Exception as e:
            logger.error(f"Error cleaning up idempotency cache: {e}")
            time.sleep(3600)

cleanup_thread = threading.Thread(target=cleanup_idempotency_cache, daemon=True)
cleanup_thread.start()

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
        # Detect if this is repeated rate limit hitting
        abuse_detector.detect_suspicious_activity(client_ip, 'rate_limit_hit')
        security_logger.log_rate_limit_exceeded(f"ip:{client_ip}", client_ip)
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

# Health Check System
class ServiceHealth(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"

class ExternalServiceStatus(BaseModel):
    name: str
    status: ServiceHealth
    response_time_ms: Optional[float] = None
    last_check: int
    error: Optional[str] = None

class SystemHealth(BaseModel):
    overall_status: ServiceHealth
    timestamp: int
    services: List[ExternalServiceStatus]
    blocklist_status: Dict[str, Any]
    rate_limit_status: Dict[str, Any]

class Health(BaseModel):
    chain_id: int
    well: str
    name: str
    symbol: str
    decimals: int

class HealthChecker:
    """Enhanced health check system with graceful degradation for external dependencies"""

    def __init__(self):
        self.service_cache = {}
        self.cache_ttl = 30  # 30 seconds cache
        self.degraded_mode = False
        self.service_failures = defaultdict(int)  # Track consecutive failures
        self.last_check_time = {}
        self.check_timeout = 10  # seconds

    def _should_use_cache(self, service_name: str) -> bool:
        """Check if we should use cached result instead of making new check"""
        last_check = self.last_check_time.get(service_name, 0)
        return (time.time() - last_check) < self.cache_ttl

    def _cache_result(self, service_name: str, result: ExternalServiceStatus):
        """Cache health check result and update degraded mode"""
        self.service_cache[service_name] = result
        self.last_check_time[service_name] = time.time()

        # Track consecutive failures
        if result.status == ServiceHealth.UNHEALTHY:
            self.service_failures[service_name] += 1
        else:
            self.service_failures[service_name] = 0

        # Enable degraded mode if multiple services are failing
        unhealthy_services = sum(1 for count in self.service_failures.values() if count >= 3)
        previous_degraded = self.degraded_mode
        self.degraded_mode = unhealthy_services >= 2

        if self.degraded_mode != previous_degraded:
            security_logger.log_security_event("degraded_mode_change", {
                "degraded_mode": self.degraded_mode,
                "unhealthy_services": unhealthy_services,
                "service_failures": dict(self.service_failures)
            })

    async def check_rpc_health(self) -> ExternalServiceStatus:
        """Check RPC endpoint health with graceful degradation"""
        # Use cached result if available and recent
        if self._should_use_cache("rpc") and "rpc" in self.service_cache:
            return self.service_cache["rpc"]

        start_time = time.time()
        try:
            # Enhanced RPC health check with timeout
            latest_block = w3.eth.block_number
            latest_block_info = w3.eth.get_block('latest')
            block_time_diff = time.time() - latest_block_info.timestamp
            response_time = (time.time() - start_time) * 1000

            # Determine status based on response time and block freshness
            if response_time < 1000 and block_time_diff < 300:  # Less than 1s response, block within 5 min
                status = ServiceHealth.HEALTHY
            elif response_time < 5000 and block_time_diff < 600:  # Less than 5s response, block within 10 min
                status = ServiceHealth.DEGRADED
            else:
                status = ServiceHealth.DEGRADED

            result = ExternalServiceStatus(
                name="RPC_Provider",
                status=status,
                response_time_ms=response_time,
                last_check=int(time.time()),
                details={
                    "latest_block": latest_block,
                    "block_age_seconds": int(block_time_diff),
                    "degraded_mode": self.degraded_mode
                }
            )
        except Exception as e:
            response_time = (time.time() - start_time) * 1000
            result = ExternalServiceStatus(
                name="RPC_Provider",
                status=ServiceHealth.UNHEALTHY,
                response_time_ms=response_time,
                last_check=int(time.time()),
                error=str(e)[:200],
                details={"degraded_mode": self.degraded_mode}
            )
            logger.error(f"RPC health check failed: {e}")

        self._cache_result("rpc", result)
        return result

    async def check_bundler_health(self) -> ExternalServiceStatus:
        """Check Biconomy Bundler health"""
        if not BICONOMY_BUNDLER_URL:
            return ExternalServiceStatus(
                name="Biconomy_Bundler",
                status=ServiceHealth.UNHEALTHY,
                last_check=int(time.time()),
                error="Bundler URL not configured"
            )

        start_time = time.time()
        try:
            # Simple health check - just verify URL is reachable
            response = requests.get(f"{BICONOMY_BUNDLER_URL}/health", timeout=10)
            response_time = (time.time() - start_time) * 1000

            if response.status_code == 200:
                status = ServiceHealth.HEALTHY if response_time < 3000 else ServiceHealth.DEGRADED
            else:
                status = ServiceHealth.DEGRADED

            return ExternalServiceStatus(
                name="Biconomy_Bundler",
                status=status,
                response_time_ms=response_time,
                last_check=int(time.time())
            )
        except Exception as e:
            return ExternalServiceStatus(
                name="Biconomy_Bundler",
                status=ServiceHealth.UNHEALTHY,
                response_time_ms=(time.time() - start_time) * 1000,
                last_check=int(time.time()),
                error=str(e)[:200]
            )

    async def check_database_health(self) -> ExternalServiceStatus:
        """Check database connectivity"""
        start_time = time.time()
        try:
            session = db()
            # Simple query to check connectivity
            session.execute("SELECT 1")
            session.close()

            response_time = (time.time() - start_time) * 1000
            status = ServiceHealth.HEALTHY if response_time < 1000 else ServiceHealth.DEGRADED

            return ExternalServiceStatus(
                name="Database",
                status=status,
                response_time_ms=response_time,
                last_check=int(time.time())
            )
        except Exception as e:
            return ExternalServiceStatus(
                name="Database",
                status=ServiceHealth.UNHEALTHY,
                response_time_ms=(time.time() - start_time) * 1000,
                last_check=int(time.time()),
                error=str(e)[:200]
            )

    async def check_token_contract_health(self) -> ExternalServiceStatus:
        """Check WELL token contract health"""
        start_time = time.time()
        try:
            # Check if we can read basic token info
            name = token.functions.name().call()
            symbol = token.functions.symbol().call()
            decimals = token.functions.decimals().call()

            response_time = (time.time() - start_time) * 1000
            status = ServiceHealth.HEALTHY if response_time < 2000 else ServiceHealth.DEGRADED

            return ExternalServiceStatus(
                name="WELL_Token_Contract",
                status=status,
                response_time_ms=response_time,
                last_check=int(time.time())
            )
        except Exception as e:
            return ExternalServiceStatus(
                name="WELL_Token_Contract",
                status=ServiceHealth.UNHEALTHY,
                response_time_ms=(time.time() - start_time) * 1000,
                last_check=int(time.time()),
                error=str(e)[:200]
            )

    async def get_system_health(self) -> SystemHealth:
        """Get comprehensive system health status"""
        # Check all services concurrently
        health_checks = await asyncio.gather(
            self.check_rpc_health(),
            self.check_bundler_health(),
            self.check_database_health(),
            self.check_token_contract_health(),
            return_exceptions=True
        )

        # Filter out exceptions and create service status list
        services = []
        for check in health_checks:
            if isinstance(check, ExternalServiceStatus):
                services.append(check)
            else:
                # Handle exception case
                services.append(ExternalServiceStatus(
                    name="Unknown_Service",
                    status=ServiceHealth.UNHEALTHY,
                    last_check=int(time.time()),
                    error="Health check failed"
                ))

        # Determine overall status
        unhealthy_count = sum(1 for s in services if s.status == ServiceHealth.UNHEALTHY)
        degraded_count = sum(1 for s in services if s.status == ServiceHealth.DEGRADED)

        if unhealthy_count > 0:
            overall_status = ServiceHealth.UNHEALTHY
        elif degraded_count > 1:  # More than 1 degraded service = overall degraded
            overall_status = ServiceHealth.DEGRADED
        else:
            overall_status = ServiceHealth.HEALTHY

        return SystemHealth(
            overall_status=overall_status,
            timestamp=int(time.time()),
            services=services,
            blocklist_status=blocklist_manager.get_blocklist_status(),
            rate_limit_status={
                "active_rate_limits": len(rate_limits),
                "idempotency_cache_size": len(idempotency_cache)
            }
        )

health_checker = HealthChecker()

# ERC-4337 Smart Account Models
class SmartAccountRequest(BaseModel):
    signer_address: str
    chain_id: int = 80002
    ts: int
    sig: str

class BatchTransactionCall(BaseModel):
    to: str
    data: str
    value: Optional[str] = "0"

class BatchExecuteRequest(BaseModel):
    smart_account_address: str
    calls: List[BatchTransactionCall]
    chain_id: int = 80002
    ts: int
    sig: str

class SmartAccountResponse(BaseModel):
    smart_account_address: str
    signer_address: str
    chain_id: int

class BatchExecuteResponse(BaseModel):
    user_op_hash: str
    transaction_hash: Optional[str]
    success: bool
    error: Optional[str]

# New models for /aa/send and /aa/status endpoints
class AASendIntentRequest(BaseModel):
    """Intent mode: simplified parameters for common operations"""
    amount: float
    beneficiary: str
    aa_address: str
    idempotency_key: str
    chain_id: int = 80002

class AASendCalldataRequest(BaseModel):
    """Calldata mode: raw transaction calls"""
    calls: List[BatchTransactionCall]
    aa_address: str
    idempotency_key: str
    chain_id: int = 80002

# Union type for flexible request handling
from typing import Union
AASendRequest = Union[ValidatedAASendIntentRequest, ValidatedAASendCalldataRequest]

class AASendResponse(BaseModel):
    user_op_hash: str

class AAStatusResponse(BaseModel):
    status: str  # "pending", "success", "failed", "reverted"
    entry_point_tx_hash: Optional[str] = None
    revert_reason: Optional[str] = None

class WellnessRedeemBody(BaseModel):
    """Enhanced redemption request with comprehensive validation"""
    smart_account_address: str = Field(..., description="Smart Account address")
    amount: float = Field(..., gt=0, le=100000, description="Amount to redeem in WELL units")
    reward_id: str = Field(..., min_length=1, max_length=128, description="Reward identifier")
    ts: int = Field(..., description="Timestamp")
    sig: str = Field(..., min_length=10, max_length=256, description="HMAC signature")

    @validator('smart_account_address')
    def validate_smart_account_address(cls, v):
        try:
            checksum_addr = Web3.to_checksum_address(v)
            # Log redemption attempt for monitoring
            security_logger.log_security_event("redemption_attempt", {
                "aa_address": SecurityLogger.sanitize_address(checksum_addr)
            })
            return checksum_addr
        except Exception:
            raise ValueError("Invalid Smart Account address format")

    @validator('amount')
    def validate_amount_limits(cls, v):
        max_redeem = SecurityConfig.MAX_REDEEM_AMOUNT / (10 ** 18)
        if v > max_redeem:
            raise ValueError(f"Redemption amount exceeds maximum: {max_redeem}")
        return v

    @validator('reward_id')
    def validate_reward_id_format(cls, v):
        import re
        # Allow alphanumeric, dashes, underscores only
        if not re.match(r'^[a-zA-Z0-9_-]+$', v):
            raise ValueError("Reward ID contains invalid characters")
        return v

    @validator('ts')
    def validate_timestamp_freshness(cls, v):
        current_time = int(time.time())
        if abs(current_time - v) > 300:  # 5 minute window
            raise ValueError("Timestamp too old or too far in future")
        return v

@router.get("/health", response_model=Health)
def health():
    """Basic health endpoint for backwards compatibility"""
    try:
        return Health(
            chain_id=w3.eth.chain_id,
            well=WELL,
            name=token.functions.name().call(),
            symbol=token.functions.symbol().call(),
            decimals=decimals,
        )
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(503, f"Service unhealthy: {str(e)}")

@router.get("/health/detailed", response_model=SystemHealth)
async def detailed_health():
    """Comprehensive health check with external service monitoring"""
    try:
        system_health = await health_checker.get_system_health()

        # Log unhealthy services
        unhealthy_services = [s for s in system_health.services if s.status == ServiceHealth.UNHEALTHY]
        if unhealthy_services:
            service_names = [s.name for s in unhealthy_services]
            security_logger.log_security_event("unhealthy_services_detected", {"services": service_names})

        return system_health
    except Exception as e:
        logger.error(f"Detailed health check failed: {e}")
        raise HTTPException(503, f"Health check system failed: {str(e)}")

@router.get("/health/security")
async def security_health():
    """Security-focused health endpoint"""
    try:
        blocklist_status = blocklist_manager.get_blocklist_status()

        # Get rate limiting stats
        current_time = time.time()
        active_rate_limits = 0
        for ip, requests in rate_limits.items():
            # Count requests in the last minute
            recent_requests = [r for r in requests if r > current_time - 60]
            if len(recent_requests) > 0:
                active_rate_limits += 1

        return {
            "blocklist_status": blocklist_status,
            "rate_limiting": {
                "active_rate_limited_ips": active_rate_limits,
                "total_tracked_ips": len(rate_limits),
                "idempotency_cache_size": len(idempotency_cache)
            },
            "security_config": {
                "allowlisted_tokens": len(SecurityConfig.ALLOWLISTED_TOKENS),
                "allowlisted_redeemers": len(SecurityConfig.ALLOWLISTED_REDEEMERS),
                "allowlisted_selectors": len(SecurityConfig.ALLOWLISTED_FUNCTION_SELECTORS)
            },
            "timestamp": int(time.time())
        }
    except Exception as e:
        logger.error(f"Security health check failed: {e}")
        raise HTTPException(503, f"Security health check failed: {str(e)}")

@router.get("/balance/{address}")
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

@router.post("/mint")
def mint_tokens(body: MintBody, request: Request):
    client_ip = request.client.host if request.client else "unknown"

    # Enhanced security checks
    try:
        enhanced_rate_limit_check(request)
    except HTTPException as e:
        abuse_detector.detect_suspicious_activity(client_ip, 'rate_limit_hit')
        raise e

    logger.info(f"Mint request from {client_ip}: {SecurityLogger.sanitize_address(body.to)} for {body.amount} WELL")

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
        abuse_detector.detect_suspicious_activity(client_ip, 'validation_failure', {'type': 'invalid_signature'})
        security_logger.log_validation_failure("signature_validation", "Invalid HMAC signature", client_ip)
        raise HTTPException(401, "bad signature")

    # Validate recipient address early
    try:
        to_addr = Web3.to_checksum_address(body.to)
        logger.debug(f"Validated recipient address: {SecurityLogger.sanitize_address(to_addr)}")
    except Exception as e:
        abuse_detector.detect_suspicious_activity(client_ip, 'validation_failure', {'type': 'invalid_address'})
        security_logger.log_validation_failure("address_validation", f"Invalid address format: {str(e)}", client_ip)
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
            logger.info(f"Mint successful: {h} - {body.amount} WELL to {SecurityLogger.sanitize_address(to_addr)}")

            # Log successful transaction for monitoring
            security_logger.log_security_event("successful_mint", {
                "amount": body.amount,
                "to_address": to_addr,
                "tx_hash": h
            }, client_ip)

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

            # Log transaction failure for monitoring
            security_logger.log_security_event("mint_transaction_failed", {
                "error": str(e)[:200],
                "amount": body.amount,
                "to_address": body.to
            }, client_ip)

            # Detect repeated transaction failures
            abuse_detector.detect_suspicious_activity(client_ip, 'repeated_errors', {'error_type': 'transaction_failure'})

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

@router.post("/mint_via_minter")
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

@router.post("/mint_gasless")
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

# --- ERC-4337 Smart Account System ---

@router.post("/aa/get-smart-account", response_model=SmartAccountResponse)
async def get_smart_account_address(request: SmartAccountRequest, http_request: Request):
    """
    Get smart account address for a given signer using Biconomy
    """
    if not (BICONOMY_BUNDLER_URL and BICONOMY_PAYMASTER_API_KEY):
        raise HTTPException(503, "ERC-4337 disabled: BICONOMY configuration missing")

    client_ip = http_request.client.host if http_request.client else "unknown"
    logger.info(f"Smart Account request from {client_ip}: {request.signer_address}")

    # Security checks (freshness + HMAC + rate-limit + idempotency)
    now = int(time.time())
    if abs(now - request.ts) > 60:
        logger.warning(f"Stale smart account request from {client_ip}")
        raise HTTPException(400, "stale request (>60s)")

    raw = f"{request.signer_address}|{request.chain_id}|{request.ts}"
    if not verify_sig(raw, request.sig):
        logger.warning(f"Invalid smart account signature from {client_ip}")
        raise HTTPException(401, "bad signature")

    enforce_rate_limit(client_ip)
    check_idempotent(raw)

    try:
        # Execute via Node.js script to get deterministic smart account address
        aa_test_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "aa-test")

        # Create temporary signer data
        signer_data = {
            "signerAddress": request.signer_address,
            "chainId": request.chain_id
        }

        signer_file = os.path.join(aa_test_dir, "temp_signer.json")
        with open(signer_file, "w") as f:
            json.dump(signer_data, f)

        # Execute Node.js script to get smart account address
        result = subprocess.run(
            ["node", "-e", f"""
                import {{ createSmartAccountClient }} from '@biconomy/account';
                import {{ ethers }} from 'ethers';
                import dotenv from 'dotenv';
                import fs from 'fs';

                dotenv.config();

                async function getSmartAccount() {{
                    try {{
                        const data = JSON.parse(fs.readFileSync('{signer_file}', 'utf8'));

                        // Create a dummy signer for address generation
                        const provider = new ethers.JsonRpcProvider(process.env.AMOY_RPC_URL);
                        const wallet = ethers.Wallet.createRandom();
                        const signer = wallet.connect(provider);

                        const smartAccount = await createSmartAccountClient({{
                            signer,
                            chainId: data.chainId,
                            bundlerUrl: process.env.BICONOMY_BUNDLER_URL,
                            biconomyPaymasterApiKey: process.env.BICONOMY_PAYMASTER_API_KEY,
                        }});

                        const address = await smartAccount.getAccountAddress();
                        console.log(`SmartAccount:${{address}}`);
                    }} catch (error) {{
                        console.error('Error:', error.message);
                        process.exit(1);
                    }}
                }}

                getSmartAccount();
            """],
            cwd=aa_test_dir,
            capture_output=True,
            text=True,
            timeout=30
        )

        # Clean up temp file
        try:
            os.remove(signer_file)
        except:
            pass

        if result.returncode == 0:
            for line in result.stdout.strip().split('\n'):
                if line.startswith("SmartAccount:"):
                    smart_account_address = line.split("SmartAccount:")[1].strip()
                    logger.info(f"Smart Account created: {smart_account_address} for signer: {request.signer_address}")

                    return SmartAccountResponse(
                        smart_account_address=smart_account_address,
                        signer_address=request.signer_address,
                        chain_id=request.chain_id
                    )

            raise HTTPException(500, "Failed to parse smart account address from response")
        else:
            error_msg = result.stderr or result.stdout
            logger.error(f"Smart account creation failed: {error_msg}")
            raise HTTPException(500, f"Smart account creation failed: {error_msg}")

    except subprocess.TimeoutExpired:
        raise HTTPException(408, "Smart account creation timeout")
    except Exception as e:
        logger.error(f"Smart account creation error: {e}")
        raise HTTPException(500, f"Smart account creation failed: {str(e)}")

@router.post("/aa/execute-batch", response_model=BatchExecuteResponse)
async def execute_batch_transaction(request: BatchExecuteRequest, http_request: Request):
    """
    Execute a batch of transactions via ERC-4337 UserOperation
    """
    if not (BICONOMY_BUNDLER_URL and BICONOMY_PAYMASTER_API_KEY):
        raise HTTPException(503, "ERC-4337 disabled: BICONOMY configuration missing")

    client_ip = http_request.client.host if http_request.client else "unknown"
    logger.info(f"Batch execute request from {client_ip}: {request.smart_account_address}")

    # Security checks (freshness + HMAC + rate-limit + idempotency)
    now = int(time.time())
    if abs(now - request.ts) > 60:
        logger.warning(f"Stale batch request from {client_ip}")
        raise HTTPException(400, "stale request (>60s)")

    # Create signature data from request
    calls_str = "|".join([f"{call.to}:{call.data}:{call.value}" for call in request.calls])
    raw = f"{request.smart_account_address}|{calls_str}|{request.chain_id}|{request.ts}"
    if not verify_sig(raw, request.sig):
        logger.warning(f"Invalid batch signature from {client_ip}")
        raise HTTPException(401, "bad signature")

    enforce_rate_limit(client_ip)
    check_idempotent(raw)

    try:
        # Get the directory of the Node.js AA test scripts
        aa_test_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "aa-test")

        # Prepare the batch transaction data
        batch_data = {
            "smartAccountAddress": request.smart_account_address,
            "calls": [call.dict() for call in request.calls],
            "chainId": request.chain_id
        }

        # Write batch data to temporary file
        batch_file = os.path.join(aa_test_dir, "temp_batch.json")
        with open(batch_file, "w") as f:
            json.dump(batch_data, f)

        # Execute via dedicated Node.js script
        result = subprocess.run(
            ["node", "execute-batch-from-api.js", batch_file],
            cwd=aa_test_dir,
            capture_output=True,
            text=True,
            timeout=120
        )

        # Clean up temp file
        try:
            os.remove(batch_file)
        except:
            pass

        if result.returncode == 0:
            # Parse result from Node.js script
            output_lines = result.stdout.strip().split('\n')
            user_op_hash = None
            transaction_hash = None
            success = False

            for line in output_lines:
                if line.startswith("UserOpHash:"):
                    user_op_hash = line.split("UserOpHash:")[1].strip()
                elif line.startswith("TransactionHash:"):
                    transaction_hash = line.split("TransactionHash:")[1].strip()
                elif line == "SUCCESS":
                    success = True

            logger.info(f"Batch transaction executed: UserOp={user_op_hash}, Tx={transaction_hash}, Success={success}")

            return BatchExecuteResponse(
                user_op_hash=user_op_hash or "",
                transaction_hash=transaction_hash,
                success=success,
                error=None
            )
        else:
            error_msg = result.stderr or result.stdout
            logger.error(f"Batch execution failed: {error_msg}")
            return BatchExecuteResponse(
                user_op_hash="",
                transaction_hash=None,
                success=False,
                error=f"Batch execution failed: {error_msg}"
            )

    except subprocess.TimeoutExpired:
        return BatchExecuteResponse(
            user_op_hash="",
            transaction_hash=None,
            success=False,
            error="Batch execution timeout"
        )
    except Exception as e:
        logger.error(f"Batch execution error: {e}")
        return BatchExecuteResponse(
            user_op_hash="",
            transaction_hash=None,
            success=False,
            error=f"Execution error: {str(e)}"
        )

def encode_approve_call(spender: str, amount: str) -> str:
    """Encode ERC-20 approve function call"""
    # approve(address,uint256) = 0x095ea7b3
    function_selector = "095ea7b3"
    spender_padded = spender[2:].lower().ljust(64, '0')
    amount_hex = hex(int(amount))[2:].rjust(64, '0')
    return f"0x{function_selector}{spender_padded}{amount_hex}"

def encode_redeem_call(reward_id: str, amount: str) -> str:
    """Encode redemption function call using ethers ABI encoding"""
    # For production, use proper ABI encoding
    # This is a simplified version - in practice, use the actual contract ABI
    from web3 import Web3

    # redeem(string,uint256) function selector
    function_selector = "0x6c83cb85"  # This should be calculated from the actual ABI

    # For now, return a placeholder that the Node.js script will handle
    return f"redeem_placeholder_{reward_id}_{amount}"

@router.post("/aa/wellness-redeem")
async def aa_wellness_redeem(body: WellnessRedeemBody, http_request: Request):
    """
    Wellness-specific endpoint: Execute approve + redeem batch via Smart Account
    """
    if not (BICONOMY_BUNDLER_URL and BICONOMY_PAYMASTER_API_KEY and REDEMPTION_ADDRESS):
        raise HTTPException(503, "ERC-4337 wellness redeem disabled: missing configuration")

    client_ip = http_request.client.host if http_request.client else "unknown"
    logger.info(f"Wellness redeem request from {client_ip}: {body.amount} WELL for {body.reward_id}")

    # Security checks (freshness + HMAC + rate-limit + idempotency)
    now = int(time.time())
    if abs(now - body.ts) > 60:
        logger.warning(f"Stale wellness redeem request from {client_ip}")
        raise HTTPException(400, "stale request (>60s)")

    raw = f"{body.smart_account_address}|{body.amount}|{body.reward_id}|{body.ts}"
    if not verify_sig(raw, body.sig):
        logger.warning(f"Invalid wellness redeem signature from {client_ip}")
        raise HTTPException(401, "bad signature")

    enforce_rate_limit(client_ip)
    check_idempotent(raw)

    try:
        # Validate inputs
        if not all([body.smart_account_address, body.amount > 0, body.reward_id]):
            raise HTTPException(400, "Missing required parameters: smart_account_address, amount, reward_id")

        # Convert amount to wei
        amount_wei = int(body.amount * (10 ** decimals))

        # Create batch calls for approve + redeem using actual contract encodings
        # The Node.js script will handle the proper ABI encoding
        calls = [
            BatchTransactionCall(
                to=WELL,
                data=f"approve_{REDEMPTION_ADDRESS}_{amount_wei}"
            ),
            BatchTransactionCall(
                to=REDEMPTION_ADDRESS,
                data=f"redeem_{body.reward_id}_{amount_wei}"
            )
        ]

        # Execute batch
        batch_request = BatchExecuteRequest(
            smart_account_address=body.smart_account_address,
            calls=calls,
            chain_id=80002,
            ts=body.ts,
            sig=body.sig
        )

        result = await execute_batch_transaction(batch_request)

        return {
            "method": "ERC-4337-SmartAccount",
            "user_op_hash": result.user_op_hash,
            "transaction_hash": result.transaction_hash,
            "success": result.success,
            "amount": body.amount,
            "reward_id": body.reward_id,
            "explorer": f"https://amoy.polygonscan.com/tx/{result.transaction_hash}" if result.transaction_hash else None,
            "error": result.error
        }

    except Exception as e:
        logger.error(f"Wellness redeem failed: {e}")
        raise HTTPException(500, f"Wellness redeem failed: {str(e)}")

# --- Achievement System: /award endpoint ---

class AwardBody(BaseModel):
    to: str
    id: int
    amount: int
    ts: int
    sig: str

@router.post("/award")
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

@router.post("/redeem")
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
from sqlalchemy import create_engine, Column, String, BigInteger, Text, ForeignKey, Enum, Integer, DateTime, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from datetime import datetime, timezone
import os

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

class User(Base):
    __tablename__ = "users"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=True)
    password_hash = Column(String(256), nullable=True)  # For traditional auth
    avatar_url = Column(String(512), nullable=True)
    created_at = Column(BigInteger, nullable=False)
    updated_at = Column(BigInteger, nullable=True)

    # Relationship to accounts
    accounts = relationship("Account", back_populates="user")

class Account(Base):
    __tablename__ = "accounts"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    aa_address = Column(String(42), unique=True, nullable=False, index=True)
    type = Column(Enum("social", "wallet", name="account_type"), nullable=False)
    created_at = Column(BigInteger, nullable=False)

    # Relationship to user
    user = relationship("User", back_populates="accounts")

class UserOperation(Base):
    __tablename__ = "user_operations"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_op_hash = Column(String(66), unique=True, nullable=False, index=True)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    aa_address = Column(String(42), nullable=False, index=True)
    status = Column(Enum("pending", "success", "failed", "reverted", name="userop_status"), nullable=False, default="pending")
    entry_point_tx_hash = Column(String(66), nullable=True)
    revert_reason = Column(Text, nullable=True)
    calls_data = Column(Text, nullable=False)  # JSON string of the calls
    chain_id = Column(BigInteger, nullable=False, default=80002)
    created_at = Column(BigInteger, nullable=False)
    updated_at = Column(BigInteger, nullable=False)

    # Relationship to user
    user = relationship("User")

class Challenge(Base):
    __tablename__ = "wellness_challenges"  # Use different table name to avoid conflict
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    description = Column(Text, nullable=False)
    duration_minutes = Column(Integer, nullable=False)  # For time-based challenges
    points_reward = Column(Integer, nullable=False, default=100)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(BigInteger, nullable=False)

class UserChallenge(Base):
    __tablename__ = "user_challenges"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    challenge_id = Column(Integer, ForeignKey("wellness_challenges.id"), nullable=False)
    date = Column(String(10), nullable=False)  # YYYY-MM-DD format
    status = Column(Enum("not_started", "in_progress", "completed", "failed", name="challenge_status"), nullable=False, default="not_started")
    started_at = Column(BigInteger, nullable=True)
    completed_at = Column(BigInteger, nullable=True)

    # Relationships
    user = relationship("User")
    challenge = relationship("Challenge")

class UserPoints(Base):
    __tablename__ = "user_points"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False, unique=True)
    total_points = Column(BigInteger, nullable=False, default=0)
    earned_today = Column(BigInteger, nullable=False, default=0)
    last_updated = Column(BigInteger, nullable=False)
    last_daily_reset = Column(String(10), nullable=False)  # YYYY-MM-DD format

    # Relationship
    user = relationship("User")

def db():
    return SessionLocal()

def init_database():
    """Initialize database tables"""
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise

# Initialize database on startup
init_database()

# --- Authentication and Account Management Endpoints ---

class CreateAccountRequest(BaseModel):
    aa_address: str
    type: str = "social"  # "social" or "wallet"

class AccountResponse(BaseModel):
    id: int
    aa_address: str
    type: str
    created_at: int

class UserProfileResponse(BaseModel):
    user_id: str  # Supabase user ID instead of particle_user_id
    email: Optional[str]
    accounts: List[AccountResponse]
    created_at: int

@router.get("/auth/profile", response_model=UserProfileResponse)
async def get_user_profile(user: dict = Depends(get_authenticated_user)):
    """
    Get authenticated user's profile and Smart Account addresses
    """
    session = db()
    try:
        user_id = user["sub"]
        db_user = session.query(User).filter(User.id == user_id).first()
        if not db_user:
            # Create user if not exists
            db_user = User(
                id=user_id,
                email=user.get("email", ""),
                created_at=int(time.time()),
                updated_at=int(time.time())
            )
            session.add(db_user)
            session.commit()

        accounts = session.query(Account).filter(Account.user_id == db_user.id).all()
        account_responses = [
            AccountResponse(
                id=account.id,
                aa_address=account.address,
                type=account.account_type,
                created_at=account.created_at
            ) for account in accounts
        ]

        return UserProfileResponse(
            user_id=user_id,  # Using Supabase user ID
            email=db_user.email,
            accounts=account_responses,
            created_at=db_user.created_at
        )
    finally:
        session.close()

@router.post("/auth/accounts", response_model=AccountResponse)
async def create_account(
    request: CreateAccountRequest,
    user: dict = Depends(get_authenticated_user)
):
    """
    Link a new Smart Account address to the authenticated user
    """
    # Validate account type
    if request.type not in ["social", "wallet"]:
        raise HTTPException(400, "Account type must be 'social' or 'wallet'")

    # Validate Ethereum address format
    try:
        aa_address = Web3.to_checksum_address(request.aa_address)
    except Exception:
        raise HTTPException(400, "Invalid Smart Account address format")

    session = db()
    try:
        # Check if account already exists
        existing = session.query(Account).filter(Account.aa_address == aa_address).first()
        if existing:
            raise HTTPException(409, "Smart Account address already linked to a user")

        # Get user from database using Supabase user ID
        user_id = user["sub"]
        db_user = session.query(User).filter(User.id == user_id).first()
        if not db_user:
            # Create user if not exists
            db_user = User(
                id=user_id,
                email=user.get("email", ""),
                created_at=int(time.time()),
                updated_at=int(time.time())
            )
            session.add(db_user)
            session.commit()
            logger.info(f"Created new blockchain user for Supabase ID: {user_id}")

        # Create new account
        new_account = Account(
            user_id=db_user.id,
            aa_address=aa_address,
            account_type=request.type,
            created_at=int(time.time())
        )
        session.add(new_account)
        session.commit()

        logger.info(f"Linked Smart Account {aa_address} to user {user_id}")

        return AccountResponse(
            id=new_account.id,
            aa_address=new_account.aa_address,
            type=new_account.type,
            created_at=new_account.created_at
        )

    except HTTPException:
        session.rollback()
        raise
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to create account: {e}")
        raise HTTPException(500, "Failed to link Smart Account")
    finally:
        session.close()

@router.delete("/auth/accounts/{aa_address}")
async def remove_account(
    aa_address: str,
    user: dict = Depends(get_authenticated_user)
):
    """
    Remove a Smart Account address from the authenticated user
    """
    try:
        aa_address = Web3.to_checksum_address(aa_address)
    except Exception:
        raise HTTPException(400, "Invalid Smart Account address format")

    session = db()
    try:
        # Get user from database
        user_id = user["sub"]
        db_user = session.query(User).filter(User.id == user_id).first()
        if not db_user:
            raise HTTPException(404, "User not found")

        # Find and remove account
        account = session.query(Account).filter(
            Account.user_id == db_user.id,
            Account.address == aa_address
        ).first()

        if not account:
            raise HTTPException(404, "Smart Account not found or not owned by user")

        session.delete(account)
        session.commit()

        logger.info(f"Removed Smart Account {aa_address} from user {user['sub']}")

        return {"message": "Smart Account removed successfully"}

    except HTTPException:
        session.rollback()
        raise
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to remove account: {e}")
        raise HTTPException(500, "Failed to remove Smart Account")
    finally:
        session.close()

# --- ERC-4337 Protected Endpoints with Supabase JWT ---

async def convert_intent_to_calls(intent: AASendIntentRequest) -> List[BatchTransactionCall]:
    """
    Convert intent mode request to batch transaction calls
    """
    try:
        # Validate beneficiary address
        beneficiary = Web3.to_checksum_address(intent.beneficiary)

        # Convert amount to wei
        amount_wei = int(intent.amount * (10 ** decimals))

        # Get redemption system address (REDEEMER)
        redeemer_address = REDEMPTION_ADDRESS
        if not redeemer_address:
            raise HTTPException(503, "Redemption system not configured")

        # Create batch calls for approve + redeem
        calls = [
            # 1. Approve WELL tokens to RedemptionSystem
            BatchTransactionCall(
                to=WELL,
                data=encode_approve_call(redeemer_address, str(amount_wei)),
                value="0"
            ),
            # 2. Redeem WELL tokens
            BatchTransactionCall(
                to=redeemer_address,
                data=encode_redeem_call(beneficiary, str(amount_wei)),
                value="0"
            )
        ]

        return calls

    except Exception as e:
        logger.error(f"Failed to convert intent to calls: {e}")
        raise HTTPException(400, f"Invalid intent parameters: {str(e)}")

def encode_approve_call(spender: str, amount: str) -> str:
    """Encode ERC-20 approve function call"""
    # approve(address,uint256) = 0x095ea7b3
    function_selector = "095ea7b3"
    spender_padded = spender[2:].lower().rjust(64, '0')
    amount_hex = hex(int(amount))[2:].rjust(64, '0')
    return f"0x{function_selector}{spender_padded}{amount_hex}"

def encode_redeem_call(beneficiary: str, amount: str) -> str:
    """Encode redeem function call - simplified for wellness redemption"""
    # For now, we'll use a placeholder - in production, this needs proper ABI encoding
    # This would typically use the RedemptionSystem's redeem function signature
    return f"redeem_encoded_{beneficiary}_{amount}"

@router.post("/aa/send", response_model=AASendResponse)
@limiter.limit("10/minute")  # Rate limit: 10 requests per minute per user
async def aa_send_transaction(
    request_data: dict,
    request: Request,
    user: dict = Depends(get_authenticated_user)
):
    """
    Send a UserOperation via ERC-4337 Smart Account with Supabase JWT protection
    Supports both Intent mode and Calldata mode with enhanced security validation
    """
    client_ip = get_remote_address(request)

    if not (BICONOMY_BUNDLER_URL and BICONOMY_PAYMASTER_API_KEY):
        raise HTTPException(503, "ERC-4337 disabled: BICONOMY configuration missing")

    # Enhanced security checks
    try:
        rate_limit_id = enhanced_rate_limit_check(request, f"user:{user['sub']}")
    except HTTPException as e:
        abuse_detector.detect_suspicious_activity(client_ip, 'rate_limit_hit')
        raise e

    # Parse and validate request with enhanced Pydantic models
    try:
        if "amount" in request_data and "beneficiary" in request_data:
            # Intent mode with strict validation
            parsed_request = ValidatedAASendIntentRequest(**request_data)
            mode = "intent"
        elif "calls" in request_data:
            # Calldata mode with strict validation
            parsed_request = ValidatedAASendCalldataRequest(**request_data)
            mode = "calldata"
        else:
            abuse_detector.detect_suspicious_activity(client_ip, 'validation_failure', {'type': 'invalid_request_format'})
            raise HTTPException(400, "Invalid request format. Use either intent mode (amount, beneficiary) or calldata mode (calls)")
    except ValidationError as e:
        # Log validation failure with details
        error_details = str(e)[:500]
        abuse_detector.detect_suspicious_activity(client_ip, 'validation_failure', {'type': 'pydantic_validation', 'errors': error_details})
        security_logger.log_validation_failure(f"aa_send_{mode}_validation", error_details, client_ip)
        raise HTTPException(400, f"Request validation failed: {error_details}")
    except Exception as e:
        abuse_detector.detect_suspicious_activity(client_ip, 'validation_failure', {'type': 'request_parsing'})
        security_logger.log_validation_failure("aa_send_parsing", str(e)[:200], client_ip)
        raise HTTPException(400, f"Invalid request format: {str(e)}")

    # Log request with sanitized data
    security_logger.log_security_event(f"aa_send_{mode}_request", {
        "aa_address": parsed_request.aa_address,
        "user_id": user["sub"][:8] + "..." if user.get("sub") else "unknown",
        "amount": getattr(parsed_request, 'amount', None),
        "calls_count": len(getattr(parsed_request, 'calls', []))
    }, client_ip)

    logger.info(f"AA Send {mode} request from user {user['sub'][:8]}...: {SecurityLogger.sanitize_address(parsed_request.aa_address)}")

    # Check idempotency
    cached_result = IdempotencyManager.get_cached_result(user["sub"], parsed_request.idempotency_key)
    if cached_result:
        logger.info(f"Returning cached result for idempotency key {parsed_request.idempotency_key}")
        return cached_result

    # Verify that the authenticated user owns the specified Smart Account
    if not verify_aa_ownership(user, parsed_request.aa_address):
        # This is a serious security violation - block the user
        abuse_detector.detect_suspicious_activity(client_ip, 'unauthorized_access', {
            'attempted_aa': parsed_request.aa_address,
            'user_id': user["sub"]
        })
        security_logger.log_security_event("unauthorized_aa_access_attempt", {
            "attempted_aa": parsed_request.aa_address,
            "user_id": user["sub"],
            "owned_addresses": []  # Will be fetched from database if needed
        }, client_ip)
        logger.warning(f"User {user['sub'][:8]}... attempted to use unauthorized AA: {SecurityLogger.sanitize_address(parsed_request.aa_address)}")
        raise HTTPException(403, "Smart Account address not owned by authenticated user")

    # Convert intent to calls if needed
    if mode == "intent":
        calls = await convert_intent_to_calls(parsed_request)
    else:
        calls = parsed_request.calls
        # Validate inputs
        if not calls or len(calls) == 0:
            raise HTTPException(400, "At least one call is required")

    try:
        # Get the directory of the Node.js AA test scripts
        aa_test_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "aa-test")

        # Prepare the batch transaction data
        batch_data = {
            "smartAccountAddress": parsed_request.aa_address,
            "calls": [call.dict() for call in calls],
            "chainId": parsed_request.chain_id
        }

        # Write batch data to temporary file
        batch_file = os.path.join(aa_test_dir, "temp_batch.json")
        with open(batch_file, "w") as f:
            json.dump(batch_data, f)

        # Execute via dedicated Node.js script
        result = subprocess.run(
            ["node", "execute-batch-from-api.js", batch_file],
            cwd=aa_test_dir,
            capture_output=True,
            text=True,
            timeout=120
        )

        # Clean up temp file
        try:
            os.remove(batch_file)
        except:
            pass

        if result.returncode == 0:
            # Parse result from Node.js script
            output_lines = result.stdout.strip().split('\n')
            user_op_hash = None
            transaction_hash = None
            success = False

            for line in output_lines:
                if line.startswith("UserOpHash:"):
                    user_op_hash = line.split("UserOpHash:")[1].strip()
                elif line.startswith("TransactionHash:"):
                    transaction_hash = line.split("TransactionHash:")[1].strip()
                elif line == "SUCCESS":
                    success = True

            if not user_op_hash:
                raise HTTPException(500, "Failed to extract UserOperation hash from response")

            # Store UserOperation in database for tracking
            session = db()
            try:
                user_op = UserOperation(
                    user_op_hash=user_op_hash,
                    user_id=user.user_id,
                    aa_address=parsed_request.aa_address,
                    status="pending" if not success else "success",
                    entry_point_tx_hash=transaction_hash if success else None,
                    calls_data=json.dumps([call.dict() for call in calls]),
                    chain_id=parsed_request.chain_id,
                    created_at=int(time.time()),
                    updated_at=int(time.time())
                )
                session.add(user_op)
                session.commit()
                logger.info(f"UserOperation tracked: {user_op_hash} for user {user['sub']}")
            except Exception as db_error:
                session.rollback()
                logger.error(f"Failed to store UserOperation: {db_error}")
                # Don't fail the request if database storage fails
            finally:
                session.close()

            # Create response and cache for idempotency
            response = {"user_op_hash": user_op_hash}
            IdempotencyManager.store_result(user["sub"], parsed_request.idempotency_key, response)

            # Log successful transaction
            security_logger.log_security_event("aa_send_successful", {
                "user_op_hash": user_op_hash,
                "mode": mode,
                "success": success,
                "aa_address": parsed_request.aa_address
            }, client_ip)

            logger.info(f"AA Send successful: UserOp={user_op_hash}, Success={success}")
            return response

        else:
            error_msg = result.stderr or result.stdout

            # Log execution failure
            security_logger.log_security_event("aa_send_execution_failed", {
                "error": error_msg[:200],
                "mode": mode,
                "aa_address": parsed_request.aa_address
            }, client_ip)

            # Detect repeated execution failures
            abuse_detector.detect_suspicious_activity(client_ip, 'repeated_errors', {'error_type': 'execution_failure'})

            logger.error(f"AA Send execution failed: {error_msg}")
            raise HTTPException(500, f"Transaction execution failed: {error_msg}")

    except subprocess.TimeoutExpired:
        security_logger.log_security_event("aa_send_timeout", {
            "mode": mode,
            "aa_address": parsed_request.aa_address
        }, client_ip)
        logger.error(f"AA Send timeout for user {user['sub'][:8]}...")
        raise HTTPException(408, "Transaction execution timeout")
    except Exception as e:
        security_logger.log_security_event("aa_send_error", {
            "error": str(e)[:200],
            "mode": mode,
            "aa_address": parsed_request.aa_address
        }, client_ip)
        logger.error(f"AA Send error: {e}")
        raise HTTPException(500, f"Transaction execution failed: {str(e)}")

@router.get("/aa/status/{user_op_hash}", response_model=AAStatusResponse)
@limiter.limit("30/minute")  # Rate limit: 30 status checks per minute per user
async def aa_get_status(
    request: Request,
    user_op_hash: str,
    user: dict = Depends(get_authenticated_user)
):
    """
    Get status of a UserOperation with Supabase JWT protection
    """
    if not (BICONOMY_BUNDLER_URL and BICONOMY_PAYMASTER_API_KEY):
        raise HTTPException(503, "ERC-4337 disabled: BICONOMY configuration missing")

    logger.info(f"AA Status request from user {user['sub']}: {user_op_hash}")

    # First check if UserOperation exists in our database and belongs to the user
    session = db()
    try:
        user_op = session.query(UserOperation).filter(
            UserOperation.user_op_hash == user_op_hash,
            UserOperation.user_id == user.user_id
        ).first()

        if not user_op:
            # Check if it belongs to any of the user's Smart Accounts
            user_op = session.query(UserOperation).filter(
                UserOperation.user_op_hash == user_op_hash,
                UserOperation.user_id == user["sub"]
            ).first()

        if not user_op:
            logger.warning(f"User {user['sub']} requested status for unauthorized UserOp: {user_op_hash}")
            raise HTTPException(404, "UserOperation not found or not authorized")

        # If we have a cached status that's not pending, return it
        if user_op.status in ["success", "failed", "reverted"]:
            logger.info(f"Returning cached status for UserOp {user_op_hash}: {user_op.status}")
            return AAStatusResponse(
                status=user_op.status,
                entry_point_tx_hash=user_op.entry_point_tx_hash,
                revert_reason=user_op.revert_reason
            )

        # For pending status, query the bundler for updates
        try:
            aa_test_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "aa-test")

            # Query status via Node.js script
            result = subprocess.run(
                ["node", "query-userop-status.js", user_op_hash],
                cwd=aa_test_dir,
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode == 0:
                # Parse result from Node.js script
                output_lines = result.stdout.strip().split('\n')
                status = "pending"
                entry_point_tx_hash = None
                revert_reason = None

                for line in output_lines:
                    if line.startswith("Status:"):
                        status = line.split("Status:")[1].strip()
                    elif line.startswith("EntryPointTxHash:"):
                        entry_point_tx_hash = line.split("EntryPointTxHash:")[1].strip()
                        if entry_point_tx_hash == "unknown":
                            entry_point_tx_hash = None
                    elif line.startswith("RevertReason:"):
                        revert_reason = line.split("RevertReason:")[1].strip()

                # Update database with new status
                try:
                    user_op.status = status
                    user_op.entry_point_tx_hash = entry_point_tx_hash
                    user_op.revert_reason = revert_reason
                    user_op.updated_at = int(time.time())
                    session.commit()
                    logger.info(f"Updated UserOp status: {user_op_hash} -> {status}")
                except Exception as db_error:
                    session.rollback()
                    logger.error(f"Failed to update UserOp status: {db_error}")

                return AAStatusResponse(
                    status=status,
                    entry_point_tx_hash=entry_point_tx_hash,
                    revert_reason=revert_reason
                )

            else:
                logger.error(f"Status query failed: {result.stderr}")
                # Return current database status
                return AAStatusResponse(
                    status=user_op.status,
                    entry_point_tx_hash=user_op.entry_point_tx_hash,
                    revert_reason=user_op.revert_reason
                )

        except subprocess.TimeoutExpired:
            logger.warning(f"Status query timeout for UserOp: {user_op_hash}")
            return AAStatusResponse(
                status=user_op.status,
                entry_point_tx_hash=user_op.entry_point_tx_hash,
                revert_reason=user_op.revert_reason
            )
        except Exception as e:
            logger.error(f"Status query error: {e}")
            return AAStatusResponse(
                status=user_op.status,
                entry_point_tx_hash=user_op.entry_point_tx_hash,
                revert_reason=user_op.revert_reason
            )

    finally:
        session.close()

@router.get("/vouchers/{address}")
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

@router.post("/redeem_permit")
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

@router.post("/redeem_permit_demo")
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

# --- Challenge System API Endpoints ---

class ChallengeResponse(BaseModel):
    id: int
    name: str
    description: str
    duration_minutes: int
    points_reward: int
    is_active: bool

class UserChallengeResponse(BaseModel):
    id: int
    challenge: ChallengeResponse
    status: str
    started_at: Optional[int]
    completed_at: Optional[int]

class DailyChallengesResponse(BaseModel):
    date: str
    challenges: List[UserChallengeResponse]
    total_points_today: int
    all_completed: bool

class UserPointsResponse(BaseModel):
    total_points: int
    earned_today: int
    last_updated: int

class StartChallengeRequest(BaseModel):
    challenge_id: int

class CompleteChallengeRequest(BaseModel):
    challenge_id: int

def get_today_date() -> str:
    """Get today's date in YYYY-MM-DD format"""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")

def get_current_timestamp() -> int:
    """Get current Unix timestamp"""
    return int(datetime.now(timezone.utc).timestamp())

def init_default_challenges():
    """Initialize the default 5 wellness challenges"""
    session = db()
    try:
        # Check if challenges already exist
        existing_count = session.query(Challenge).count()
        if existing_count > 0:
            return  # Challenges already initialized

        default_challenges = [
            {
                "name": "Breathing Exercise",
                "description": "Complete 30 seconds of mindful breathing",
                "duration_minutes": 1,  # 30 seconds rounded up
                "points_reward": 100
            },
            {
                "name": "Study Session",
                "description": "Focus on studying for 30 minutes",
                "duration_minutes": 30,
                "points_reward": 300
            },
            {
                "name": "Stay Hydrated",
                "description": "Drink water regularly for 8 hours",
                "duration_minutes": 480,  # 8 hours
                "points_reward": 200
            },
            {
                "name": "Rest Break",
                "description": "Take a mindful rest for 30 minutes",
                "duration_minutes": 30,
                "points_reward": 150
            },
            {
                "name": "Quality Sleep",
                "description": "Get 8 hours of quality sleep",
                "duration_minutes": 480,  # 8 hours
                "points_reward": 250
            }
        ]

        for challenge_data in default_challenges:
            challenge = Challenge(
                name=challenge_data["name"],
                description=challenge_data["description"],
                duration_minutes=challenge_data["duration_minutes"],
                points_reward=challenge_data["points_reward"],
                is_active=True,
                created_at=get_current_timestamp()
            )
            session.add(challenge)

        session.commit()
        logger.info("Default challenges initialized successfully")
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to initialize default challenges: {e}")
    finally:
        session.close()

# Initialize default challenges on startup
init_default_challenges()

@router.get("/challenges/daily", response_model=DailyChallengesResponse)
async def get_daily_challenges(user: dict = Depends(get_authenticated_user)):
    """Get user's daily challenges for today"""
    session = db()
    try:
        today = get_today_date()

        # Get all active challenges
        challenges = session.query(Challenge).filter(Challenge.is_active == True).all()

        # Get user's challenge progress for today
        user_challenges = session.query(UserChallenge).filter(
            UserChallenge.user_id == user.user_id,
            UserChallenge.date == today
        ).all()

        # Create mapping of challenge_id to user_challenge
        user_challenge_map = {uc.challenge_id: uc for uc in user_challenges}

        # Build response
        challenge_responses = []
        total_points_today = 0

        for challenge in challenges:
            user_challenge = user_challenge_map.get(challenge.id)

            if user_challenge:
                # User has progress on this challenge
                if user_challenge.status == "completed":
                    total_points_today += challenge.points_reward

                challenge_response = UserChallengeResponse(
                    id=user_challenge.id,
                    challenge=ChallengeResponse(
                        id=challenge.id,
                        name=challenge.name,
                        description=challenge.description,
                        duration_minutes=challenge.duration_minutes,
                        points_reward=challenge.points_reward,
                        is_active=challenge.is_active
                    ),
                    status=user_challenge.status,
                    started_at=user_challenge.started_at,
                    completed_at=user_challenge.completed_at
                )
            else:
                # User hasn't started this challenge yet
                challenge_response = UserChallengeResponse(
                    id=0,  # No user_challenge record yet
                    challenge=ChallengeResponse(
                        id=challenge.id,
                        name=challenge.name,
                        description=challenge.description,
                        duration_minutes=challenge.duration_minutes,
                        points_reward=challenge.points_reward,
                        is_active=challenge.is_active
                    ),
                    status="not_started",
                    started_at=None,
                    completed_at=None
                )

            challenge_responses.append(challenge_response)

        all_completed = len(challenges) > 0 and all(
            uc.status == "completed" for uc in user_challenges if uc.challenge_id in [c.id for c in challenges]
        ) and len(user_challenges) == len(challenges)

        return DailyChallengesResponse(
            date=today,
            challenges=challenge_responses,
            total_points_today=total_points_today,
            all_completed=all_completed
        )

    except Exception as e:
        logger.error(f"Failed to get daily challenges: {e}")
        raise HTTPException(500, detail=f"Failed to get daily challenges: {str(e)}")
    finally:
        session.close()

@router.post("/challenges/start")
async def start_challenge(
    request: StartChallengeRequest,
    user: dict = Depends(get_authenticated_user)
):
    """Start a specific challenge for today"""
    session = db()
    try:
        today = get_today_date()
        current_time = get_current_timestamp()

        # Check if challenge exists and is active
        challenge = session.query(Challenge).filter(
            Challenge.id == request.challenge_id,
            Challenge.is_active == True
        ).first()

        if not challenge:
            raise HTTPException(404, detail="Challenge not found or inactive")

        # Check if user already has this challenge for today
        existing_challenge = session.query(UserChallenge).filter(
            UserChallenge.user_id == user.user_id,
            UserChallenge.challenge_id == request.challenge_id,
            UserChallenge.date == today
        ).first()

        if existing_challenge:
            if existing_challenge.status == "completed":
                raise HTTPException(400, detail="Challenge already completed today")
            elif existing_challenge.status == "in_progress":
                raise HTTPException(400, detail="Challenge already in progress")
            else:
                # Update existing record to in_progress
                existing_challenge.status = "in_progress"
                existing_challenge.started_at = current_time
        else:
            # Create new user challenge record
            user_challenge = UserChallenge(
                user_id=user.user_id,
                challenge_id=request.challenge_id,
                date=today,
                status="in_progress",
                started_at=current_time
            )
            session.add(user_challenge)

        session.commit()

        return {
            "message": f"Challenge '{challenge.name}' started successfully",
            "challenge_id": request.challenge_id,
            "started_at": current_time
        }

    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to start challenge: {e}")
        raise HTTPException(500, detail=f"Failed to start challenge: {str(e)}")
    finally:
        session.close()

@router.post("/challenges/complete")
async def complete_challenge(
    request: CompleteChallengeRequest,
    user: dict = Depends(get_authenticated_user)
):
    """Complete a specific challenge and award points"""
    session = db()
    try:
        today = get_today_date()
        current_time = get_current_timestamp()

        # Get the user challenge record
        user_challenge = session.query(UserChallenge).filter(
            UserChallenge.user_id == user.user_id,
            UserChallenge.challenge_id == request.challenge_id,
            UserChallenge.date == today
        ).first()

        if not user_challenge:
            raise HTTPException(404, detail="Challenge not started today")

        if user_challenge.status == "completed":
            raise HTTPException(400, detail="Challenge already completed")

        if user_challenge.status != "in_progress":
            raise HTTPException(400, detail="Challenge must be started first")

        # Get challenge details for points
        challenge = session.query(Challenge).filter(Challenge.id == request.challenge_id).first()
        if not challenge:
            raise HTTPException(404, detail="Challenge not found")

        # Verify that the required duration has passed since the challenge was started
        challenge_duration_seconds = challenge.duration_minutes * 60
        if current_time < (user_challenge.started_at + challenge_duration_seconds):
            raise HTTPException(400, detail=f"Challenge duration of {challenge.duration_minutes} minutes has not passed yet")

        # Mark challenge as completed
        user_challenge.status = "completed"
        user_challenge.completed_at = current_time

        # Update user points
        user_points = session.query(UserPoints).filter(UserPoints.user_id == user.user_id).first()

        if user_points:
            # Check if we need to reset daily points
            if user_points.last_daily_reset != today:
                user_points.earned_today = 0
                user_points.last_daily_reset = today

            user_points.total_points += challenge.points_reward
            user_points.earned_today += challenge.points_reward
            user_points.last_updated = current_time
        else:
            # Create new user points record
            user_points = UserPoints(
                user_id=user.user_id,
                total_points=challenge.points_reward,
                earned_today=challenge.points_reward,
                last_updated=current_time,
                last_daily_reset=today
            )
            session.add(user_points)

        session.commit()

        return {
            "message": f"Challenge '{challenge.name}' completed successfully!",
            "points_awarded": challenge.points_reward,
            "total_points": user_points.total_points,
            "earned_today": user_points.earned_today,
            "completed_at": current_time
        }

    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to complete challenge: {e}")
        raise HTTPException(500, detail=f"Failed to complete challenge: {str(e)}")
    finally:
        session.close()

@router.get("/points/balance", response_model=UserPointsResponse)
async def get_points_balance(user: dict = Depends(get_authenticated_user)):
    """Get user's current points balance"""
    session = db()
    try:
        today = get_today_date()

        user_points = session.query(UserPoints).filter(UserPoints.user_id == user.user_id).first()

        if not user_points:
            # Return default values if no points record exists
            return UserPointsResponse(
                total_points=0,
                earned_today=0,
                last_updated=get_current_timestamp()
            )

        # Check if we need to reset daily points
        if user_points.last_daily_reset != today:
            user_points.earned_today = 0
            user_points.last_daily_reset = today
            user_points.last_updated = get_current_timestamp()
            session.commit()

        return UserPointsResponse(
            total_points=user_points.total_points,
            earned_today=user_points.earned_today,
            last_updated=user_points.last_updated
        )

    except Exception as e:
        logger.error(f"Failed to get points balance: {e}")
        raise HTTPException(500, detail=f"Failed to get points balance: {str(e)}")
    finally:
        session.close()
