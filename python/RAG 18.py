# Unified RAG System with FastAPI, Gemini + Ollama
# Now structured to run from the 'python/' directory and serve 'frontend/'

# INSTALLATION INSTRUCTIONS: (Included above)

import os
import shutil
import hashlib
import json
import numpy as np
from pathlib import Path
import uvicorn
import asyncio
from fastapi import FastAPI, HTTPException, Body
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any
from fastapi.staticfiles import StaticFiles # Import StaticFiles

# Set environment variables before imports
os.environ["OLLAMA_HOST"] = "http://127.0.0.1:11434" # Keep this if needed

from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter # Corrected import
from langchain_chroma import Chroma
from langchain_core.documents import Document # Corrected import
from langchain.embeddings.base import Embeddings

# Module imports (assuming these are available)
try:
    from google import genai
    from langchain_ollama import ChatOllama
    from langchain_ollama.embeddings import OllamaEmbeddings
    import ollama
except ImportError:
    print("="*50)
    print("ERROR: Required packages not found.")
    print("Please run the install command provided earlier.")
    print("="*50)
    exit() # Exit if crucial packages are missing

# ==================== CONFIGURATION ====================
# Paths relative to THIS script in the 'python/' folder
FRONTEND_DIR = "../frontend" # Path to the frontend folder
CONFIG_FILE = "rag_config.json" # Config file in the same (python) folder
DEFAULT_VECTOR_DB_BASE = "./chroma_db" # Base path for DBs in the same (python) folder

# We will load DOCS_DIR from the config file, but use a default if not present
# The default path should still be the absolute path or relative to where you RUN the script
DEFAULT_DOCS_DIR = r"C:\Users\joyal\OTHER\CUSAT\- sem 3\1 My notes\6 Mini Project\4 Project Code\ProjectHub3\frontend\docs" # Example: Assuming docs are in frontend/docs
# --- OR --- If docs are in python/docs:
# DEFAULT_DOCS_DIR = "./docs"


SYSTEM_PROMPT = (
    "You are HubMaster, a virtual assistant created by the ProjectHub team. "
    "You are fun but professional. Always provide helpful, clear, and engaging responses."
)

# Optimized chunk settings
CHUNK_SIZE = 800
CHUNK_OVERLAP = 100
# =======================================================


class GeminiEmbeddings(Embeddings):
    """Custom Gemini embeddings using native google-genai SDK"""

    def __init__(self, api_key: str, model: str = "text-embedding-004"):
        # Check if genai is available before initializing
        if 'genai' not in globals():
             raise ImportError("Google GenAI library not loaded. Cannot initialize GeminiEmbeddings.")
        self.client = genai.Client(api_key=api_key)
        self.model = model

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed a list of documents"""
        embeddings = []
        for text in texts:
            result = self.client.models.embed_content(
                model=self.model,
                contents=text
            )
            embeddings.append(result.embeddings[0].values)
        return embeddings

    def embed_query(self, text: str) -> list[float]:
        """Embed a single query"""
        result = self.client.models.embed_content(
            model=self.model,
            contents=text
        )
        return result.embeddings[0].values


class RAGConfig:
    """Manages configuration and state persistence"""

    def __init__(self):
        self.config = self.load_config()

    def load_config(self):
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'r') as f:
                try:
                    return json.load(f)
                except json.JSONDecodeError:
                     print(f"Warning: Could not decode {CONFIG_FILE}. Using defaults.")
                     # Fall through to return defaults
        # Return defaults if file doesn't exist or is invalid
        return {
            "gemini_api_key": "",
            "ollama_endpoint": "http://127.0.0.1:11434",
            "rag_docs_path": DEFAULT_DOCS_DIR,
            "vector_db_path": DEFAULT_VECTOR_DB_BASE, # Use base path
            "system_prompt": SYSTEM_PROMPT,
            "last_file_hash": "",
            "provider": "gemini", # Default to Gemini
            "gemini_model": "gemini-1.5-flash-latest",
            "ollama_model": "", # No default Ollama model initially
            "embedding_model": "all-minilm"
        }

    def save_config(self, config_data: dict):
        self.config.update(config_data)
        # Ensure only necessary keys are saved
        keys_to_save = [
            "gemini_api_key", "ollama_endpoint", "rag_docs_path", "vector_db_path",
            "system_prompt", "last_file_hash", "provider", "gemini_model",
            "ollama_model", "embedding_model"
        ]
        config_to_write = {k: self.config.get(k) for k in keys_to_save if k in self.config}

        with open(CONFIG_FILE, 'w') as f:
            json.dump(config_to_write, f, indent=2)

    def get_files_hash(self, files):
        """Create hash of selected files for change detection"""
        # Ensure files exist before getting mtime
        valid_files = [f for f in files if os.path.exists(f)]
        if len(valid_files) != len(files):
             print(f"Warning: Some files selected for hashing do not exist.")

        file_data = "".join(sorted([f"{f}:{os.path.getmtime(f)}" for f in valid_files]))
        return hashlib.md5(file_data.encode()).hexdigest()


class LLMProvider:
    """Abstract provider interface"""

    def __init__(self, model_name):
        self.model_name = model_name
        self.embeddings = None

    def initialize(self):
        raise NotImplementedError

    async def chat_stream(self, prompt):
        raise NotImplementedError


class GeminiProvider(LLMProvider):
    """Google Gemini API Provider using native SDK"""

    def __init__(self, api_key, model_name="gemini-1.5-flash-latest"):
        super().__init__(model_name)
        self.api_key = api_key
        # Ensure genai is loaded before proceeding
        if 'genai' not in globals():
             raise ImportError("Google GenAI library not loaded. Cannot initialize GeminiProvider.")


    def initialize(self):
        print("🔄 Initializing Gemini...")
        try:
            # Client and Embeddings initialized within GeminiEmbeddings now
            self.embeddings = GeminiEmbeddings(api_key=self.api_key)
            self.client = self.embeddings.client # Reuse the client

            # Warm up test using the reused client
            response = self.client.models.generate_content(
                model=self.model_name,
                contents="Hi"
            )
            print(f"✅ Gemini ready! (Using model: {self.model_name})")
            return True
        except Exception as e:
            print(f"❌ Gemini initialization failed: {e}")
            import traceback
            traceback.print_exc() # Print detailed error
            return False

    async def chat_stream(self, prompt):
        """
        Generates content from Gemini API using streaming.
        This is an async generator that yields chunks of text.
        """
        if not self.client:
             yield "Error: Gemini client not initialized."
             return
        try:
            response_stream = self.client.models.generate_content_stream(
                model=self.model_name,
                contents=prompt
            )

            for chunk in response_stream:
                if chunk.text:
                    yield chunk.text
                    await asyncio.sleep(0) # Allow other tasks to run
        except Exception as e:
            print(f"❌ Gemini stream error: {e}")
            import traceback
            traceback.print_exc()
            yield f"Error during Gemini generation: {e}"


class OllamaProvider(LLMProvider):
    """Ollama Local Provider"""

    EMBEDDING_DIMENSIONS = {
        "nomic-embed-text": 768,
        "mxbai-embed-large": 1024,
        "snowflake-arctic-embed": 1024,
        "bge-m3": 1024,
        "all-minilm": 384, # Default/fallback
    }

    def __init__(self, model_name, base_url, embedding_model_name):
        super().__init__(model_name)
        self.base_url = base_url
        self.llm = None
        self.embedding_model = embedding_model_name
        self.embedding_dimension = self.EMBEDDING_DIMENSIONS.get(embedding_model_name, 384)

    def initialize(self):
        print("🔄 Initializing Ollama...")
        # Ensure Ollama libs are loaded
        if 'ChatOllama' not in globals() or 'OllamaEmbeddings' not in globals():
             print("❌ Ollama libraries not loaded.")
             return False
        try:
            print(f"   LLM Model: {self.model_name}")
            print(f"   Embedding Model: {self.embedding_model}")
            print(f"   Base URL: {self.base_url}")

            self.llm = ChatOllama(model=self.model_name, base_url=self.base_url)
            self.embeddings = OllamaEmbeddings(
                model=self.embedding_model,
                base_url=self.base_url
            )

            # Warm up LLM
            print("   Warming up LLM...")
            _ = self.llm.invoke("Hi")
            print("✅ Ollama LLM and Embeddings ready!")
            return True
        except Exception as e:
            print(f"❌ Ollama initialization failed: {e}")
            import traceback
            traceback.print_exc()
            return False

    def get_vectorstore_dir(self, base_path):
        """Returns the specific vectorstore path for this embedding model"""
        # Ensure base path doesn't end with separator for cleaner join
        safe_base = base_path.rstrip(os.path.sep)
        return f"{safe_base}_{self.embedding_model.replace(':', '_').replace('-', '_')}_{self.embedding_dimension}"


    async def chat_stream(self, prompt):
        """
        Generates content from Ollama API using streaming.
        This is an async generator that yields chunks of text.
        """
        if not self.llm:
             yield "Error: Ollama LLM not initialized."
             return
        try:
            async for chunk in self.llm.astream(prompt):
                yield chunk.content
        except Exception as e:
            print(f"❌ Ollama stream error: {e}")
            import traceback
            traceback.print_exc()
            yield f"Error during Ollama generation: {e}"


class RAGSystem:
    """Main RAG orchestrator, modified for API operation"""

    def __init__(self):
        self.config_manager = RAGConfig()
        self.provider: LLMProvider = None
        self.vectorstore: Chroma = None
        self.retriever = None
        self.current_files = []
        self.vectorstore_dir = None # Specific path, depends on provider & embed model
        self.system_prompt = self.config_manager.config.get("system_prompt", SYSTEM_PROMPT)

    def cleanup_vectorstore(self):
        """Properly cleanup vectorstore before deletion"""
        if self.vectorstore:
            try:
                # Langchain Chroma doesn't seem to have an explicit close.
                # Just releasing references should be enough.
                self.vectorstore = None
                self.retriever = None
                print("  ✓ Vectorstore references released")
                import gc
                gc.collect() # Hint garbage collection
            except Exception as e:
                print(f"  ⚠️ Warning during vectorstore cleanup: {e}")

    def safe_remove_directory(self, directory):
        """Safely remove directory with retry logic for Windows"""
        import time
        import gc

        if not directory or not os.path.exists(directory):
             print(f"  ✓ Directory '{directory}' does not exist, nothing to remove.")
             return True

        print(f"  Attempting to remove directory: {directory}")
        # Explicitly clean up Chroma refs BEFORE trying to delete
        self.cleanup_vectorstore()
        time.sleep(1) # Give OS a moment

        max_retries = 5
        for attempt in range(max_retries):
            try:
                shutil.rmtree(directory)
                print(f"  ✓ Successfully removed {directory}")
                return True
            except PermissionError as e:
                 print(f"  ⏳ PermissionError on attempt {attempt + 1}: {e}")
                 if attempt < max_retries - 1:
                    print(f"     Retrying in 3 seconds...")
                    gc.collect() # More aggressive GC
                    time.sleep(3)
                 else:
                     print(f"  ⚠️ Could not remove directory after {max_retries} attempts: {e}")
                     print(f"  💡 Please manually delete the folder '{directory}' if possible and restart.")
                     return False
            except Exception as e:
                 print(f"  ⚠️ Unexpected error removing directory: {e}")
                 import traceback
                 traceback.print_exc()
                 return False
        return False # Should not be reached, but safety return

    def initialize_provider(self, config: dict):
        """Initializes the LLM provider based on config"""
        # No need to cleanup vectorstore here, let build_vectorstore handle it based on path changes

        provider_type = config.get("provider", "gemini") # Default to gemini now
        base_vector_path = config.get("vector_db_path", DEFAULT_VECTOR_DB_BASE)
        self.system_prompt = config.get("system_prompt", SYSTEM_PROMPT)
        new_vectorstore_dir = None # Store the calculated path

        try:
            print(f"\nInitializing provider: {provider_type}")
            if provider_type == "gemini":
                api_key = config.get("gemini_api_key")
                model = config.get("gemini_model", "gemini-1.5-flash-latest")
                if not api_key:
                    raise ValueError("Gemini API key is missing in config.")

                temp_provider = GeminiProvider(api_key, model_name=model)
                if not temp_provider.initialize():
                    raise Exception("Gemini provider failed to initialize.")

                # Gemini has a fixed embedding model name (determine it)
                embedding_model_name = temp_provider.embeddings.model if temp_provider.embeddings else "text-embedding-004"
                embedding_dimension = 768 # Assuming text-embedding-004
                new_vectorstore_dir = f"{base_vector_path.rstrip(os.path.sep)}_{embedding_model_name.replace(':', '_').replace('-', '_')}_{embedding_dimension}"
                self.provider = temp_provider # Assign only on success


            elif provider_type == "ollama":
                model = config.get("ollama_model")
                embedding_model = config.get("embedding_model", "all-minilm")
                base_url = config.get("ollama_endpoint", "http://127.0.0.1:11434")

                if not model:
                     raise ValueError("Ollama LLM Model is not selected in config.")

                temp_provider = OllamaProvider(model, base_url, embedding_model)
                if not temp_provider.initialize():
                    # Specific check for connection errors
                    if "connection refused" in str(e).lower() or "failed to connect" in str(e).lower():
                         raise ConnectionRefusedError(f"Failed to connect to Ollama at {base_url}. Is it running?")
                    else:
                        raise Exception("Ollama provider failed to initialize.")

                new_vectorstore_dir = temp_provider.get_vectorstore_dir(base_vector_path)
                self.provider = temp_provider # Assign only on success

            else:
                raise ValueError(f"Unknown provider type: {provider_type}")

            # --- Vectorstore Path Management ---
            # If the calculated path is different from the current one, clean up the OLD one
            if self.vectorstore_dir and new_vectorstore_dir != self.vectorstore_dir:
                 print(f"Provider or embedding model changed. Cleaning up old vectorstore at {self.vectorstore_dir}")
                 # Ensure cleanup happens BEFORE setting the new path
                 # self.safe_remove_directory(self.vectorstore_dir) # Removing directory might be too aggressive, just release refs
                 self.cleanup_vectorstore()

            self.vectorstore_dir = new_vectorstore_dir # Set the new path
            print(f"   Vectorstore directory set to: {self.vectorstore_dir}")
            # --- End Vectorstore Path Management ---

            return True

        except Exception as e:
            print(f"❌ Provider initialization failed: {e}")
            self.provider = None # Reset provider on failure
            # Don't reset vectorstore_dir here, let subsequent build attempt handle it
            # Re-raise the specific exception for better handling in the API endpoint
            raise e


    def build_vectorstore(self, files: List[str], force_rebuild: bool = False):
        """Builds or loads the vectorstore"""
        if not self.provider or not self.provider.embeddings:
            raise Exception("Provider is not initialized. Cannot build vectorstore.")

        if not self.vectorstore_dir:
            raise Exception("Vectorstore directory path could not be determined. Check provider initialization.")

        # Ensure the base directory for the vectorstore exists
        base_dir = os.path.dirname(self.vectorstore_dir)
        if base_dir and not os.path.exists(base_dir):
             try:
                 os.makedirs(base_dir)
                 print(f"   Created base directory for vectorstores: {base_dir}")
             except OSError as e:
                 raise Exception(f"Failed to create base directory {base_dir}: {e}")

        # Check hash against currently selected files
        current_hash = self.config_manager.get_files_hash(files)
        last_hash = self.config_manager.config.get("last_file_hash", "")
        # Also check if the *directory* associated with the last hash still exists
        vectorstore_exists = os.path.exists(self.vectorstore_dir)

        rebuild_needed = force_rebuild or (current_hash != last_hash) or not vectorstore_exists

        if rebuild_needed:
            print(f"\n🔄 Vector store rebuild needed (Force={force_rebuild}, HashChanged={current_hash != last_hash}, NotExists={not vectorstore_exists})")
            # Attempt to remove the specific directory if it exists
            if vectorstore_exists:
                if not self.safe_remove_directory(self.vectorstore_dir):
                    # If removal fails, we probably can't build either.
                    raise Exception(f"Failed to remove existing vectorstore directory '{self.vectorstore_dir}'. Cannot proceed with rebuild.")
            else:
                 self.cleanup_vectorstore() # Still release refs if dir didn't exist

            print(f"\n📖 Loading {len(files)} document(s)...")
            documents = []
            valid_files_loaded = []
            for filepath in files:
                if not os.path.exists(filepath):
                     print(f"  ⚠️ Skipping non-existent file: {filepath}")
                     continue
                try:
                    if filepath.lower().endswith('.pdf'):
                        loader = PyPDFLoader(filepath)
                    else: # Treat as text (.txt, .md, etc.)
                        # Try common encodings
                        try:
                           loader = TextLoader(filepath, encoding='utf-8')
                           docs = loader.load()
                        except UnicodeDecodeError:
                           print(f"  Trying 'latin-1' encoding for {os.path.basename(filepath)}")
                           loader = TextLoader(filepath, encoding='latin-1')
                           docs = loader.load()

                    documents.extend(docs)
                    valid_files_loaded.append(filepath) # Keep track of successfully loaded files for hash
                    print(f"  ✓ {os.path.basename(filepath)}")
                except Exception as e:
                    print(f"  ✗ Error loading {os.path.basename(filepath)}: {e}")

            if not documents:
                print("❌ No documents loaded successfully.")
                self.config_manager.config["last_file_hash"] = "" # Reset hash if no files loaded
                self.config_manager.save_config(self.config_manager.config)
                self.current_files = []
                self.retriever = None
                return False # Indicate failure

            print(f"\n✂️ Splitting {len(documents)} documents into chunks (size={CHUNK_SIZE}, overlap={CHUNK_OVERLAP})...")
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=CHUNK_SIZE,
                chunk_overlap=CHUNK_OVERLAP,
                separators=["\n\n", "\n", ". ", " ", ""],
                length_function=len # Add default length function
            )
            chunks = text_splitter.split_documents(documents)
            print(f"  ✓ Created {len(chunks)} chunks")

            print(f"\n🧠 Creating embeddings and vector store at '{self.vectorstore_dir}' (this may take time)...")
            try:
                self.vectorstore = Chroma.from_documents(
                    chunks,
                    self.provider.embeddings,
                    persist_directory=self.vectorstore_dir # Persist to the specific directory
                )
                # Update hash based on successfully loaded files
                new_hash = self.config_manager.get_files_hash(valid_files_loaded)
                self.config_manager.config["last_file_hash"] = new_hash
                self.config_manager.save_config(self.config_manager.config)
                print("  ✓ Vector store built and persisted!")
            except Exception as e:
                 print(f"❌ Error creating vector store: {e}")
                 import traceback
                 traceback.print_exc()
                 # Clean up potentially partially created directory on error
                 self.safe_remove_directory(self.vectorstore_dir)
                 return False

        else:
            print(f"\n✅ Loading existing vector store from '{self.vectorstore_dir}'...")
            try:
                # Ensure we release old references before loading new ones
                self.cleanup_vectorstore()
                self.vectorstore = Chroma(
                    persist_directory=self.vectorstore_dir,
                    embedding_function=self.provider.embeddings
                )
                print("  ✓ Vector store loaded!")
            except Exception as e:
                 print(f"❌ Error loading existing vector store: {e}")
                 print(f"   Attempting to rebuild...")
                 # If loading fails, force a rebuild next time by clearing hash and trying removal
                 self.config_manager.config["last_file_hash"] = ""
                 self.config_manager.save_config(self.config_manager.config)
                 self.safe_remove_directory(self.vectorstore_dir)
                 return False # Indicate failure, user should retry initialize

        # Set retriever if vectorstore is valid
        if self.vectorstore:
            self.retriever = self.vectorstore.as_retriever(search_kwargs={"k": 3}) # Use k=3 from original code
            self.current_files = files # Update current files list
            return True
        else:
             print("Vectorstore is None after build/load process.")
             self.retriever = None
             self.current_files = []
             return False

    async def generate_response_stream(self, query: str, mode: str):
        """Generates a streamed response for either 'chat' or 'rag' mode"""
        if not self.provider:
            yield "Error: Provider not initialized. Please configure settings in the left sidebar and click 'Initialize'."
            return

        effective_system_prompt = self.system_prompt # Use the latest from config

        if mode == "rag":
            if not self.retriever:
                yield "Error: RAG mode selected, but no vectorstore is loaded or ready. Please select files in the right sidebar and click 'Initialize' in the left sidebar."
                return

            print(f"RAG Query: {query}")
            try:
                # Retrieve relevant chunks
                print("   Retrieving documents...")
                retrieved_docs = self.retriever.invoke(query)
                print(f"   Retrieved {len(retrieved_docs)} chunks.")
                context = "\n\n---\n\n".join([chunk.page_content for chunk in retrieved_docs])

                # Generate response
                augmented_prompt = (
                    f"{effective_system_prompt}\n\n"
                    f"Use the following context from the documents to answer the question:\n"
                    f"--- CONTEXT START ---\n{context}\n--- CONTEXT END ---\n\n"
                    f"Question: {query}\n\n"
                    f"Answer based *only* on the provided context. If the context doesn't contain the answer, say you don't have enough information from the documents:"
                )

                print("   Generating response...")
                async for chunk in self.provider.chat_stream(augmented_prompt):
                    yield chunk
                print("   RAG response stream finished.")

            except Exception as e:
                print(f"❌ Error during RAG retrieval/generation: {e}")
                import traceback
                traceback.print_exc()
                yield f"Error during RAG processing: {e}"


        elif mode == "chat":
            print(f"Chat Query: {query}")
            prompt = f"{effective_system_prompt}\n\nUser: {query}\n\nAssistant:"
            try:
                print("   Generating response...")
                async for chunk in self.provider.chat_stream(prompt):
                    yield chunk
                print("   Chat response stream finished.")
            except Exception as e:
                print(f"❌ Error during Chat generation: {e}")
                import traceback
                traceback.print_exc()
                yield f"Error during Chat processing: {e}"

        else:
            yield f"Error: Unknown mode '{mode}'. Valid modes are 'chat' or 'rag'."

# ==================== FASTAPI APP ====================

app = FastAPI()
rag_system = RAGSystem()

# --- Pydantic Models ---
class SaveConfigRequest(BaseModel):
    # Include all relevant config fields from RAGConfig defaults
    provider: str
    gemini_api_key: str | None = None # Optional
    gemini_model: str | None = None # Optional
    ollama_endpoint: str
    ollama_model: str | None = None # Optional
    embedding_model: str
    rag_docs_path: str
    vector_db_path: str
    system_prompt: str

class InitializeRequest(BaseModel):
    config: Dict[str, Any] # Send the full current config from frontend
    selected_files: List[str]
    force_rebuild: bool

class ChatRequest(BaseModel):
    query: str
    mode: str # 'chat' or 'rag'

# --- API Endpoints ---

@app.get("/api/config")
async def get_config():
    """Loads the current config from rag_config.json"""
    # Ensure config is reloaded fresh in case file was manually edited
    rag_system.config_manager.config = rag_system.config_manager.load_config()
    return JSONResponse(content=rag_system.config_manager.config)

@app.post("/api/config")
async def save_config_endpoint(request: SaveConfigRequest):
    """Saves new config values to rag_config.json"""
    try:
        # Pass the validated Pydantic model dict to save_config
        rag_system.config_manager.save_config(request.dict())
        # Update the running system's prompt immediately
        rag_system.system_prompt = request.system_prompt
        return JSONResponse(content={"status": "success", "config": rag_system.config_manager.config})
    except Exception as e:
        print(f"Error saving config: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save config: {e}")

@app.get("/api/ollama-models")
async def get_ollama_models_endpoint():
    """Lists available Ollama models, correctly handling the ListResponse object"""
    # This function uses the corrected logic from the previous step
    base_url = rag_system.config_manager.config.get("ollama_endpoint", "http://127.0.0.1:11434")
    try:
        client = ollama.Client(host=base_url)
        print(f"\n---> [API] Attempting to connect to Ollama at: {base_url}")
        models_response = client.list()
        print(f"---> [API] Ollama client.list() response object type: {type(models_response)}")
        # print(f"---> [API] Ollama client.list() raw response:\n{models_response}\n") # Too verbose for regular logs

        if not hasattr(models_response, 'models') or not isinstance(models_response.models, list):
             print(f"---> [API] Unexpected response structure from Ollama.")
             raise HTTPException(status_code=500, detail=f"Unexpected response structure from Ollama at {base_url}.")

        models_list = models_response.models
        embedding_models = OllamaProvider.EMBEDDING_DIMENSIONS.keys()
        llm_models = []
        print(f"---> [API] Processing {len(models_list)} models from Ollama...")

        for model_obj in models_list:
             if hasattr(model_obj, 'model'):
                model_name = model_obj.model
                base_model_name = model_name.split(':')[0]
                if base_model_name not in embedding_models:
                    llm_models.append(model_name)
             # else: # Ignore models without a name attribute
             #    print(f"---> [API] Skipping model object without 'model' attribute: {model_obj}")


        print(f"---> [API] Found LLM models: {llm_models}")
        return JSONResponse(content={"models": llm_models})

    except ConnectionRefusedError:
         print(f"--- Ollama Connection Error: Connection refused at {base_url}")
         raise HTTPException(status_code=500, detail=f"Cannot connect to Ollama at {base_url}. Is the Ollama application running?")
    except Exception as e:
        import traceback
        print("\n--- Ollama API Error Traceback ---")
        traceback.print_exc()
        print("--------------------------------\n")
        # Try to provide a more specific error if possible
        err_msg = f"Error communicating with Ollama at {base_url}. Check backend console. Error: {type(e).__name__}"
        if "failed to connect" in str(e).lower():
            err_msg = f"Cannot connect to Ollama at {base_url}. Is the Ollama application running?"
        raise HTTPException(status_code=500, detail=err_msg)


@app.get("/api/documents")
async def get_documents_endpoint():
    """Scans the DOCS_DIR and returns a list of files"""
    # Use the path from the current config
    docs_dir = rag_system.config_manager.config.get("rag_docs_path", DEFAULT_DOCS_DIR)
    print(f"\nScanning for documents in: {docs_dir}")

    if not os.path.isdir(docs_dir): # Check if it's actually a directory
         err_msg = f"Configured 'RAG Documents Path' is not a valid directory: {docs_dir}"
         print(f"ERROR: {err_msg}")
         # Return an empty list but indicate the error
         return JSONResponse(content={"files": [], "message": err_msg, "error": True})
         # Or raise HTTP Exception:
         # raise HTTPException(status_code=400, detail=err_msg)


    all_files = []
    try:
        for root, _, files in os.walk(docs_dir):
            for f in files:
                if f.lower().endswith(('.txt', '.pdf', '.md')):
                    full_path = os.path.join(root, f)
                    relative_path = os.path.relpath(full_path, docs_dir)
                    folder_name = os.path.dirname(relative_path)
                    display_folder = folder_name if folder_name and folder_name != '.' else "root"

                    all_files.append({
                        "name": os.path.basename(full_path),
                        "path": full_path, # Send absolute path to backend
                        "folder": display_folder
                    })
        print(f"Found {len(all_files)} documents.")
        return JSONResponse(content={"files": all_files})
    except Exception as e:
         print(f"Error scanning documents directory {docs_dir}: {e}")
         raise HTTPException(status_code=500, detail=f"Error scanning documents: {e}")

@app.post("/api/initialize")
async def initialize_system_endpoint(request: InitializeRequest):
    """Initializes the provider and builds/loads the vectorstore"""
    try:
        # 1. Initialize the provider using config from the request
        if not rag_system.initialize_provider(request.config):
            # initialize_provider now raises specific exceptions
             raise HTTPException(status_code=500, detail="Failed to initialize LLM provider (check backend logs).")

        message = "Provider initialized successfully."

        # 2. Build/Load vectorstore only if files are selected
        if request.selected_files:
            print(f"Attempting to build/load vectorstore with {len(request.selected_files)} files.")
            if not rag_system.build_vectorstore(request.selected_files, request.force_rebuild):
                # Build_vectorstore might return False for recoverable errors (e.g., no docs loaded)
                raise HTTPException(status_code=500, detail="Failed to build vectorstore (check backend logs).")
            message += " Vectorstore is ready."
        else:
            # If no files selected, ensure any previous vectorstore is cleared
            rag_system.cleanup_vectorstore()
            rag_system.retriever = None
            rag_system.current_files = []
            print("No files selected for RAG. Vectorstore cleared.")
            message += " No files selected for RAG."

        return JSONResponse(content={"status": "success", "message": message})

    except ConnectionRefusedError as e: # Catch specific Ollama connection error
        print(f"Initialization failed: {e}")
        raise HTTPException(status_code=500, detail=str(e)) # Pass specific error to frontend
    except Exception as e:
        print(f"Initialization failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Initialization failed: {e}")


@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    """Handles chat requests and streams responses"""
    try:
        # Use an async generator function for streaming
        async def stream_generator():
            async for chunk in rag_system.generate_response_stream(request.query, request.mode):
                yield chunk

        return StreamingResponse(
            stream_generator(),
            media_type="text/event-stream"
        )
    except Exception as e:
        print(f"Error during chat streaming: {e}")
        import traceback
        traceback.print_exc()
        # Still try to stream an error message back
        async def error_stream():
            yield f"Error: {e}"
        return StreamingResponse(error_stream(), media_type="text/event-stream", status_code=500)


# ==================== Serve Static Files ====================
# Mount the frontend directory to be served at the root
# Make sure the path is relative to where this script is (python/)
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static")

# ==================== ENTRY POINT ====================
if __name__ == "__main__":
    print("="*50)
    print("🚀 Starting ProjectHub AI Backend...")
    print(f"   Serving frontend from: {os.path.abspath(FRONTEND_DIR)}")
    print(f"   Config file: {os.path.abspath(CONFIG_FILE)}")
    print(f"   Default Vector DB base path: {os.path.abspath(DEFAULT_VECTOR_DB_BASE)}")
    print(f"   Access the frontend at http://127.0.0.1:8000/ai_chat.html")
    print("="*50)

    # Make sure FRONTEND_DIR exists
    if not os.path.isdir(FRONTEND_DIR):
         print(f"\n--- ERROR ---")
         print(f"Frontend directory not found at expected path: {os.path.abspath(FRONTEND_DIR)}")
         print(f"Make sure the script is in the 'python' folder and 'frontend' folder exists alongside it.")
         print(f"---------------")
         exit()

    # Run Uvicorn
    # Use reload=True for development to auto-restart on code changes
    # uvicorn.run("RAG 18:app", host="127.0.0.1", port=8000, reload=True)
    # Use reload=False for standard execution
    uvicorn.run(app, host="127.0.0.1", port=8000)