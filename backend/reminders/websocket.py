import socketio
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Socket.IO Async Server
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")

# Track Connected Users
connected_users = {}  # user_id -> [sid1, sid2, ...]


@sio.event
async def connect(sid, environ):
    logger.info(f"Socket connected: {sid}")
    # User sends user_id in auth context or header usually.
    # For now, we'll assume a generic join event for demo purposes or a global room.


@sio.event
async def join(sid, data):
    user_id = data.get("user_id", "admin")
    if user_id not in connected_users:
        connected_users[user_id] = []
    connected_users[user_id].append(sid)
    sio.enter_room(sid, f"user_{user_id}")
    logger.info(f"User {user_id} joined room user_{user_id} via {sid}")


@sio.event
async def disconnect(sid):
    for user_id, sids in connected_users.items():
        if sid in sids:
            sids.remove(sid)
            logger.info(f"User {user_id} disconnected from {sid}")
            break


async def notify_reminder(user_id, reminder):
    """Notify specific user of a triggered reminder."""
    await sio.emit("reminder_alert", reminder, room=f"user_{user_id}")
    logger.info(f"🔔 Notification emitted to user_{user_id}: {reminder['title']}")


async def emit_new_reminder(user_id, reminder):
    """Notify client that a new reminder was created."""
    await sio.emit("reminder_created", reminder, room=f"user_{user_id}")
