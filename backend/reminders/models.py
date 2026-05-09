from sqlalchemy import Column, String, DateTime, Boolean, Enum, create_engine, Text, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import uuid
from datetime import datetime
import os

WORKER_SCHEMA = None if os.environ.get('TESTING') == 'True' else 'worker'
import enum
import os

Base = declarative_base()

class ReminderStatus(str, enum.Enum):
    PENDING = "pending"
    TRIGGERED = "triggered"
    COMPLETED = "completed"

class RepeatType(str, enum.Enum):
    NONE = "none"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"

class Reminder(Base):
    __tablename__ = "reminders"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(50), nullable=False, default="admin") # Placeholder for auth
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    reminder_time = Column(DateTime, nullable=False)
    status = Column(String(20), default=ReminderStatus.PENDING)
    repeat_type = Column(String(20), default=RepeatType.NONE)
    is_dismissed = Column(Boolean, default=False)
    triggered_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Indexes
    __table_args__ = (
        Index('idx_reminder_time', 'reminder_time'),
        Index('idx_status', 'status'),
        Index('idx_user_id', 'user_id'),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "title": self.title,
            "description": self.description,
            "reminder_time": self.reminder_time.isoformat() if self.reminder_time else None,
            "status": self.status,
            "repeat_type": self.repeat_type,
            "is_dismissed": self.is_dismissed,
            "triggered_at": self.triggered_at.isoformat() if self.triggered_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

# Database helper
DATABASE_URL = os.environ.get("DATABASE_URL") or "postgresql://postgres:dharmik@localhost:5432/rebill_db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)
