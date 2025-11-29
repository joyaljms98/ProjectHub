    // Global user object, populated by populateUserInfo()
    let projectHubUser = null;
    
    // document.addEventListener('DOMContentLoaded', function() {

    // Function to fetch and populate user info
    async function populateUserInfo() {
        try {
            const response = await fetch(`${API_BASE_URL}/users/me`, {
                method: 'GET',
                headers: getAuthHeaders() // Assumes getAuthHeaders() is available
            });

            if (!response.ok) {
                // If token is bad, redirect to login
                if (response.status === 401) {
                    localStorage.removeItem('accessToken');
                    window.location.href = 'home.html';
                    return;
                }
                throw new Error('Could not fetch user info');
            }
            
            const user = await response.json();
            projectHubUser = user; // Store user globally

            // --- THIS IS THE MISSING CODE ---
            // Populate sidebar profile
            const userNameEl = document.getElementById('user-full-name');
            if (userNameEl) {
                userNameEl.textContent = user.fullName || 'User';
            }
            
            const userRoleEl = document.getElementById('user-role');
            if (userRoleEl) {
                userRoleEl.textContent = user.role || 'Role';
            }

            // Populate dashboard welcome message
            const welcomeNameEl = document.getElementById('user-welcome-name');
            if (welcomeNameEl) {
                // Get the first name
                welcomeNameEl.textContent = user.fullName ? user.fullName.split(' ')[0] : 'User';
            }
            // --- END OF MISSING CODE ---

            // Populate sticky note
            const stickyNoteTextarea = document.getElementById('sticky-note-textarea');
            if (stickyNoteTextarea && user.stickyNote) {
                stickyNoteTextarea.value = user.stickyNote;
            }

        } catch (error) {
            console.error("Failed to populate user info:", error);
            // On failure, it will just show the hardcoded placeholder names
        }
    }
    // call to populate user details on dashboard load
    // populateUserInfo().catch(err => {
    //     console.error('Failed to populate user info:', err);
    // });

    // --- SMOOTH SCROLL CLASS ---
    class Smooth {
        constructor() {
            this.bindMethods()
            this.data = {
                ease: 0.1,
                current: 0,
                last: 0,
                rounded: 0
            }
            this.dom = {
                el: document.querySelector('[data-scroll]'),
                content: document.querySelector('[data-scroll-content]')
            }
            this.rAF = null
            this.init()
        }

        bindMethods() {
            ['scroll', 'run', 'resize']
            .forEach((fn) => this[fn] = this[fn].bind(this))
        }

        setStyles() {
            const isCollapsed = document.body.classList.contains('sidebar-collapsed');

            Object.assign(this.dom.el.style, {
                position: 'fixed',
                top: 0,
                left: isCollapsed ? '0rem' : '16rem', 
                right: 0,
                height: '100%',
                overflow: 'hidden',
                transition: 'left 0.3s ease-in-out' // Added transition
            });

        }

        setHeight() {
            if(this.dom.content) {
                document.body.style.height = `${this.dom.content.getBoundingClientRect().height}px`
            }
        }

        resize() {
            // ** FIX: Wait for images to load *before* setting height **
            if (this.dom.content && window.imagesLoaded) {
                imagesLoaded(this.dom.content, () => {
                    this.setHeight();
                });
            } else {
                // Fallback if imagesLoaded isn't available or no content
                this.setHeight();
            }
            
            this.setStyles() 
            this.scroll() // Run scroll to update
        }

        preload() {
             if(this.dom.content) {
                imagesLoaded(this.dom.content, (instance) => {
                    this.setHeight()
                })
            }
        }

        scroll() {
            this.data.current = window.scrollY
        }

        run() {
            this.data.last += (this.data.current - this.data.last) * this.data.ease
            this.data.rounded = Math.round(this.data.last * 100) / 100
            
            if(this.dom.content) {
                this.dom.content.style.transform = `translate3d(0, -${this.data.rounded}px, 0)`
            }
            
            this.requestAnimationFrame()
        }

        on() {
            this.setStyles()
            //this.setHeight()
            this.addEvents()
            this.requestAnimationFrame()
        }

        off() {
            this.cancelAnimationFrame()
            this.removeEvents()
        }

        requestAnimationFrame() {
            this.rAF = requestAnimationFrame(this.run)
        }

        cancelAnimationFrame() {
            cancelAnimationFrame(this.rAF)
        }

        destroy() {
            document.body.style.height = ''
            this.data = null
            this.removeEvents()
            this.cancelAnimationFrame()
        }

        addEvents() {
            window.addEventListener('resize', this.resize, { passive: true })
            window.addEventListener('scroll', this.scroll, { passive: true })
        }

        removeEvents() {
            window.removeEventListener('resize', this.resize, { passive: true })
            window.removeEventListener('scroll', this.scroll, { passive: true })
        }

        init() {
            this.preload()
            this.on()
        }
    }
    // --- END SMOOTH SCROLL CLASS ---


    // --- SPA NAVIGATION LOGIC ---
    window.smoothScroller = null;
    try {
        window.smoothScroller = new Smooth();
    } catch(e) {
        console.warn("Smooth scroll init failed. Using native scroll.", e);
        const scrollEl = document.querySelector('[data-scroll]');
        if(scrollEl) {
            scrollEl.style.position = 'relative';
            scrollEl.style.overflow = 'visible';
        }
         document.body.style.height = 'auto'; // Reset body height
    }

    const transitionDuration = 300; 
    let currentPageId = 'dashboard-page'; 
    
    const allNavLinks = document.querySelectorAll('.nav-link');
    const floatingChatBtn = document.getElementById('floating-chat-btn');
    
    const activeClasses = ['bg-accent-light', 'dark:bg-accent-dark', 'text-primary', 'dark:text-white', 'font-semibold'];
    const inactiveClasses = ['text-subtext-light', 'dark:text-subtext-dark', 'hover:bg-gray-100', 'dark:hover:bg-gray-700'];

    
    // --- HAMBURGER TOGGLE LOGIC ---
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const menuIcon = document.getElementById('menu-icon');
    const closeIcon = document.getElementById('close-icon');

    if (hamburgerBtn) {
        hamburgerBtn.addEventListener('click', function() {
            document.body.classList.toggle('sidebar-collapsed');
            if (menuIcon) menuIcon.classList.toggle('hidden');
            if (closeIcon) closeIcon.classList.toggle('hidden');
            
            if (smoothScroller) {
                setTimeout(() => {
                   smoothScroller.resize();
                }, 0); // Use timeout to wait for layout shift
            }
        });
    }
    // --- END HAMBURGER LOGIC ---

    // This is the missing function
    window.showPage = function(targetId) {
        if (!targetId || currentPageId === targetId) return;

        const targetPage = document.getElementById(targetId);
        const currentPage = document.getElementById(currentPageId);
        const settingsBar = document.getElementById('settings-save-bar');
        
        if (!targetPage) {
            console.warn(`Target page "${targetId}" not found.`);
            return;
        }

        if (currentPage) {
            currentPage.style.opacity = '0';
        }

        setTimeout(() => {
            if (currentPage) {
                currentPage.classList.add('hidden');
            }
            targetPage.classList.remove('hidden');

            requestAnimationFrame(() => {
                targetPage.style.opacity = '1';
            });
            
            
            allNavLinks.forEach(link => {
                if(link.closest('aside')) { // Only affect sidebar links
                    link.classList.remove(...activeClasses);
                    link.classList.add(...inactiveClasses);
                }
            });
            
            const activeLink = document.querySelector(`aside .nav-link[data-target="${targetId}"]`);
            if (activeLink) {
                activeLink.classList.remove(...inactiveClasses);
                activeLink.classList.add(...activeClasses);
            }
            
            // Reset Scroll Position
            if (smoothScroller) {
                smoothScroller.data.current = 0;
                smoothScroller.data.last = 0;
                smoothScroller.data.rounded = 0;
                window.scrollTo(0, 0); // Force scroll to top
                smoothScroller.resize(); // Recalculate height and reset position
            } else {
                 window.scrollTo(0, 0); // Native scroll reset
            }

            currentPageId = targetId;

        }, transitionDuration);
    }
    
    allNavLinks.forEach(link => {
        link.addEventListener('click', function (event) {
            event.preventDefault(); 
            const targetId = this.dataset.target;
            if(targetId) {
                window.showPage(targetId);
            }
        });
    });

    // --- Set initial state on page load ---
    const initialActiveLink = document.querySelector(`aside .nav-link[data-target="${currentPageId}"]`);
    allNavLinks.forEach(link => {
        if(link.closest('aside')) {
            link.classList.remove(...activeClasses);
            link.classList.add(...inactiveClasses);
        }
    });
    if (initialActiveLink) {
        initialActiveLink.classList.remove(...inactiveClasses);
        initialActiveLink.classList.add(...activeClasses);
    }

    // --- STICKY NOTES LOGIC ---
    function initializeStickyNote(textareaId, buttonId, storageKey) {
        const textarea = document.getElementById(textareaId);
        const saveButton = document.getElementById(buttonId);

        if (textarea && saveButton) {
            // Load saved note
            textarea.value = localStorage.getItem(storageKey) || '';

            // Save note
            saveButton.addEventListener('click', () => {
                localStorage.setItem(storageKey, textarea.value);
                // Optional: Add a "saved" confirmation
                const originalText = saveButton.innerText;
                saveButton.innerText = 'Saved!';
                setTimeout(() => {
                    saveButton.innerText = originalText;
                }, 1500);
            });
        }
    }

    initializeStickyNote('student-sticky-note', 'save-student-note', 'studentStickyNote');
    initializeStickyNote('teacher-sticky-note', 'save-teacher-note', 'teacherStickyNote');
    // Note: admin-sticky-note does not exist in the provided admin HTML, but we leave the hook.

    // --- CALENDAR WIDGET LOGIC ---
    function renderCalendar(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const date = new Date();
        const year = date.getFullYear();
        const month = date.getMonth();
        const today = date.getDate();

        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

        let calendarHTML = `
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-semibold text-text-light dark:text-text-dark">${monthNames[month]} ${year}</h3>
                <div class="flex gap-2">
                    <span class="material-icons text-subtext-light dark:text-subtext-dark cursor-pointer">chevron_left</span>
                    <span class="material-icons text-subtext-light dark:text-subtext-dark cursor-pointer">chevron_right</span>
                </div>
            </div>
            <div class="grid grid-cols-7 gap-1 text-center">
        `;

        // Day names
        dayNames.forEach(day => {
            calendarHTML += `<div class="text-xs font-medium text-subtext-light dark:text-subtext-dark">${day}</div>`;
        });

        // Empty cells for the first day
        for (let i = 0; i < firstDayOfMonth; i++) {
            calendarHTML += `<div></div>`;
        }

        // Day numbers
        for (let day = 1; day <= daysInMonth; day++) {
            let dayClasses = "flex items-center justify-center size-8 rounded-full text-sm";
            if (day === today) {
                dayClasses += " bg-primary text-white font-bold";
            } else {
                dayClasses += " text-text-light dark:text-text-dark";
            }
            calendarHTML += `<div class="${dayClasses}">${day}</div>`;
        }

        calendarHTML += `</div>`;
        container.innerHTML = calendarHTML;
    }

    renderCalendar('student-calendar-widget');
    renderCalendar('teacher-calendar-widget');
    // Note: admin-calendar-widget does not exist in the provided admin HTML, but we leave the hook.

    // --- STICKY NOTE LOGIC ---
    const stickyNoteBtn = document.getElementById('floating-sticky-note-btn');
    const stickyNoteModal = document.getElementById('sticky-note-modal');
    const stickyNoteOverlay = document.getElementById('sticky-note-overlay');
    const stickyNoteClose = document.getElementById('sticky-note-close');
    const stickyNoteSave = document.getElementById('sticky-note-save');
    const stickyNoteClear = document.getElementById('sticky-note-clear');
    const stickyNoteText = document.getElementById('sticky-note-textarea');
    const stickyNoteMsg = document.getElementById('sticky-note-message');

    function openStickyNote() {
        if (stickyNoteModal) stickyNoteModal.classList.remove('hidden');
        if (stickyNoteText) stickyNoteText.focus();
    }
    
    function closeStickyNote() {
        if (stickyNoteModal) stickyNoteModal.classList.add('hidden');
        if (stickyNoteMsg) stickyNoteMsg.textContent = '';
    }

    async function saveStickyNote() {
        if (!stickyNoteText || !stickyNoteMsg) return;
        
        const note = stickyNoteText.value;
        stickyNoteMsg.textContent = 'Saving...';
        
        try {
            const response = await fetch(`${API_BASE_URL}/users/me/note`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ stickyNote: note })
            });
            
            if (!response.ok) throw new Error('Failed to save');
            
            stickyNoteMsg.textContent = 'Saved!';
            setTimeout(closeStickyNote, 1000);

        } catch (error) {
            console.error('Error saving note:', error);
            stickyNoteMsg.textContent = 'Error saving.';
        }
    }
    
    function clearStickyNote() {
        if (stickyNoteText) stickyNoteText.value = '';
        saveStickyNote(); // Save the empty note
    }

    // Attach listeners
    if (stickyNoteBtn) stickyNoteBtn.addEventListener('click', openStickyNote);
    if (stickyNoteOverlay) stickyNoteOverlay.addEventListener('click', closeStickyNote);
    if (stickyNoteClose) stickyNoteClose.addEventListener('click', closeStickyNote);
    if (stickyNoteSave) stickyNoteSave.addEventListener('click', saveStickyNote);
    if (stickyNoteClear) stickyNoteClear.addEventListener('click', clearStickyNote);
    // --- END OF LOGIC ---

// });


