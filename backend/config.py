# backend/config.py

import os
from datetime import timedelta

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev_key_12345'
    
    # === DATABASE CONFIGURATION ===
    uri = os.environ.get('DATABASE_URL')
    if uri and uri.startswith("postgres://"):
        uri = uri.replace("postgres://", "postgresql://", 1)
    
    SQLALCHEMY_DATABASE_URI = uri or 'sqlite:///protodo.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Database Stability Settings
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
    }

    # === SCHEDULER SETTINGS ===
    SCHEDULER_API_ENABLED = True
    SCHEDULER_JOB_DEFAULTS = {
        'coalesce': False,
        'max_instances': 3
    }

    # === MAIL CONFIGURATION (FIXED) ===
    # We now check os.environ FIRST. If missing, we fallback to Gmail.
    # This ensures it picks up 'smtp-relay.brevo.com' from your .env file.
    MAIL_SERVER = os.environ.get('MAIL_SERVER') or 'smtp.gmail.com'
    MAIL_PORT = int(os.environ.get('MAIL_PORT') or 587)
    MAIL_USE_TLS = True
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD')
    MAIL_DEFAULT_SENDER = os.environ.get('MAIL_DEFAULT_SENDER')

    # === SECURITY UPDATE (FIXED FOR JWT) ===
    # Since auth.py uses 'create_access_token', we must use this variable.
    # The token will now self-destruct after 1 hour.
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)