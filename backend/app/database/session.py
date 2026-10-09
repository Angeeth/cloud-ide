import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

logger = logging.getLogger("mirage_ide")

db_url = settings.DATABASE_URL

# Attempt PostgreSQL connection, fallback to SQLite if PostgreSQL is unreachable in dev environment
def get_engine(url):
    connect_args = {}
    if url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
    
    try:
        engine_obj = create_engine(url, connect_args=connect_args, pool_pre_ping=True)
        # Test connection
        with engine_obj.connect() as conn:
            pass
        return engine_obj
    except Exception as e:
        if settings.ENVIRONMENT == "development" and not url.startswith("sqlite"):
            logger.warning(f"Failed to connect to PostgreSQL at {url}. Falling back to SQLite for local development: {e}")
            sqlite_url = "sqlite:///./mirage_dev.db"
            return create_engine(sqlite_url, connect_args={"check_same_thread": False})
        raise e

engine = get_engine(db_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
