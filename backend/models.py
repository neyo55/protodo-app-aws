# backend/models.py
# ProTodo v1.1 - Unified Model (Auth, Profile, Notes, Reset)

from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timezone

db = SQLAlchemy()

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100))
    email = db.Column(db.String(120), unique=True, nullable=False)
    phone = db.Column(db.String(20), nullable=True)
    password_hash = db.Column(db.String(255), nullable=False)
    
    # [v1.1] Profile Fields
    nickname = db.Column(db.String(50), nullable=True)
    timezone = db.Column(db.String(50), default='Africa/Lagos')
    avatar = db.Column(db.String(200), default='/static/avatars/default.png') 

    # [v1.2] Password Reset Fields
    reset_token = db.Column(db.String(100), nullable=True)
    reset_token_expiry = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    todos = db.relationship('Todo', backref='user', lazy=True, cascade="all, delete-orphan")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class Todo(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    
    # [v1.1] Notepad & Details
    notes = db.Column(db.Text, nullable=True)
    due_date = db.Column(db.DateTime, nullable=True)
    priority = db.Column(db.String(20), default='medium')
    category = db.Column(db.String(50), default='other')
    tags = db.Column(db.JSON, nullable=True)

    # [v1.3] Recurring Tasks (NEW)
    recurrence = db.Column(db.String(20), default='never') # 'never', 'daily', 'weekly', 'monthly'

    # [v1.4] Subtasks (Checklist) - NEW
    subtasks = db.Column(db.JSON, nullable=True)
    
    # Status & Reminders
    completed = db.Column(db.Boolean, default=False)
    reminder_minutes = db.Column(db.Integer, default=30)
    reminder_sent = db.Column(db.Boolean, default=False)
    
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))