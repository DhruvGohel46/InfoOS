import logging
import threading
from typing import Tuple, Any, Optional
from .model_loader import configure_model_environment, verify_model_exists

logger = logging.getLogger(__name__)

# Configure model directories immediately on import
configure_model_environment()


class AISessionManager:
    """Manages the lifecycle and reuse of the rembg ONNX session."""

    _session = None
    _remove_fn = None
    _init_lock = threading.Lock()
    _initialized = False

    @classmethod
    def initialize(cls) -> bool:
        """Warms up and initializes the rembg session once."""
        if cls._initialized:
            return True

        with cls._init_lock:
            if cls._initialized:
                return True

            logger.info("Initializing Backend AI Session...")
            if not verify_model_exists():
                logger.error(
                    "Model verification failed. Cannot initialize background removal session."
                )
                return False

            try:
                from rembg import new_session, remove

                # new_session will look up in U2NET_HOME
                logger.info("Creating rembg InferenceSession for 'u2netp'...")
                cls._session = new_session("u2netp")
                cls._remove_fn = remove
                cls._initialized = True
                logger.info("Backend AI Session successfully loaded and ready.")
                return True
            except Exception as e:
                logger.error(
                    f"Failed to initialize backend background removal session: {e}", exc_info=True
                )
                return False

    @classmethod
    def get_session(cls) -> Tuple[Optional[Any], Optional[Any]]:
        """
        Retrieve the active remove function and session object.
        Initializes the session if it hasn't been loaded yet.
        """
        if not cls._initialized:
            cls.initialize()
        return cls._remove_fn, cls._session
