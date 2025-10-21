"""
Redis service for persistent caching and rate limiting.

This module provides a production-grade Redis client for:
- Idempotency cache (persistent across restarts)
- Rate limiting (shared across multiple instances)
- Blocklist management (persistent blocked addresses)

Usage:
    from services.redis_service import get_redis_client

    redis = get_redis_client()
    redis.set_idempotency("key", "value", ttl=300)
"""

import os
import logging
import json
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta

try:
    import redis
    from redis.exceptions import RedisError
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    RedisError = Exception

logger = logging.getLogger(__name__)


class RedisCacheError(Exception):
    """Custom Redis cache error exception."""
    pass


class RedisService:
    """
    Production-grade Redis client for caching and rate limiting.

    Features:
    - Idempotency cache with TTL
    - Rate limiting with sliding window
    - Persistent blocklist
    - Graceful fallback to in-memory cache if Redis unavailable
    """

    def __init__(
        self,
        host: str = "localhost",
        port: int = 6379,
        db: int = 0,
        password: Optional[str] = None,
        decode_responses: bool = True,
        use_fallback: bool = True
    ):
        if not REDIS_AVAILABLE:
            logger.warning("redis library not installed. Using in-memory fallback.")
            logger.warning("Install with: pip install redis")
            self._client = None
            self._use_fallback = True
            self._fallback_cache: Dict[str, Any] = {}
            return

        self.host = host
        self.port = port
        self.db = db
        self.password = password
        self.decode_responses = decode_responses
        self._use_fallback = use_fallback

        # Fallback in-memory cache
        self._fallback_cache: Dict[str, Any] = {}

        # Initialize Redis connection
        self._client: Optional[redis.Redis] = None
        self._connect()

    def _connect(self) -> None:
        """Connect to Redis server."""
        try:
            logger.info(f"Connecting to Redis at {self.host}:{self.port}")

            self._client = redis.Redis(
                host=self.host,
                port=self.port,
                db=self.db,
                password=self.password,
                decode_responses=self.decode_responses,
                socket_connect_timeout=5,
                socket_timeout=5
            )

            # Test connection
            self._client.ping()
            logger.info("Successfully connected to Redis")

        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            if self._use_fallback:
                logger.warning("Using in-memory fallback cache")
                self._client = None
            else:
                raise RedisCacheError(f"Failed to connect to Redis: {e}")

    def is_available(self) -> bool:
        """Check if Redis is available."""
        if self._client is None:
            return False
        try:
            self._client.ping()
            return True
        except Exception:
            return False

    # ============================================================
    # Idempotency Cache
    # ============================================================

    def set_idempotency(self, key: str, value: str, ttl: int = 300) -> bool:
        """
        Store idempotency key with TTL.

        Args:
            key: Idempotency key
            value: Value to store (usually transaction hash)
            ttl: Time-to-live in seconds (default: 5 minutes)

        Returns:
            True if stored successfully
        """
        full_key = f"idempotency:{key}"

        if self._client:
            try:
                self._client.setex(full_key, ttl, value)
                return True
            except Exception as e:
                logger.error(f"Redis setex failed: {e}")
                if self._use_fallback:
                    self._fallback_cache[full_key] = {
                        "value": value,
                        "expires_at": datetime.now() + timedelta(seconds=ttl)
                    }
                    return True
                return False
        else:
            # Fallback to in-memory
            self._fallback_cache[full_key] = {
                "value": value,
                "expires_at": datetime.now() + timedelta(seconds=ttl)
            }
            return True

    def get_idempotency(self, key: str) -> Optional[str]:
        """
        Get idempotency value if it exists.

        Args:
            key: Idempotency key

        Returns:
            Stored value or None if not found/expired
        """
        full_key = f"idempotency:{key}"

        if self._client:
            try:
                value = self._client.get(full_key)
                return value
            except Exception as e:
                logger.error(f"Redis get failed: {e}")
                # Try fallback
                cached = self._fallback_cache.get(full_key)
                if cached and cached["expires_at"] > datetime.now():
                    return cached["value"]
                return None
        else:
            # Fallback to in-memory
            cached = self._fallback_cache.get(full_key)
            if cached and cached["expires_at"] > datetime.now():
                return cached["value"]
            return None

    def check_idempotency(self, key: str, value: str, ttl: int = 300) -> bool:
        """
        Check if request is duplicate and store if not.

        Args:
            key: Idempotency key
            value: Value to store if new
            ttl: Time-to-live in seconds

        Returns:
            True if this is a new request (stored successfully)
            False if this is a duplicate request
        """
        full_key = f"idempotency:{key}"

        if self._client:
            try:
                # Use SET NX EX for atomic check-and-set
                result = self._client.set(full_key, value, nx=True, ex=ttl)
                return result is not None and result
            except Exception as e:
                logger.error(f"Redis check_idempotency failed: {e}")
                return self._fallback_check_idempotency(full_key, value, ttl)
        else:
            return self._fallback_check_idempotency(full_key, value, ttl)

    def _fallback_check_idempotency(self, key: str, value: str, ttl: int) -> bool:
        """Fallback idempotency check using in-memory cache."""
        cached = self._fallback_cache.get(key)
        if cached and cached["expires_at"] > datetime.now():
            return False  # Duplicate

        self._fallback_cache[key] = {
            "value": value,
            "expires_at": datetime.now() + timedelta(seconds=ttl)
        }
        return True  # New request

    # ============================================================
    # Rate Limiting
    # ============================================================

    def check_rate_limit(
        self,
        identifier: str,
        limit: int,
        window: int,
        increment: int = 1
    ) -> tuple[bool, int, int]:
        """
        Check rate limit using sliding window.

        Args:
            identifier: Client identifier (IP, user ID, etc.)
            limit: Maximum requests allowed
            window: Time window in seconds
            increment: Amount to increment (default: 1)

        Returns:
            Tuple of (allowed, current_count, ttl)
            - allowed: True if request is allowed
            - current_count: Current request count
            - ttl: Seconds until window resets
        """
        key = f"rate_limit:{identifier}"

        if self._client:
            try:
                # Increment counter
                current = self._client.incr(key, increment)

                # Set expiry on first request
                if current == increment:
                    self._client.expire(key, window)
                    ttl = window
                else:
                    ttl = self._client.ttl(key)

                allowed = current <= limit
                return (allowed, current, ttl)

            except Exception as e:
                logger.error(f"Redis rate limit check failed: {e}")
                return self._fallback_rate_limit(key, limit, window, increment)
        else:
            return self._fallback_rate_limit(key, limit, window, increment)

    def _fallback_rate_limit(
        self,
        key: str,
        limit: int,
        window: int,
        increment: int
    ) -> tuple[bool, int, int]:
        """Fallback rate limiting using in-memory cache."""
        cached = self._fallback_cache.get(key)
        now = datetime.now()

        if cached and cached["expires_at"] > now:
            current = cached["count"] + increment
            self._fallback_cache[key]["count"] = current
            ttl = int((cached["expires_at"] - now).total_seconds())
        else:
            current = increment
            self._fallback_cache[key] = {
                "count": current,
                "expires_at": now + timedelta(seconds=window)
            }
            ttl = window

        allowed = current <= limit
        return (allowed, current, ttl)

    # ============================================================
    # Blocklist Management
    # ============================================================

    def block_address(
        self,
        address: str,
        duration_hours: int,
        reason: str = ""
    ) -> bool:
        """
        Block an address for specified duration.

        Args:
            address: Address to block (lowercase)
            duration_hours: Block duration in hours
            reason: Reason for blocking

        Returns:
            True if blocked successfully
        """
        address = address.lower()
        key = f"blocklist:{address}"
        ttl = duration_hours * 3600  # Convert to seconds

        data = json.dumps({
            "address": address,
            "blocked_at": datetime.now().isoformat(),
            "reason": reason,
            "duration_hours": duration_hours
        })

        if self._client:
            try:
                self._client.setex(key, ttl, data)
                logger.info(f"Blocked address {address} for {duration_hours}h: {reason}")
                return True
            except Exception as e:
                logger.error(f"Redis block_address failed: {e}")
                return self._fallback_block(key, data, ttl)
        else:
            return self._fallback_block(key, data, ttl)

    def _fallback_block(self, key: str, data: str, ttl: int) -> bool:
        """Fallback blocking using in-memory cache."""
        self._fallback_cache[key] = {
            "value": data,
            "expires_at": datetime.now() + timedelta(seconds=ttl)
        }
        return True

    def is_blocked(self, address: str) -> tuple[bool, Optional[str]]:
        """
        Check if address is blocked.

        Args:
            address: Address to check

        Returns:
            Tuple of (is_blocked, reason)
        """
        address = address.lower()
        key = f"blocklist:{address}"

        if self._client:
            try:
                data = self._client.get(key)
                if data:
                    block_info = json.loads(data)
                    return (True, block_info.get("reason"))
                return (False, None)
            except Exception as e:
                logger.error(f"Redis is_blocked check failed: {e}")
                return self._fallback_is_blocked(key)
        else:
            return self._fallback_is_blocked(key)

    def _fallback_is_blocked(self, key: str) -> tuple[bool, Optional[str]]:
        """Fallback blocked check using in-memory cache."""
        cached = self._fallback_cache.get(key)
        if cached and cached["expires_at"] > datetime.now():
            block_info = json.loads(cached["value"])
            return (True, block_info.get("reason"))
        return (False, None)

    def unblock_address(self, address: str) -> bool:
        """
        Unblock an address.

        Args:
            address: Address to unblock

        Returns:
            True if unblocked successfully
        """
        address = address.lower()
        key = f"blocklist:{address}"

        if self._client:
            try:
                self._client.delete(key)
                logger.info(f"Unblocked address {address}")
                return True
            except Exception as e:
                logger.error(f"Redis unblock_address failed: {e}")
                if key in self._fallback_cache:
                    del self._fallback_cache[key]
                return False
        else:
            if key in self._fallback_cache:
                del self._fallback_cache[key]
            return True

    def get_all_blocked(self) -> List[Dict[str, Any]]:
        """
        Get all currently blocked addresses.

        Returns:
            List of blocked address info
        """
        blocked = []

        if self._client:
            try:
                keys = self._client.keys("blocklist:*")
                for key in keys:
                    data = self._client.get(key)
                    if data:
                        block_info = json.loads(data)
                        ttl = self._client.ttl(key)
                        block_info["ttl_seconds"] = ttl
                        blocked.append(block_info)
            except Exception as e:
                logger.error(f"Redis get_all_blocked failed: {e}")
        else:
            # Fallback
            now = datetime.now()
            for key, cached in self._fallback_cache.items():
                if key.startswith("blocklist:") and cached["expires_at"] > now:
                    block_info = json.loads(cached["value"])
                    ttl = int((cached["expires_at"] - now).total_seconds())
                    block_info["ttl_seconds"] = ttl
                    blocked.append(block_info)

        return blocked

    # ============================================================
    # General Cache Operations
    # ============================================================

    def clear_cache(self, pattern: str = "*") -> int:
        """
        Clear cache entries matching pattern.

        Args:
            pattern: Key pattern to match (default: all)

        Returns:
            Number of keys deleted
        """
        if self._client:
            try:
                keys = self._client.keys(pattern)
                if keys:
                    return self._client.delete(*keys)
                return 0
            except Exception as e:
                logger.error(f"Redis clear_cache failed: {e}")
                return 0
        else:
            count = 0
            for key in list(self._fallback_cache.keys()):
                if pattern == "*" or pattern in key:
                    del self._fallback_cache[key]
                    count += 1
            return count


# Singleton instance
_redis_client: Optional[RedisService] = None


def get_redis_client() -> RedisService:
    """
    Get or create the global Redis client instance.

    Environment variables:
    - REDIS_HOST: Redis server host (default: localhost)
    - REDIS_PORT: Redis server port (default: 6379)
    - REDIS_DB: Redis database number (default: 0)
    - REDIS_PASSWORD: Redis password (optional)
    - USE_REDIS: Enable/disable Redis (default: true)

    Returns:
        RedisService instance
    """
    global _redis_client

    if _redis_client is None:
        use_redis = os.getenv("USE_REDIS", "true").lower() == "true"

        if not use_redis:
            logger.info("Redis disabled (USE_REDIS=false). Using in-memory fallback.")
            # Create instance with None client (pure fallback mode)
            _redis_client = RedisService()
            _redis_client._client = None
            _redis_client._use_fallback = True
            return _redis_client

        redis_host = os.getenv("REDIS_HOST", "localhost")
        redis_port = int(os.getenv("REDIS_PORT", "6379"))
        redis_db = int(os.getenv("REDIS_DB", "0"))
        redis_password = os.getenv("REDIS_PASSWORD")

        _redis_client = RedisService(
            host=redis_host,
            port=redis_port,
            db=redis_db,
            password=redis_password,
            use_fallback=True  # Always allow fallback for resilience
        )

    return _redis_client


def reset_redis_client() -> None:
    """Reset the global Redis client (useful for testing)."""
    global _redis_client
    _redis_client = None
