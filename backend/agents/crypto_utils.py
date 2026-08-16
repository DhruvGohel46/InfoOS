import os
import base64
import hashlib
import json
import logging

_log = logging.getLogger(__name__)

# Secret key file location in data directory
_KEY_FILE = os.path.join(os.environ.get("POS_DATA_DIR", "data"), ".agent_secret_key")


def _get_or_create_secret_key() -> bytes:
    """Retrieve or generate the local hardware/instance machine key."""
    try:
        if os.path.exists(_KEY_FILE):
            with open(_KEY_FILE, "rb") as f:
                key = f.read().strip()
                if key:
                    return key
    except Exception as e:
        _log.warning("Could not read agent secret key file: %s", e)

    # Generate new key
    try:
        from cryptography.fernet import Fernet

        key = Fernet.generate_key()
    except Exception:
        # Fallback to random 32 bytes base64 encoded
        random_bytes = os.urandom(32)
        key = base64.urlsafe_b64encode(random_bytes)

    try:
        os.makedirs(os.path.dirname(_KEY_FILE), exist_ok=True)
        with open(_KEY_FILE, "wb") as f:
            f.write(key)
    except Exception as e:
        _log.warning("Could not persist agent secret key file: %s", e)

    return key


def encrypt_api_key(plain_text: str) -> str:
    """Encrypt an API key for storage at rest in SQLite."""
    if not plain_text:
        return ""

    key = _get_or_create_secret_key()
    try:
        from cryptography.fernet import Fernet

        f = Fernet(key)
        encrypted = f.encrypt(plain_text.encode("utf-8"))
        return encrypted.decode("utf-8")
    except Exception as e:
        # Simple XOR/AES-like fallback with sha256 keystream if fernet is not installed
        _log.debug("Using fallback cipher for API key encryption: %s", e)
        key_hash = hashlib.sha256(key).digest()
        plain_bytes = plain_text.encode("utf-8")
        out = bytearray()
        for i, b in enumerate(plain_bytes):
            out.append(b ^ key_hash[i % len(key_hash)])
        return "fb:" + base64.b64encode(bytes(out)).decode("utf-8")


def decrypt_api_key(cipher_text: str) -> str:
    """Decrypt an API key in-process for an outbound LLM request."""
    if not cipher_text:
        return ""

    key = _get_or_create_secret_key()

    if cipher_text.startswith("fb:"):
        raw_b64 = cipher_text[3:]
        cipher_bytes = base64.b64decode(raw_b64.encode("utf-8"))
        key_hash = hashlib.sha256(key).digest()
        out = bytearray()
        for i, b in enumerate(cipher_bytes):
            out.append(b ^ key_hash[i % len(key_hash)])
        return out.decode("utf-8", errors="replace")

    try:
        from cryptography.fernet import Fernet

        f = Fernet(key)
        decrypted = f.decrypt(cipher_text.encode("utf-8"))
        return decrypted.decode("utf-8")
    except Exception as e:
        _log.error("Failed to decrypt API key: %s", e)
        return ""


def mask_api_key(api_key: str) -> str:
    """Return a masked representation of an API key for UI display."""
    if not api_key:
        return ""
    if len(api_key) <= 8:
        return "••••••••"
    return f"{api_key[:4]}••••••••{api_key[-4:]}"
