# MongoDB Connection Index Fix

import os
# Use the synchronous MongoClient
from pymongo import MongoClient, ASCENDING
from pymongo.database import Database # Import Database type hint
from pymongo.errors import ConnectionFailure, OperationFailure
from dotenv import load_dotenv
import datetime # Need datetime for admin user creation
from auth import get_password_hash # Import here to avoid circular dependency


load_dotenv() # Load environment variables from .env file

# --- Configuration ---
# Default MongoDB connection URI (replace if yours is different)
# Assumes MongoDB is running locally on the default port with no auth
DEFAULT_MONGO_URI = "mongodb://localhost:27017/"
DATABASE_NAME = "projecthub_db"

# Get MONGO_URI from environment, or use the default if not found
MONGO_URI = os.getenv("MONGO_URI", DEFAULT_MONGO_URI)

# --- MongoDB Client ---
client: MongoClient = None # Type hint for synchronous client
db: Database = None # Type hint for synchronous database

# --- Make functions synchronous ---
def connect_to_mongo():
    """Establishes connection to MongoDB."""
    global client, db
    # No await needed for synchronous client
    print(f"Attempting to connect to MongoDB using URI: {MONGO_URI}...")
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        # The ismaster command is cheap and does not require auth.
        client.admin.command('ismaster')
        db = client[DATABASE_NAME]
        print(f"✅ Successfully connected to MongoDB database '{DATABASE_NAME}'.")

        # Ensure unique email index remains
        db.users.create_index("email", unique=True)
        print("   - Ensured 'email' unique index.")

        # Drop the old registrationNumber index if it exists
        try:
            db.users.drop_index("registrationNumber_1")
            print("   - Dropped old 'registrationNumber_1' index.")
        except OperationFailure:
            print("   - Old 'registrationNumber_1' index not found, skipping drop.")

        # Create a partial unique index for registrationNumber (only when not null)
        db.users.create_index(
            [("registrationNumber", ASCENDING)],
            unique=True,
            partialFilterExpression={"registrationNumber": {"$type": "string"}}
        )
        print("   - Ensured partial unique index for 'registrationNumber' (non-null).")

        return db # Return db instance directly
    except ConnectionFailure as e:
        print(f"❌ Failed to connect to MongoDB at {MONGO_URI}: {e}")
        client = None
        db = None
        # Re-raise the specific exception
        raise ConnectionFailure(f"Could not connect to MongoDB server at {MONGO_URI}.")
    except Exception as e:
        print(f"❌ An unexpected error occurred during MongoDB connection: {e}")
        client = None
        db = None
        raise e

# Make synchronous
def get_database() -> Database:
    """Returns the database instance."""
    # Removed reconnect logic for simplicity with sync driver
    if db is None:
        # If db is None after initial attempt, raise error
        raise ConnectionFailure("Database is not connected. Check startup logs.")
    return db

# Make synchronous
def close_mongo_connection():
    """Closes the MongoDB connection."""
    global client, db
    if client:
        client.close()
        print("MongoDB connection closed.")
        client = None
        db = None

# Make synchronous
def create_admin_users():
    """Creates the predefined admin users if they don't exist."""
    if db is None:
        print("Cannot create admin users: Database not connected.")
        return # Return None or raise an error

    admin_users = [
        {"fullName": "Joyal Admin", "email": "joyal@hub.com", "password": "12345678", "role": "Admin"},
        {"fullName": "Albert Admin", "email": "albert@hub.com", "password": "12345678", "role": "Admin"},
        {"fullName": "Yadu Admin", "email": "yadu@hub.com", "password": "12345678", "role": "Admin"},
        {"fullName": "Noel Admin", "email": "noel@hub.com", "password": "12345678", "role": "Admin"},
    ]

    users_collection = db.users
    print("\nChecking/Creating admin users...")
    created_count = 0
    for admin_data in admin_users:
        try:
            # No await needed for synchronous find_one
            existing_user = users_collection.find_one({"email": admin_data["email"]})
            if not existing_user:
                hashed_password = get_password_hash(admin_data["password"])
                user_doc = {
                    "fullName": admin_data["fullName"],
                    "email": admin_data["email"],
                    "hashedPassword": hashed_password,
                    "role": admin_data["role"],
                    "registrationNumber": None,
                    "department": None,
                    "securityQuestion": None,
                    "securityAnswerHash": None,
                    # Use timezone.utc for consistency
                    "createdAt": datetime.datetime.now(datetime.timezone.utc)
                }
                # No await needed for synchronous insert_one
                users_collection.insert_one(user_doc)
                print(f"   - Created admin user: {admin_data['email']}")
                created_count += 1
        except Exception as e:
            # Print specific duplicate key errors if they occur for email
            if isinstance(e, DuplicateKeyError) and 'email' in e.details['keyPattern']:
                 print(f"   - Admin user already exists (email duplicate): {admin_data['email']}")
            else:
                print(f"   - Error creating admin {admin_data['email']}: {e}")


    if created_count > 0:
        print(f"   - {created_count} admin user(s) created.")
    else:
         # Check if they exist before saying "all exist"
         all_exist = True
         for admin_data in admin_users:
             if not users_collection.find_one({"email": admin_data["email"]}):
                 all_exist = False
                 break
         if all_exist:
            print("   - All specified admin users already exist.")
         # else: # Some failed, error already printed

# Example of how to use:
if __name__ == "__main__":
    try:
        connect_to_mongo()
        create_admin_users()
    except Exception as e:
        print(f"Error in main block: {e}")
    finally:
        close_mongo_connection()

