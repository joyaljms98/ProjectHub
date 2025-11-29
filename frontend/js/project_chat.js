document.addEventListener('DOMContentLoaded', () => {
    
    // --- Global Elements ---
    const chatMessages = document.getElementById('chat-messages');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const chatLoading = document.getElementById('chat-loading');
    const chatTitle = document.getElementById('chat-title');
    const chatSubtitle = document.getElementById('chat-subtitle');
    const userNameEl = document.getElementById('user-name');
    const userAvatarEl = document.getElementById('user-avatar');

    // --- State ---
    let currentUser = null;
    let projectId = null;
    let phaseOrder = null;
    const API_BASE_URL = "http://127.0.0.1:8001";
    const phaseNames = ["", "Phase 1: Abstract", "Phase 2: Design", "Phase 3: Development", "Phase 4: Report"];

    // --- Helper Functions ---
    function getAuthToken() {
        return localStorage.getItem('accessToken');
    }

    function getAuthHeaders() {
        const token = getAuthToken();
        if (!token) {
            window.location.href = 'home.html';
        }
        return {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        };
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function formatDate(dateString) {
        if (!dateString) return "";
        const date = new Date(dateString);
        return date.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });
    }

    /**
     * Renders a single chat message to the DOM
     */
    function renderMessage(msg) {
        if (chatLoading) chatLoading.style.display = 'none';

        const isMe = msg.senderId === currentUser._id;
        const alignClass = isMe ? 'justify-end' : 'justify-start';
        const bubbleClass = isMe ? 'chat-bubble-me rounded-l-lg rounded-br-lg' : 'chat-bubble-other rounded-r-lg rounded-bl-lg';
        const senderName = isMe ? 'You' : `${msg.senderName} (${msg.senderRole})`;
        
        const messageHtml = `
            <div classclass="flex ${alignClass} w-full">
                <div class="flex flex-col max-w-lg">
                    <span class="text-xs font-medium text-subtext-light dark:text-subtext-dark ${isMe ? 'text-right' : 'text-left'} mb-1">${senderName}</span>
                    <div class="p-3 rounded-lg ${bubbleClass} shadow-sm">
                        <p class="text-base whitespace-pre-wrap">${msg.messageText}</p>
                    </div>
                    <span class="text-xs text-subtext-light dark:text-subtext-dark ${isMe ? 'text-right' : 'text-left'} mt-1">${formatDate(msg.sentAt)}</span>
                </div>
            </div>
        `;
        chatMessages.insertAdjacentHTML('beforeend', messageHtml);
    }

    /**
     * Fetches and renders all messages for the current chat
     */
    async function loadMessages() {
        if (!projectId || !phaseOrder) return;
        
        chatLoading.style.display = 'block';
        chatMessages.innerHTML = ''; // Clear old messages

        try {
            const response = await fetch(`${API_BASE_URL}/projects/${projectId}/phases/${phaseOrder}/chat`, {
                method: 'GET',
                headers: getAuthHeaders()
            });

            if (!response.ok) {
                throw new Error('Could not fetch messages.');
            }
            
            const messages = await response.json();
            
            if (messages.length === 0) {
                chatLoading.textContent = 'No messages yet. Start the conversation!';
            } else {
                messages.forEach(renderMessage);
            }
            
            scrollToBottom();

        } catch (error) {
            console.error('Error loading messages:', error);
            chatLoading.textContent = `Error: ${error.message}`;
        }
    }

    /**
     * Sends a new chat message
     */
    async function sendMessage(event) {
        event.preventDefault();
        const messageText = chatInput.value.trim();
        if (!messageText || !projectId || !phaseOrder) return;

        sendBtn.disabled = true;
        chatInput.disabled = true;

        try {
            const response = await fetch(`${API_BASE_URL}/projects/${projectId}/phases/${phaseOrder}/chat`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ messageText })
            });

            if (!response.ok) {
                throw new Error('Failed to send message.');
            }

            const newMessage = await response.json();
            renderMessage(newMessage);
            chatInput.value = '';
            scrollToBottom();
            
        } catch (error) {
            console.error('Error sending message:', error);
            // Optionally show error in chat
        } finally {
            sendBtn.disabled = false;
            chatInput.disabled = false;
            chatInput.focus();
        }
    }

    /**
     * Fetches the current user's details
     */
    async function loadCurrentUser() {
        try {
            const response = await fetch(`${API_BASE_URL}/users/me`, {
                method: 'GET',
                headers: getAuthHeaders()
            });
            if (!response.ok) throw new Error('Could not fetch user.');
            
            currentUser = await response.json();
            
            // Populate header
            userNameEl.textContent = currentUser.fullName;
            userAvatarEl.textContent = currentUser.fullName.charAt(0).toUpperCase();

        } catch (error) {
            console.error(error);
            userNameEl.textContent = 'Error';
        }
    }

    /**
     * Main initialization
     */
    async function init() {
        // Get project/phase from URL
        const params = new URLSearchParams(window.location.search);
        projectId = params.get('projectId');
        phaseOrder = parseInt(params.get('phaseOrder'), 10);

        if (!projectId || !phaseOrder) {
            chatLoading.textContent = 'Error: Project ID or Phase not specified in URL.';
            return;
        }
        
        // Update titles
        chatTitle.textContent = `Project Chat`;
        chatSubtitle.textContent = phaseNames[phaseOrder] || 'Unknown Phase';

        // Load user and then messages
        await loadCurrentUser();
        await loadMessages();

        // Setup form listener
        chatForm.addEventListener('submit', sendMessage);
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(e);
            }
        });
    }

    init();
});