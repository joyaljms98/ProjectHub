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
    // Debug logs for time parsing (disabled by default)
    const DEBUG_TIME = false;
    let projectOwnerId = null;
    let projectGuideId = null;
    const API_BASE_URL = "http://127.0.0.1:8001";
    const phaseNames = ["", "Phase 1: Abstract", "Phase 2: Design", "Phase 3: Development", "Phase 4: Report"];
    
    // Track rendered message IDs to prevent duplicates during polling
    const processedMessageIds = new Set();
    let isFirstLoad = true;

    // --- Helper Functions ---
    function getAuthToken() {
        return localStorage.getItem('accessToken');
    }

    function getAuthHeaders() {
        const token = getAuthToken();
        if (!token) {
            // Close window if opened as popup, or redirect
            if(window.opener) {
                window.close();
            } else {
                window.location.href = 'home.html';
            }
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
        // Parse the incoming date string. Backend sends ISO strings with timezone,
        // but if a timezone is missing we should treat it as UTC.
        function parseAssumeUTC(s) {
            if (!s) return null;
            // If string already contains 'Z' or a timezone offset like +05:30, use as-is
            if (/[zZ]|[+\-]\d{2}:?\d{2}$/.test(s)) {
                return new Date(s);
            }
            // Otherwise append 'Z' to treat it as UTC
            return new Date(s + 'Z');
        }

        const date = parseAssumeUTC(dateString);
        if (!date || isNaN(date.getTime())) return dateString;

        // Manually compute IST (UTC+5:30) to avoid relying on browser support for timeZone
        const IST_OFFSET_MIN = 5 * 60 + 30; // +5:30 in minutes
        const istDate = new Date(date.getTime() + IST_OFFSET_MIN * 60000);

        // Use UTC getters on the shifted date to get IST components reliably
        const day = istDate.getUTCDate();
        const monthIdx = istDate.getUTCMonth();
        const year = istDate.getUTCFullYear();
        let hours = istDate.getUTCHours();
        const minutes = istDate.getUTCMinutes();

        // 12-hour format
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        if (hours === 0) hours = 12;

        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const minuteStr = minutes.toString().padStart(2, '0');
        // 24-hour zero-padded hour
        const hour24Str = istDate.getUTCHours().toString().padStart(2, '0');
        return `${hour24Str}:${minuteStr}, ${day} ${monthNames[monthIdx]} IST`;
    }

    /**
     * Renders a single chat message to the DOM
     */
    function renderMessage(msg) {
        if (chatLoading) chatLoading.style.display = 'none';

        // Prevent duplicates if logic fails elsewhere
        if (document.getElementById(`msg-${msg._id}`)) return;

        const isMe = msg.senderId === currentUser._id;
        const alignClass = isMe ? 'justify-end' : 'justify-start';
        const bubbleClass = isMe ? 'chat-bubble-me rounded-l-lg rounded-br-lg' : 'chat-bubble-other rounded-r-lg rounded-bl-lg';
        const senderName = isMe ? 'You' : `${msg.senderName} (${msg.senderRole})`;
        // Determine delete permission: sender, project owner or project guide
        const canDelete = isMe || (currentUser && projectOwnerId && currentUser._id === projectOwnerId) || (currentUser && projectGuideId && currentUser._id === projectGuideId);

        const messageHtml = `
            <div id="msg-${msg._id}" class="flex ${alignClass} w-full fade-in">
                <div class="flex flex-col max-w-lg">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-medium text-subtext-light dark:text-subtext-dark ${isMe ? 'text-right' : 'text-left'} mb-1">${senderName}</span>
                        ${canDelete ? `<button class="delete-msg-inline text-xs text-red-500" data-msgid="${msg._id}">Delete</button>` : ''}
                    </div>
                    <div class="p-3 rounded-lg ${bubbleClass} shadow-sm">
                        <p class="text-base whitespace-pre-wrap">${msg.messageText}</p>
                    </div>
                    <span class="text-xs text-subtext-light dark:text-subtext-dark ${isMe ? 'text-right' : 'text-left'} mt-1">${formatDate(msg.sentAt)}</span>
                </div>
            </div>
        `;
        chatMessages.insertAdjacentHTML('beforeend', messageHtml);

        // attach delete handler if applicable
        if (canDelete) {
            const btn = chatMessages.querySelector(`#msg-${msg._id} .delete-msg-inline`);
            if (btn) btn.addEventListener('click', () => deleteMessage(msg._id));
        }
    }

    /**
     * Fetches and renders messages (Updated for Polling)
     */
    async function loadMessages() {
        if (!projectId || !phaseOrder) return;
        
        // Don't show loading spinner on background polls, only first load
        if (isFirstLoad && chatLoading) chatLoading.style.display = 'block';

        try {
            const response = await fetch(`${API_BASE_URL}/projects/${projectId}/phases/${phaseOrder}/chat`, {
                method: 'GET',
                headers: getAuthHeaders()
            });

            if (!response.ok) {
                // If 401/403, stop polling
                if(response.status === 401 || response.status === 403) return;
                throw new Error('Could not fetch messages.');
            }
            
            const messages = await response.json();

            // Sort messages by 'sentAt' ascending (oldest first)
            messages.sort((a, b) => {
                const ta = a && a.sentAt ? new Date(a.sentAt).getTime() : 0;
                const tb = b && b.sentAt ? new Date(b.sentAt).getTime() : 0;
                return ta - tb;
            });

            let hasNewMessages = false;

            if (messages.length === 0 && isFirstLoad) {
                chatLoading.textContent = 'No messages yet. Start the conversation!';
            } else {
                messages.forEach(msg => {
                    // Only render if we haven't seen this ID yet
                    if (!processedMessageIds.has(msg._id)) {
                        renderMessage(msg);
                        processedMessageIds.add(msg._id);
                        hasNewMessages = true;
                    }
                });
            }
            
            // Only scroll if we found new items or it's the very first load
            if (hasNewMessages || isFirstLoad) {
                scrollToBottom();
                isFirstLoad = false;
            }

        } catch (error) {
            console.error('Error loading messages:', error);
            if (isFirstLoad) chatLoading.textContent = `Error: ${error.message}`;
        }
    }

    // Fetch basic project info (owner/guide) to determine delete permissions
    async function loadProjectInfo() {
        if (!projectId) return;
        try {
            const response = await fetch(`${API_BASE_URL}/projects/${projectId}`, {
                method: 'GET',
                headers: getAuthHeaders()
            });
            if (!response.ok) {
                console.warn('Could not fetch project info for delete permissions');
                return;
            }
            const proj = await response.json();
            projectOwnerId = proj.ownerId || null;
            projectGuideId = proj.guideId || null;
        } catch (err) {
            console.warn('Error loading project info:', err);
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
            
            // Render immediately and add to processed set so polling doesn't duplicate it
            if (!processedMessageIds.has(newMessage._id)) {
                renderMessage(newMessage);
                processedMessageIds.add(newMessage._id);
            }
            
            chatInput.value = '';
            scrollToBottom();
            
        } catch (error) {
            console.error('Error sending message:', error);
            alert("Failed to send message. Please try again.");
        } finally {
            sendBtn.disabled = false;
            chatInput.disabled = false;
            chatInput.focus();
        }
    }

    async function deleteMessage(messageId) {
        if (!confirm('Delete this message?')) return;
        try {
            const response = await fetch(`${API_BASE_URL}/projects/${projectId}/phases/${phaseOrder}/chat/${messageId}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            if (!response.ok) {
                const txt = await response.text();
                throw new Error(txt || 'Failed to delete message');
            }
            const el = document.getElementById(`msg-${messageId}`);
            if (el) el.remove();
            processedMessageIds.delete(messageId);
        } catch (err) {
            console.error('Error deleting message:', err);
            alert('Could not delete message.');
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

        // Load user first (needed for ID comparison)
        await loadCurrentUser();
        // Load project info to determine delete permissions
        await loadProjectInfo();
        // Initial load of messages
        await loadMessages();

        // Setup form listener
        chatForm.addEventListener('submit', sendMessage);
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(e);
            }
        });

        // --- Auto-Refresh Logic (Polling every 3 seconds) ---
        setInterval(() => {
            loadMessages();
        }, 3000);
    }

    init();
});