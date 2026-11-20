import os
import base64
import hashlib
import json
import logging

_log = logging.getLogger(__name__)

# Secret key file location in data directory
def _get_key_file_path() -> str:
    try:
        from config import Config
        data_dir = Config.DATA_DIR
    except Exception:
        try:
            from backend.config import Config
            data_dir = Config.DATA_DIR
        except Exception:
            data_dir = os.environ.get("POS_DATA_DIR")
            if not data_dir:
                # Resolve relative to backend/data if running from anywhere in project
                cur_dir = os.path.dirname(os.path.abspath(__file__))
                candidate = os.path.abspath(os.path.join(cur_dir, "..", "data"))
                data_dir = candidate if os.path.exists(candidate) else "data"
    return os.path.join(data_dir, ".agent_secret_key")

_KEY_FILE = _get_key_file_path()


def _get_or_create_secret_key() -> bytes:
    """Retrieve or generate the local hardware/instance machine key."""
    key_file = _get_key_file_path()
    try:
        if os.path.exists(key_file):
            with open(key_file, "rb") as f:
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
        os.makedirs(os.path.dirname(key_file), exist_ok=True)
        with open(key_file, "wb") as f:
            f.write(key)
    except Exception as e:
        _log.warning("Could not persist agent secret key file: %s", e)

    return key


def encrypt_api_key(plain_text: str) -> str:
    """Encrypt an API key for storage at rest in SQLite."""
    if not plain_text:
        return ""

    plain_clean = plain_text.strip()
    if not plain_clean:
        return ""

    key = _get_or_create_secret_key()
    try:
        from cryptography.fernet import Fernet

        f = Fernet(key)
        encrypted = f.encrypt(plain_clean.encode("utf-8"))
        return encrypted.decode("utf-8")
    except Exception as e:
        # Simple XOR/AES-like fallback with sha256 keystream if fernet is not installed
        _log.debug("Using fallback cipher for API key encryption: %s", e)
        key_hash = hashlib.sha256(key).digest()
        plain_bytes = plain_clean.encode("utf-8")
        out = bytearray()
        for i, b in enumerate(plain_bytes):
            out.append(b ^ key_hash[i % len(key_hash)])
        return "fb:" + base64.b64encode(bytes(out)).decode("utf-8")


def decrypt_api_key(cipher_text: str) -> str:
    """Decrypt an API key in-process for an outbound LLM request."""
    if not cipher_text:
        return ""

    cipher_text = cipher_text.strip()
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
        return out.decode("utf-8", errors="replace").strip()

    try:
        from cryptography.fernet import Fernet

        f = Fernet(key)
        decrypted = f.decrypt(cipher_text.encode("utf-8"))
        return decrypted.decode("utf-8").strip()
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
