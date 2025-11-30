document.addEventListener('DOMContentLoaded', function () {

    // --- Element Selectors ---
    const settingsStatus = document.getElementById('settings-status');
    const ollamaConnectionStatus = document.getElementById('ollama-connection-status');
    const chatMessages = document.getElementById('chat-messages');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    let abortController = null;

    // Sidebar Toggles & Elements
    const leftSidebarToggle = document.getElementById('left-sidebar-toggle');
    const rightSidebarToggle = document.getElementById('right-sidebar-toggle');
    // No need for sidebar elements themselves, just toggle body class

    // Mode Toggle
    const chatModeBtn = document.getElementById('chat-mode-btn');
    const ragModeBtn = document.getElementById('rag-mode-btn');
    let currentMode = 'chat'; // 'chat' or 'rag'

    // Document Scanning (RIGHT SIDEBAR)
    const scanDocsBtnRight = document.getElementById('scan-docs-btn-right'); // Unique ID
    const docListContainerRight = document.getElementById('document-list-container-right'); // Unique ID
    const forceRebuildCheckboxRight = document.getElementById('force-rebuild-checkbox-right'); // Unique ID

    // Settings (LEFT SIDEBAR)
    const providerSelect = document.getElementById('provider');
    const geminiSettings = document.getElementById('geminiSettings');
    const ollamaSettings = document.getElementById('ollamaSettings');
    const checkOllamaBtn = document.getElementById('check-ollama-btn');
    const ollamaModelSelect = document.getElementById('ollama_model');
    const saveConfigBtn = document.getElementById('save-config-btn');
    const initializeBtn = document.getElementById('initialize-btn');

    // Config Fields (LEFT SIDEBAR)
    const configFields = {
        gemini_api_key: document.getElementById('gemini_api_key'),
        gemini_model: document.getElementById('gemini_model'),
        ollama_endpoint: document.getElementById('ollama_endpoint'),
        ollama_model: document.getElementById('ollama_model'),
        embedding_model: document.getElementById('embedding_model'),
        rag_docs_path: document.getElementById('rag_docs_path'),
        vector_db_path: document.getElementById('vector_db_path'),
        system_prompt: document.getElementById('system_prompt')
    };

    // --- Utility Functions ---
    function showStatus(message, isError = false, targetElement = settingsStatus) {
        if (!targetElement) return; // Guard against null elements
        targetElement.textContent = message;
        targetElement.className = isError
            ? 'text-sm text-center text-red-500 h-4 mt-2' // Added margin top
            : 'text-sm text-center text-green-500 h-4 mt-2'; // Added margin top
        // Make Ollama connection error sticky until resolved by successful check/init
        if (targetElement !== ollamaConnectionStatus || !isError) {
            setTimeout(() => {
                // Check if the message is still the same before clearing
                if (targetElement.textContent === message) {
                    targetElement.textContent = '';
                }
            }, 5000); // Increased timeout
        }
    }


    function toggleSettingsView() {
        if (providerSelect.value === 'gemini') {
            geminiSettings.classList.remove('hidden');
            ollamaSettings.classList.add('hidden');
            if (ollamaConnectionStatus) ollamaConnectionStatus.textContent = ''; // Clear Ollama status when switching
        } else {
            geminiSettings.classList.add('hidden');
            ollamaSettings.classList.remove('hidden');
        }
    }

    // Auto-resize textarea
    function autoResizeTextarea() {
        chatInput.style.height = 'auto'; // Reset height
        let newHeight = chatInput.scrollHeight;
        // Apply max height constraint
        const maxHeight = 150; // Defined in CSS as max-height: 150px;
        if (newHeight > maxHeight) {
            newHeight = maxHeight;
            chatInput.style.overflowY = 'auto'; // Enable scroll if exceeds max height
        } else {
            chatInput.style.overflowY = 'hidden'; // Hide scroll if below max height
        }
        chatInput.style.height = `${newHeight}px`;
    }

    function addMessage(sender, text, isStreaming = false) {
        // Use marked.js to parse markdown *before* adding, handle potential errors
        let parsedText = '';
        try {
            // Configure marked to handle line breaks properly
            marked.setOptions({
                breaks: true, // Convert single line breaks to <br>
                gfm: true     // Use GitHub Flavored Markdown
            });
            parsedText = marked.parse(text || ''); // Ensure text is not null/undefined
        } catch (e) {
            console.error("Markdown parsing error:", e);
            parsedText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;"); // Basic HTML escaping as fallback
        }

        let messageHtml = '';
        const timestamp = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); // Add timestamp

        if (sender === 'user') {
            // User messages - apply basic escaping for safety, no markdown
            const safeText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
            messageHtml = `
                <div class="flex items-start gap-3 justify-end group">
                    <div class="flex flex-col gap-1 items-end">
                        <div class="bg-primary text-white p-3 rounded-l-lg rounded-br-lg max-w-lg shadow-sm">
                            <p class="text-base whitespace-pre-wrap">${safeText}</p> 
                        </div>
                        <span class="text-xs text-subtext-light dark:text-subtext-dark/80">${timestamp}</span>
                    </div>
                     <div class="bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-100 rounded-full size-10 flex-shrink-0 flex items-center justify-center font-semibold">
                         You
                     </div>
                </div>`;
        } else { // AI message
            const streamClass = isStreaming ? 'streaming-bubble' : '';
            // Use a subtle animation for streaming bubbles
            const animationStyle = isStreaming ? 'style="animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;"' : '';
            messageHtml = `
                <div class="flex items-start gap-3 max-w-[90%] group ${streamClass}" ${animationStyle}>
                    <div class="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10 flex-shrink-0 shadow-sm" data-alt="AI avatar" style='background-image: url("https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=1945&auto-format&fit-crop&ixlib-rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D");'></div>
                    <div class="flex flex-col gap-1 w-full">
                        <div class="bg-background-light dark:bg-background-dark p-3 rounded-r-lg rounded-bl-lg border border-border-light dark:border-border-dark shadow-sm">
                            <div class="text-base chat-bubble">${parsedText}</div> 
                        </div>
                         <span class="text-xs text-subtext-light dark:text-subtext-dark/80">${timestamp}</span>
                    </div>
                </div>`;
        }

        chatMessages.insertAdjacentHTML('beforeend', messageHtml);
        // Scroll smoothly only if the user isn't scrolled up significantly
        if (chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 200) {
            chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
        }
    }


    // --- API Calls ---

    async function loadConfig() {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error(`Failed to load config (${response.status})`);
            const config = await response.json();

            // Populate all fields
            for (const [key, element] of Object.entries(configFields)) {
                if (element && config[key] !== undefined) {
                    element.value = config[key];
                }
            }
            // Set provider (default to gemini if not set in loaded config)
            providerSelect.value = config.provider || 'gemini';

            // Ensure correct view is shown after loading
            toggleSettingsView();
            console.log("Config loaded:", config); // Log loaded config

        } catch (error) {
            console.error("Error loading config:", error);
            showStatus(error.message, true);
            // Keep default view (Gemini) on error
            toggleSettingsView();
        }
    }


    async function saveConfig() {
        try {
            const configData = {
                provider: providerSelect.value,
                gemini_api_key: configFields.gemini_api_key.value,
                gemini_model: configFields.gemini_model.value,
                ollama_endpoint: configFields.ollama_endpoint.value,
                ollama_model: configFields.ollama_model.value,
                embedding_model: configFields.embedding_model.value,
                rag_docs_path: configFields.rag_docs_path.value,
                vector_db_path: configFields.vector_db_path.value,
                system_prompt: configFields.system_prompt.value
            };

            const response = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(configData)
            });

            if (!response.ok) throw new Error(`Failed to save config (${response.status})`);
            showStatus('Configuration saved successfully!');
            console.log("Config saved:", configData);

        } catch (error) {
            console.error("Error saving config:", error);
            showStatus(error.message, true);
        }
    }

    async function checkOllama() {
        showStatus('Checking Ollama...', false, ollamaConnectionStatus); // Use specific status element
        ollamaModelSelect.innerHTML = '<option value="">Checking...</option>'; // Clear existing options
        ollamaModelSelect.disabled = true;
        checkOllamaBtn.disabled = true;

        try {
            const response = await fetch('/api/ollama-models');
            const result = await response.json(); // Always parse JSON first

            if (!response.ok) {
                throw new Error(result.detail || `Failed to connect (${response.status})`);
            }

            ollamaModelSelect.innerHTML = ''; // Clear "Checking..."
            if (result.models && result.models.length > 0) {
                result.models.forEach(model => {
                    const option = new Option(model, model);
                    ollamaModelSelect.add(option);
                });
                // Attempt to select the previously saved model, if any
                const savedModel = configFields.ollama_model.value;
                if (savedModel && result.models.includes(savedModel)) {
                    ollamaModelSelect.value = savedModel;
                }
                showStatus('Ollama models loaded!', false, ollamaConnectionStatus);
            } else {
                ollamaModelSelect.innerHTML = '<option value="">No LLM models found</option>';
                showStatus('Ollama connected, but no LLM models found.', true, ollamaConnectionStatus);
            }
        } catch (error) {
            console.error("Error checking Ollama:", error);
            ollamaModelSelect.innerHTML = '<option value="">Connection failed</option>';
            showStatus(`Error: ${error.message}. Is Ollama running?`, true, ollamaConnectionStatus);
        } finally {
            ollamaModelSelect.disabled = false;
            checkOllamaBtn.disabled = false;
        }
    }


    async function loadDocuments() {
        showStatus('Scanning documents...', false, settingsStatus); // Use main status for this
        scanDocsBtnRight.disabled = true;
        try {
            const response = await fetch('/api/documents');
            const data = await response.json(); // Always parse first

            if (!response.ok) throw new Error(data.detail || `Failed to scan documents (${response.status})`);

            docListContainerRight.innerHTML = ''; // Clear list in the right sidebar

            // Check for specific error message from backend
            if (data.error) {
                docListContainerRight.innerHTML = `<p class="text-red-500 text-sm">${data.message || 'Error loading documents.'}</p>`;
                showStatus(data.message || 'Error loading documents.', true, settingsStatus);
                return; // Stop processing
            }


            if (data.files && data.files.length > 0) {
                data.files.forEach(file => {
                    const div = document.createElement('div');
                    div.className = 'flex items-center';
                    const uniqueId = `doc-${file.path.replace(/[^a-zA-Z0-9]/g, '-')}`;
                    div.innerHTML = `
                        <input id="${uniqueId}" data-path="${file.path}" type="checkbox" class="document-checkbox h-4 w-4 text-primary rounded border-gray-300 focus:ring-primary mr-2 flex-shrink-0">
                        <label for="${uniqueId}" class="block text-sm text-text-light dark:text-text-dark cursor-pointer overflow-hidden overflow-ellipsis whitespace-nowrap" title="${file.path}">
                            ${file.name} <span class="text-xs text-subtext-light dark:text-subtext-dark">(${file.folder})</span>
                        </label>
                    `;
                    docListContainerRight.appendChild(div);
                });
                showStatus('Documents loaded.', false, settingsStatus);
            } else {
                docListContainerRight.innerHTML = `<p class="text-subtext-light dark:text-subtext-dark text-sm">${data.message || 'No documents found in the specified path.'}</p>`;
                showStatus('No documents found.', false, settingsStatus); // Not necessarily an error
            }
        } catch (error) {
            console.error("Error loading documents:", error);
            docListContainerRight.innerHTML = `<p class="text-red-500 text-sm">Error: ${error.message}</p>`;
            showStatus(`Error loading documents: ${error.message}`, true, settingsStatus);
        } finally {
            scanDocsBtnRight.disabled = false;
        }
    }


    async function initializeSystem() {
        showStatus('Initializing system...', false);
        initializeBtn.disabled = true;
        initializeBtn.innerHTML = '<span class="material-icons-outlined text-base animate-spin">refresh</span> <span>Initializing...</span>';

        // Clear previous Ollama connection errors if initializing again
        if (providerSelect.value === 'ollama') {
            ollamaConnectionStatus.textContent = '';
        }

        try {
            // Get selected files from the RIGHT sidebar
            const selectedFiles = Array.from(docListContainerRight.querySelectorAll('.document-checkbox:checked'))
                .map(cb => cb.dataset.path);

            // Validate essential config fields
            const configData = {
                provider: providerSelect.value,
                gemini_api_key: configFields.gemini_api_key.value,
                gemini_model: configFields.gemini_model.value,
                ollama_endpoint: configFields.ollama_endpoint.value,
                ollama_model: configFields.ollama_model.value,
                embedding_model: configFields.embedding_model.value,
                rag_docs_path: configFields.rag_docs_path.value,
                vector_db_path: configFields.vector_db_path.value,
                system_prompt: configFields.system_prompt.value
            };

            // Basic validation
            if (configData.provider === 'gemini' && !configData.gemini_api_key) {
                throw new Error("Gemini API Key is required.");
            }
            if (configData.provider === 'ollama' && !configData.ollama_model) {
                throw new Error("Ollama LLM Model must be selected. Click 'Check' first.");
            }
            if (!configData.rag_docs_path) {
                throw new Error("RAG Documents Path is required.");
            }
            if (!configData.vector_db_path) {
                throw new Error("Vector Database Path (Base) is required.");
            }


            const requestBody = {
                config: configData,
                selected_files: selectedFiles,
                force_rebuild: forceRebuildCheckboxRight.checked // Use checkbox from right sidebar
            };

            console.log("Initializing with request:", requestBody); // Log request

            const response = await fetch('/api/initialize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const result = await response.json();
            console.log("Initialize response:", result); // Log response

            if (!response.ok) {
                // Check if it's an Ollama connection error - more specific check
                if (providerSelect.value === 'ollama' && result.detail && (result.detail.toLowerCase().includes('connect to ollama') || result.detail.toLowerCase().includes('connection refused'))) {
                    showStatus(`${result.detail}. Is Ollama running?`, true, ollamaConnectionStatus);
                    throw new Error(result.detail); // Prevent success message
                } else {
                    throw new Error(result.detail || `Initialization failed (${response.status})`);
                }
            }

            showStatus(result.message || 'System initialized successfully!', false);
            addMessage('ai', `✅ ${result.message || 'System initialized successfully!'}`);

        } catch (error) {
            console.error("Initialization error:", error);
            // Only show general error if it wasn't the specific Ollama connection issue
            if (!ollamaConnectionStatus.textContent || !ollamaConnectionStatus.textContent.includes("Ollama running")) {
                showStatus(`Init Error: ${error.message}`, true);
                addMessage('ai', `**Initialization Error:** ${error.message}`);
            } else {
                addMessage('ai', `**Initialization Error:** Could not connect to Ollama. Please ensure it's running and click **Initialize** again.`);
            }
        } finally {
            initializeBtn.disabled = false;
            initializeBtn.innerHTML = '<span class="material-icons-outlined text-base">rocket_launch</span> <span>Initialize</span>';
        }
    }


    async function sendMessage(event) {
        event.preventDefault();
        const query = chatInput.value.trim();
        if (!query) return;

        addMessage('user', query);
        chatInput.value = '';
        autoResizeTextarea(); // Reset height after sending
        sendBtn.disabled = true;
        sendBtn.classList.add('animate-pulse'); // Add pulse animation

        // Create a streaming message bubble placeholder
        addMessage('ai', '<span class="material-icons-outlined text-base animate-spin mr-2">pending</span><span>Thinking...</span>', true);
        const streamingBubbleContainer = chatMessages.querySelector('.streaming-bubble'); // Target the outer container
        const streamingBubbleContent = streamingBubbleContainer?.querySelector('.chat-bubble'); // Target the inner content div

        if (!streamingBubbleContent) {
            console.error("Could not find streaming bubble content element");
            sendBtn.disabled = false;
            sendBtn.classList.remove('animate-pulse');
            return; // Exit if the placeholder wasn't added correctly
        }


        try {
            // Initialize AbortController
            if (abortController) abortController.abort(); // Cancel any previous
            abortController = new AbortController();

            // Toggle buttons
            sendBtn.classList.add('hidden');
            stopBtn.classList.remove('hidden');

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query, mode: currentMode }),
                signal: abortController.signal
            });


            if (!response.ok || !response.body) {
                // Try to read error JSON if possible, otherwise use status text
                let errorDetail = `Failed to get response (${response.status})`;
                try {
                    const err = await response.json();
                    errorDetail = err.detail || errorDetail;
                } catch (e) { /* Ignore parsing error if body isn't JSON */ }

                // Check for specific initialization errors from the stream endpoint
                if (errorDetail.toLowerCase().includes("provider not initialized")) {
                    throw new Error("Provider not initialized. Configure settings and click 'Initialize'.");
                } else if (errorDetail.toLowerCase().includes("no vectorstore is loaded")) {
                    throw new Error("RAG mode requires initialized documents. Select files and click 'Initialize'.");
                }
                throw new Error(errorDetail);
            }


            // Read the stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = '';
            streamingBubbleContent.innerHTML = ' '; // Clear "Thinking..." but keep space

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                fullResponse += chunk;
                // Add blinking cursor effect only if content exists
                const cursor = fullResponse ? '▋' : '';
                streamingBubbleContent.innerHTML = marked.parse(fullResponse + cursor);
                // Scroll smoothly only if the user isn't scrolled up significantly
                if (chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 200) {
                    chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
                }
            }

            // Final render without cursor
            streamingBubbleContent.innerHTML = marked.parse(fullResponse);
            streamingBubbleContainer?.style.removeProperty('animation'); // Remove pulse
            streamingBubbleContainer?.classList.remove('streaming-bubble'); // Remove class


        } catch (error) {
            if (error.name === 'AbortError') {
                console.log("Fetch aborted by user");
                if (streamingBubbleContent) {
                    // Just append a small note or do nothing if we want to keep partial text
                    // streamingBubbleContent.innerHTML += " <span class='text-xs text-red-500'>(Stopped)</span>";
                    // Or just leave it as is.
                }
            } else {
                console.error("Chat error:", error);
                if (streamingBubbleContent) {
                    // Display error within the bubble
                    addMessage('ai', `**Error:** ${error.message}`); // Add a *new* error message bubble
                    streamingBubbleContainer?.remove(); // Remove the placeholder bubble
                } else {
                    addMessage('ai', `**Error:** ${error.message}`); // Add error message if placeholder failed
                }
            }
        } finally {
            sendBtn.disabled = false;
            sendBtn.classList.remove('animate-pulse'); // Remove pulse animation
            sendBtn.classList.remove('hidden');
            stopBtn.classList.add('hidden');
            abortController = null;
            chatInput.focus(); // Refocus input field
            autoResizeTextarea(); // Ensure height is correct after potential error
        }
    }


    // --- Event Listeners ---

    // Sidebar Toggles
    leftSidebarToggle.addEventListener('click', () => {
        document.body.classList.toggle('sidebar-left-collapsed');
    });

    rightSidebarToggle.addEventListener('click', () => {
        document.body.classList.toggle('sidebar-right-collapsed');
    });

    // Chat/RAG Toggle
    chatModeBtn.addEventListener('click', () => {
        currentMode = 'chat';
        chatModeBtn.className = "px-4 py-1.5 text-sm font-semibold rounded-full bg-primary text-white shadow-sm";
        ragModeBtn.className = "px-4 py-1.5 text-sm font-semibold text-subtext-light dark:text-subtext-dark rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors";
        addMessage('ai', 'Switched to **Chat Mode**.');
    });

    ragModeBtn.addEventListener('click', () => {
        currentMode = 'rag';
        ragModeBtn.className = "px-4 py-1.5 text-sm font-semibold rounded-full bg-primary text-white shadow-sm";
        chatModeBtn.className = "px-4 py-1.5 text-sm font-semibold text-subtext-light dark:text-subtext-dark rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors";
        addMessage('ai', 'Switched to **RAG Mode**. Ensure documents are selected (right sidebar) and system is initialized (left sidebar).');
    });

    // Settings
    providerSelect.addEventListener('change', toggleSettingsView);
    checkOllamaBtn.addEventListener('click', checkOllama);
    saveConfigBtn.addEventListener('click', saveConfig);
    initializeBtn.addEventListener('click', initializeSystem);

    // Documents (use the button in the right sidebar)
    scanDocsBtnRight.addEventListener('click', loadDocuments);

    // Chat Input & Form
    chatInput.addEventListener('input', autoResizeTextarea);
    chatForm.addEventListener('submit', sendMessage);

    stopBtn.addEventListener('click', () => {
        if (abortController) {
            abortController.abort();
            abortController = null;
        }
    });

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(e);
        }
    });

    // --- Initial Load ---
    loadConfig(); // Load config which sets default provider and calls toggleSettingsView

    // Initial resize for textarea if it has default content (unlikely but safe)
    autoResizeTextarea();
});