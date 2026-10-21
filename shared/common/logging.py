import logging
import sys


def setup_logging(service_name: str = "mirage-service", log_level: str = "INFO") -> logging.Logger:
    """Configures structured stream logging for a microservice."""
    level = getattr(logging, log_level.upper(), logging.INFO)

    logger = logging.getLogger(service_name)
    logger.setLevel(level)

    # Avoid adding duplicate handlers if logger was already initialized
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(level)
        formatter = logging.Formatter(
            fmt=f"[%(asctime)s] [%(levelname)s] [{service_name}] [%(name)s]: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    return logger
