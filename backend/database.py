# backend/database.py

import os
from pymongo import MongoClient, ASCENDING
from pymongo.database import Database
from pymongo.errors import ConnectionFailure, OperationFailure
from dotenv import load_dotenv
import datetime
import certifi
from auth import get_password_hash

load_dotenv()  # keep support for .env

# --- Configuration ---
DATABASE_NAME = "projecthub_db"  # same for local & Atlas

client: MongoClient = None
db: Database = None

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
def _resolve_mongo_uri() -> str:
    """
    Priority:
      1) Environment variable MONGO_URI (set by BAT or shell)
      2) .env variables (DEFAULT, LOCAL_URI, ATLAS_URI)
      3) Fallback: local mongodb
    """
    # 1) Env (explicitly set, e.g. by .bat)
    env_uri = os.getenv("MONGO_URI")
    if env_uri:
        print("MONGO_URI resolved from ENV.")
        return env_uri

    # 2) Check .env for DEFAULT mode
    local_uri = os.getenv("LOCAL_URI", "mongodb://127.0.0.1:27017/")
    atlas_uri = os.getenv("ATLAS_URI")
    default_mode = os.getenv("DEFAULT", "LOCAL").upper()

    if default_mode == "ATLAS" and atlas_uri:
        print("MONGO_URI resolved from .env (DEFAULT=ATLAS).")
        return atlas_uri

    # default LOCAL
    print("MONGO_URI resolved from .env (DEFAULT=LOCAL).")
    return local_uri


def connect_to_mongo():
    """Establishes connection to MongoDB."""
    global client, db

    mongo_uri = _resolve_mongo_uri()
    print(f"Attempting to connect to MongoDB using URI: {mongo_uri} ...")

    try:
        # Only use certifi for remote connections (Atlas), skip for local to avoid SSL errors
        if "localhost" in mongo_uri or "127.0.0.1" in mongo_uri:
            client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        else:
            client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000, tlsCAFile=certifi.where())

        client.admin.command("ismaster")
        db = client[DATABASE_NAME]
        print(f"✅ Connected to MongoDB database '{DATABASE_NAME}'.")

        # --- Indexes (unchanged from your version) ---
        db.users.create_index("email", unique=True)
        try:
            db.users.drop_index("registrationNumber_1")
        except OperationFailure:
            pass
        db.users.create_index(
            [("registrationNumber", ASCENDING)],
            unique=True,
            partialFilterExpression={"registrationNumber": {"$type": "string"}}
        )

        db.projects.create_index("ownerId")
        db.projects.create_index("teamMembers.userId")
        db.projects.create_index("guideId")
        db.projects.create_index("department")
        db.projects.create_index("status")

        db.team_invitations.create_index([("inviteeId", ASCENDING), ("status", ASCENDING)])
        db.team_invitations.create_index("projectId")

        db.guide_requests.create_index([("ownerId", ASCENDING), ("status", ASCENDING)])
        db.guide_requests.create_index("teacherId")
        db.guide_requests.create_index("projectId")

        db.project_links.create_index([("projectId", ASCENDING), ("phaseOrder", ASCENDING)])
        db.project_links.create_index("submittedByUserId")

        db.project_chat_messages.create_index([("projectId", ASCENDING), ("phaseOrder", ASCENDING), ("sentAt", ASCENDING)])
        db.project_chat_messages.create_index("senderId")

        return db
    except ConnectionFailure as e:
        client = None
        db = None
        print(f"❌ Failed to connect to MongoDB: {e}")
        raise ConnectionFailure(f"Could not connect to MongoDB at {mongo_uri}.")
    except Exception as e:
        client = None
        db = None
        print(f"❌ Unexpected MongoDB error: {e}")
        raise


def get_database() -> Database:
    if db is None:
        raise ConnectionFailure("Database is not connected. Check startup logs.")
    return db


def close_mongo_connection():
    global client, db
    if client:
        client.close()
        print("MongoDB connection closed.")
    client = None
    db = None


def create_admin_users():
    if db is None:
        print("Cannot create admin users: Database not connected.")
        return

    admin_users = [
        {"fullName": "Joyal Admin", "email": "joyal@hub.com", "password": "12345678", "role": "Admin"},
        {"fullName": "Albert Admin", "email": "albert@hub.com", "password": "12345678", "role": "Admin"},
        {"fullName": "Yadu Admin", "email": "yadu@hub.com", "password": "12345678", "role": "Admin"},
        {"fullName": "Noel Admin", "email": "noel@hub.com", "password": "12345678", "role": "Admin"},
    ]

    users_collection = db.users
    for admin_data in admin_users:
        existing = users_collection.find_one({"email": admin_data["email"]})
        if not existing:
            hashed_password = get_password_hash(admin_data["password"])
            users_collection.insert_one({
                "fullName": admin_data["fullName"],
                "email": admin_data["email"],
                "hashedPassword": hashed_password,
                "role": admin_data["role"],
                "createdAt": datetime.datetime.utcnow()
            })
