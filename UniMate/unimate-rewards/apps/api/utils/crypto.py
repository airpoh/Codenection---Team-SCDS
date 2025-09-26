"""
Cryptographic utilities for secure private key storage
"""

import os
import base64
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import logging

logger = logging.getLogger(__name__)

class PrivateKeyEncryption:
    """Handle encryption/decryption of private keys"""
    
    def __init__(self, password: str = None):
        """Initialize with password for key derivation"""
        if password is None:
            password = os.getenv("PRIVATE_KEY_ENCRYPTION_PASSWORD", "default-dev-password-change-in-production")
        
        self.password = password.encode()
        
    def _derive_key(self, salt: bytes) -> bytes:
        """Derive encryption key from password and salt"""
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        return base64.urlsafe_b64encode(kdf.derive(self.password))
    
    def encrypt_private_key(self, private_key: str) -> str:
        """Encrypt a private key and return base64 encoded result"""
        try:
            # Generate random salt
            salt = os.urandom(16)
            
            # Derive key from password and salt
            key = self._derive_key(salt)
            fernet = Fernet(key)
            
            # Encrypt the private key
            encrypted_key = fernet.encrypt(private_key.encode())
            
            # Combine salt and encrypted key
            result = base64.urlsafe_b64encode(salt + encrypted_key).decode()
            
            return result
            
        except Exception as e:
            logger.error(f"Failed to encrypt private key: {e}")
            raise
    
    def decrypt_private_key(self, encrypted_data: str) -> str:
        """Decrypt a private key from base64 encoded data"""
        try:
            # Decode the data
            data = base64.urlsafe_b64decode(encrypted_data.encode())
            
            # Extract salt and encrypted key
            salt = data[:16]
            encrypted_key = data[16:]
            
            # Derive key from password and salt
            key = self._derive_key(salt)
            fernet = Fernet(key)
            
            # Decrypt the private key
            decrypted_key = fernet.decrypt(encrypted_key).decode()
            
            return decrypted_key
            
        except Exception as e:
            logger.error(f"Failed to decrypt private key: {e}")
            raise

# Global instance
_encryption_instance = None

def get_encryption_instance() -> PrivateKeyEncryption:
    """Get singleton encryption instance"""
    global _encryption_instance
    if _encryption_instance is None:
        _encryption_instance = PrivateKeyEncryption()
    return _encryption_instance

def encrypt_private_key(private_key: str) -> str:
    """Convenience function to encrypt private key"""
    return get_encryption_instance().encrypt_private_key(private_key)

def decrypt_private_key(encrypted_data: str) -> str:
    """Convenience function to decrypt private key"""
    return get_encryption_instance().decrypt_private_key(encrypted_data)
