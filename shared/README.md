# Mirage IDE - Shared Package (`shared/`)

The `shared` package provides cross-cutting concerns, utilities, and configurations reused by all 10 microservices across the Mirage IDE platform.

## Package Structure

```
shared/
├── __init__.py
├── setup.py
├── README.md
└── common/
    ├── __init__.py
    ├── auth.py         # JWT tokens, password hashing, and UserClaims dependency
    ├── config.py       # Base Pydantic Settings & environment variables
    └── logging.py      # Structured service logging configuration
```

## Modules

### `common.auth`
- `verify_password(plain_password, hashed_password) -> bool`
- `get_password_hash(password) -> str`
- `create_access_token(subject, email=None, name=None, expires_delta=None) -> str`
- `decode_access_token(token) -> Optional[dict]`
- `UserClaims`: Pydantic model (`id`, `email`, `name`)
- `get_current_user_claims`: FastAPI `Depends` authentication dependency to validate JWT claims across microservices.

### `common.config`
- `BaseServiceSettings`: Base Pydantic `BaseSettings` declaring shared configurations:
  - Security secrets & algorithm
  - PostgreSQL & Redis credentials
  - S3 / Local storage configs
  - Code execution limits
  - Microservice inter-service URLs
  - CORS origins

### `common.logging`
- `setup_logging(service_name, log_level)`: Produces standardized console logs tagged with the microservice name.

## Usage in Services

To use in development or inside Docker containers:
```python
from shared.common.auth import get_current_user_claims, UserClaims, create_access_token
from shared.common.config import BaseServiceSettings
from shared.common.logging import setup_logging
```
