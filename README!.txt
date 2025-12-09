================================================================================
                                  PROJECTHUB
================================================================================

ProjectHub is a Campus Project Management System with an integrated AI RAG (Retrieval-Augmented Generation) Chatbot. It allows students and teachers to manage projects, track progress, and interact with an AI assistant that can answer questions based on project documentation.

================================================================================
                            1. FOLDER STRUCTURE
================================================================================

ProjectHub/
├── .git/                   # Git version control directory
├── backend/                # Main Backend Application (FastAPI)
│   ├── __pycache__/        # Compiled Python files
│   ├── venv/               # Virtual Environment (Python dependencies)
│   ├── auth.py             # Authentication logic (JWT, Password hashing)
│   ├── database.py         # MongoDB connection and database utilities
│   ├── main.py             # Main entry point for the Core Backend API (Port 8001)
│   ├── models.py           # Pydantic models and Database Schemas
│   ├── requirements.txt    # Python dependencies for the main backend
│   └── .env                # Environment variables (DB URL, Secret keys)
│
├── frontend/               # User Interface (HTML, CSS, JS)
│   ├── assets/             # Images and static assets
│   ├── css/                # Stylesheets (Tailwind/Custom CSS)
│   ├── js/                 # JavaScript logic for frontend pages
│   │   ├── home.js         # Logic for the landing page
│   │   ├── ai_chat.js      # Logic for the AI Chat interface
│   │   └── ...             # Other page-specific scripts
│   ├── home.html           # Landing Page
│   ├── student_dashboard.html # Dashboard for Students
│   ├── teacher_dashboard.html # Dashboard for Teachers
│   ├── admin_dashboard.html   # Dashboard for Admins
│   ├── ai_chat.html        # AI Chat Interface
│   └── ...                 # Other HTML pages
│
├── python/                 # AI & RAG Engine (FastAPI + LangChain)
│   ├── chroma_db.../       # Vector Database storage (ChromaDB)
│   ├── RAG18.py            # Main entry point for AI Backend & Chat Server (Port 8000)
│   ├── rag_config.json     # Configuration for AI (API keys, models, paths)
│   ├── required installations.txt # Dependencies specific to the AI module
│   └── system_prompt...txt # System prompts for the AI behavior
│
├── Docs/                   # Documentation & RAG Source Files
│   └── RAG/                # Place PDF/TXT files here for the AI to "read"
│
├── OpenProjectHub.bat      # One-click startup script for Windows
├── README.md               # Brief project introduction
├── New Features.md         # List of planned or recent features
└── how to manually work.txt # Developer notes for manual execution

================================================================================
                            2. FILE EXPLANATIONS
================================================================================

--- ROOT DIRECTORY ---
- OpenProjectHub.bat: A batch script that automates the startup process. It likely starts the MongoDB connection (if configured), the Main Backend, and the AI Backend simultaneously.

--- BACKEND (backend/) ---
- main.py: The heart of the project management system. It handles user login, signup, project creation, and dashboard data. Runs on Port 8001.
- auth.py: Handles security. It verifies passwords and generates "Tokens" so users stay logged in.
- database.py: Connects the python code to your local MongoDB database.
- models.py: Defines what a "User", "Project", or "Message" looks like in the database.

--- FRONTEND (frontend/) ---
- Contains the visual part of the website.
- The pages (HTML) connect to the Backends using JavaScript (JS).
- home.html: The entry point for users.
- ai_chat.html: A special page that talks to the AI Backend (Port 8000) instead of the Main Backend.

--- PYTHON (python/) ---
- RAG18.py: This is the brain of the AI. It runs a separate server on Port 8000.
  - It serves the 'frontend' folder so you can see the website.
  - It handles the "Chat" and "RAG" (Chat with Documents) features.
  - It uses LangChain to process text and ChromaDB to store "memories" of your documents.

================================================================================
                        3. PREREQUISITES & INSTALLATION
================================================================================

Before running the project, ensure you have the following installed:

1.  **Python**: Version 3.8 or higher is recommended.
    -   Check version: `python --version`

2.  **MongoDB Community Server**:
    -   Must be installed and running locally.
    -   Default URL: `mongodb://127.0.0.1:27017/`
    -   Download: https://www.mongodb.com/try/download/community

3.  **Ollama** (For Local AI):
    -   Download: https://ollama.com/
    -   **IMPORTANT**: You must enable "Expose Ollama to the network" (or ensure it binds to 0.0.0.0 or 127.0.0.1 properly) if accessing from other devices, but for localhost it should work out of the box.
    -   Pull a model: Run `ollama pull llama3` (or your preferred model) in your terminal.

4.  **Google Gemini API Key** (Optional):
    -   If you prefer using Google's AI instead of running it locally with Ollama.

================================================================================
                            4. INSTALLATION STEPS
================================================================================

1.  **Install Main Backend Dependencies**:
    Open a terminal in the `backend` folder and run:
    ```bash
    pip install -r requirements.txt
    ```
    *Note: It is recommended to use a virtual environment (venv).*

2.  **Install AI/RAG Dependencies**:
    Open a terminal in the `python` folder and run:
    ```bash
    pip install -U fastapi uvicorn python-multipart google-genai langchain langchain-core langchain-chroma langchain-ollama langchain-community langchain-text-splitters langchain-google-genai unstructured python-magic ollama pypdf marked
    ```

================================================================================
                            5. HOW TO RUN
================================================================================

--- OPTION 1: AUTOMATIC (Recommended) ---
Double-click the `OpenProjectHub.bat` file in the root directory.
This should open the necessary terminal windows and start the services.

--- OPTION 2: MANUAL STARTUP ---

You need to run TWO separate servers for the full experience.

**Step 1: Start the Main Backend (Auth & Project Management)**
1. Open a terminal (CMD/PowerShell).
2. Navigate to the `backend` folder.
3. Run:
   ```bash
   uvicorn main:app --host 127.0.0.1 --port 8001 --reload
   ```

**Step 2: Start the AI Backend & Frontend Server**
1. Open a NEW terminal window.
2. Navigate to the `python` folder.
3. Run:
   ```bash
   python RAG18.py
   ```
   *This will start the AI server on Port 8000 and also serve the frontend files.*

**Step 3: Access the Application**
- **AI Chat & Main App**: Open your browser and go to:
  `http://127.0.0.1:8000/ai_chat.html`
  (You can navigate to other pages like Home from there if links are set up, or go to `http://127.0.0.1:8000/home.html`)

*Note: The Main Backend (Port 8001) is used purely as an API by the frontend. You generally don't visit localhost:8001 in your browser directly.*
