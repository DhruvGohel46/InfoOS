import os
import sys


class Config:
    """Configuration class for POS system"""
    
    # Base directory paths
    if getattr(sys, 'frozen', False):
        # If the application is run as a bundle, the PyInstaller bootloader
        # extends the sys module by a flag frozen=True and sets the app 
        # path into variable _MEIPASS'.
        BASE_DIR = sys._MEIPASS
    else:
        BASE_DIR = os.path.dirname(os.path.abspath(__file__))

    # SQLAlchemy Configuration
    # Use environment variable for DB URI, fallback to local postgres
    # Default: postgresql://postgres:YOUR_PASSWORD@localhost:5432/rebill_db
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or \
        "postgresql://postgres:dharmik@localhost:5432/rebill_db"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Engine Options — Productionizing Postgres connection pool
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,          # Health check connections before usage
        'pool_size': 10,                # Max concurrent connections in the pool
        'max_overflow': 20,             # Max connections beyond pool_size
        'pool_recycle': 3600,           # Recycle connections after 1 hour avoiding DB timeouts
    }

    # Data directory - allow override via env var (passed from Electron)
    # Default to a 'data' folder next to the executable if not specified
    DATA_DIR = os.environ.get('POS_DATA_DIR') or os.path.join(os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else BASE_DIR, "data")
    
    # XML file paths
    PRODUCTS_FILE = os.path.join(DATA_DIR, "products.xml")
    DB_FILE = os.path.join(DATA_DIR, "products.db")
    BILLS_DIR = os.path.join(DATA_DIR, "bills")
    ARCHIVE_DIR = os.path.join(DATA_DIR, "archive")
    
    # Export directory
    EXPORT_DIR = os.path.join(DATA_DIR, "exports")
    
    # Reports directory for automated reports
    REPORTS_FOLDER = os.environ.get('REPORTS_FOLDER') or r"D:\Sales Data of other product"
    
    # Flask configuration
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'pos-secret-key-for-local-development'
    DEBUG = True
    
    # Printer configuration
    PRINTER_NAME = os.environ.get('PRINTER_NAME') or 'Default Printer'
    MAX_CHARS_PER_LINE = 32
    
    # Shop information
    SHOP_NAME = os.environ.get('SHOP_NAME') or 'FAST FOOD SHOP'
    SHOP_ADDRESS = os.environ.get('SHOP_ADDRESS') or 'Your Address Here'
    SHOP_PHONE = os.environ.get('SHOP_PHONE') or 'Phone: XXXXXXXXXX'
    
    # Business configuration
    DEFAULT_CURRENCY = '₹'
    MAX_CHARS_PER_LINE = 32 # Re-declare to be safe if overwritten above? No, just good practice to keep grouped.
    TAX_RATE = float(os.environ.get('TAX_RATE', 0.0))  # Tax rate as decimal (0.18 for 18%)
    
    # Security configuration
    RESET_PASSWORD = os.environ.get('RESET_PASSWORD') or 'Karam2@15'


class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    TESTING = False


class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    TESTING = False


# Configuration mapping
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}

