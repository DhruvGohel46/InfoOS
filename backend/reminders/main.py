from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import socketio
import logging
import os
import signal
import sys
from .routes import router as reminder_router
from .websocket import sio
from .scheduler import start_scheduler
from .models import init_db

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI App
app = FastAPI(title="InfoOS Reminder Microservice", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Socket.IO ASGI App integration
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

# Include Routers
app.include_router(reminder_router, prefix="/api")


@app.on_event("startup")
async def startup_event():
    """Initializations on app startup."""
    logger.info("Initializing Reminder Microservice...")
    # 1. Initialize DB tables
    try:
        init_db()
        logger.info("✅ Database tables initialized.")
    except Exception as e:
        logger.error(f"❌ Database initialization failed: {e}")

    # 2. Start Scheduler
    try:
        start_scheduler()
    except Exception as e:
        logger.error(f"❌ Scheduler failed to start: {e}")


@app.get("/")
def health_check():
    return {"status": "ok", "service": "reminders"}


# Function to run uvicorn
def run_service(host: str = "0.0.0.0", port: int = 5052):  # Using separate port from main app
    uvicorn.run(socket_app, host=host, port=port)


if __name__ == "__main__":
    run_service()
