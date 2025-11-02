document.addEventListener('DOMContentLoaded', function () {

    const mainHeader = document.getElementById('main-header');
    const backButton = document.getElementById('back-button');
    let lastScrollTop = 0;

    const background = document.getElementById('main-background');
    const initialZoom = 1.10;

    // --- Backend API URL ---
    const API_BASE_URL = "http://127.0.0.1:8001"; // Make sure this matches your FastAPI backend port

    // --- START: Smooth Scroll Class (Keep existing class definition) ---
    const math = {
        lerp: (a, b, n) => (1 - n) * a + n * b,
        norm: (value, min, max) => (value - min) / (max - min)
    };
    const config = { height: window.innerHeight, width: window.innerWidth };

    class Smooth {
        constructor() {
            this.bindMethods();
            this.data = { ease: 0.08, current: 0, last: 0, rounded: 0 };
            this.dom = { el: document.querySelector('[data-scroll]'), content: document.querySelector('[data-scroll-content]') };
            this.rAF = null;
            this.init();
        }
        bindMethods() { ['scroll', 'run', 'resize'].forEach((fn) => this[fn] = this[fn].bind(this)); }
        setStyles() { Object.assign(this.dom.el.style, { position: 'fixed', top: 0, left: 0, height: '100%', width: '100%', overflow: 'hidden' }); }
        setHeight() { if(this.dom.content) document.body.style.height = `${this.dom.content.getBoundingClientRect().height}px`; }
        resize() { this.setHeight(); this.data.rounded = this.data.last = this.data.current; this.scroll(); } // Added scroll() call
        preload() { if (this.dom.content) imagesLoaded(this.dom.content, () => this.setHeight()); }
        scroll() { this.data.current = window.scrollY; }
        run() {
            this.data.last += (this.data.current - this.data.last) * this.data.ease;
            this.data.rounded = Math.round(this.data.last * 100) / 100;
            const currentScroll = this.data.rounded;
            const headerHeight = mainHeader ? mainHeader.offsetHeight : 68; // Fallback height

            if (document.getElementById('home-page') && !document.getElementById('home-page').classList.contains('hidden')) {
                 if(mainHeader) mainHeader.classList.remove('header-hidden');
            } else if (currentScroll > lastScrollTop && currentScroll > headerHeight) {
                if(mainHeader) mainHeader.classList.add('header-hidden');
            } else if (currentScroll < lastScrollTop) {
                 if(mainHeader) mainHeader.classList.remove('header-hidden');
            }
            lastScrollTop = currentScroll <= 0 ? 0 : currentScroll;

            if(this.dom.content) this.dom.content.style.transform = `translate3d(0, -${this.data.rounded}px, 0)`;
            this.handleScrollZoomAndPosition(this.data.rounded);
            this.requestAnimationFrame();
        }
        handleScrollZoomAndPosition(smoothedScrollY) {
            // Only apply zoom effect on the home page background
            if (!background || (document.getElementById('home-page') && document.getElementById('home-page').classList.contains('hidden'))) {
                 if(background) { // Reset if not on home page
                    background.style.backgroundSize = `${initialZoom * 100}%`;
                    background.style.backgroundPosition = `center top`;
                 }
                return;
            }

            const windowHeight = window.innerHeight;
            const contentHeight = background.scrollHeight;
            const maxScrollDistance = contentHeight > windowHeight ? contentHeight - windowHeight : 0; // Prevent negative maxScroll
            const scrollFraction = maxScrollDistance > 0 ? Math.min(smoothedScrollY / maxScrollDistance, 1) : 0;
            const finalZoom = 1.00;
            const zoomDelta = initialZoom - finalZoom;
            const newZoom = initialZoom - (scrollFraction * zoomDelta);
            background.style.backgroundSize = `${newZoom * 100}%`;
            background.style.backgroundPosition = `center ${scrollFraction * 100}%`;
        }
        on() { this.setStyles(); this.setHeight(); this.addEvents(); this.requestAnimationFrame(); }
        off() { this.cancelAnimationFrame(); this.removeEvents(); }
        requestAnimationFrame() { this.rAF = requestAnimationFrame(this.run); }
        cancelAnimationFrame() { cancelAnimationFrame(this.rAF); }
        destroy() { document.body.style.height = ''; this.data = null; this.removeEvents(); this.cancelAnimationFrame(); }
        addEvents() { window.addEventListener('resize', this.resize, { passive: true }); window.addEventListener('scroll', this.scroll, { passive: true }); }
        removeEvents() { window.removeEventListener('resize', this.resize, { passive: true }); window.removeEventListener('scroll', this.scroll, { passive: true }); }
        init() { this.preload(); this.on(); this.handleScrollZoomAndPosition(0); }
    }

    let smoothScroller = null;
    try {
        smoothScroller = new Smooth();
    } catch(e) {
        console.warn("Smooth scrolling initialization failed. Using native scroll.", e);
        // Remove fixed positioning if smooth scroll fails
        const scrollEl = document.querySelector('[data-scroll]');
        if(scrollEl) {
            scrollEl.style.position = 'relative';
            scrollEl.style.overflow = 'visible';
        }
         document.body.style.height = 'auto'; // Reset body height
    }
    // --- END: Smooth Scroll Class ---

    // --- Page Navigation Logic ---
    const navLinks = document.querySelectorAll('.nav-link');
    let pageHistory = ['home-page'];
    const transitionDuration = 300;
    let currentPageId = 'home-page';

    const nav = {
        home: document.getElementById('nav-home'),
        about: document.getElementById('nav-about'),
        contact: document.getElementById('nav-contact'),
        login: document.getElementById('nav-login'),
        signup: document.getElementById('nav-signup'),
    };

    function showPage(targetId) {
        if (!targetId || currentPageId === targetId) return;

        const targetPage = document.getElementById(targetId);
        const currentPage = document.getElementById(currentPageId);

        if (!targetPage) {
            console.warn(`Target page "${targetId}" not found.`);
            return;
        }

        // Manage history only if navigating forward
        if (!pageHistory.includes(targetId)) {
             pageHistory.push(targetId);
        } else {
             // If navigating back via links (e.g., login -> signup -> login), reset history stack
             const targetIndex = pageHistory.indexOf(targetId);
             if (targetIndex !== -1 && targetIndex < pageHistory.length -1) {
                pageHistory = pageHistory.slice(0, targetIndex + 1);
             }
        }


        // Update Back Button Visibility
        if (targetId === 'home-page' || pageHistory.length <= 1) { // Hide if home or only one page in history
            if (backButton) {
                backButton.classList.add('hidden');
                backButton.classList.add('back-button-home');
                backButton.classList.remove('back-button-internal');
            }
        } else {
            if (backButton) {
                backButton.classList.remove('hidden');
                backButton.classList.remove('back-button-home');
                backButton.classList.add('back-button-internal');
            }
        }

        if(mainHeader) mainHeader.classList.remove('header-hidden'); // Always show header on page change

        // Fade out current page
        if (currentPage) {
            currentPage.style.opacity = '0';
        }

        setTimeout(() => {
            // Hide current page and show target page
            if (currentPage) {
                currentPage.classList.add('hidden');
            }
            targetPage.classList.remove('hidden');

            // Fade in target page
            requestAnimationFrame(() => {
                targetPage.style.opacity = '1';
            });

            // Update Header Style
            if (mainHeader) {
                if (targetId === 'home-page') {
                    mainHeader.classList.add('header-home');
                    mainHeader.classList.remove('header-internal');
                } else {
                    mainHeader.classList.remove('header-home');
                    mainHeader.classList.add('header-internal');
                }
            }

            // Update Active Nav Link
            let activeTarget = targetId.replace('-page', '');
            if (targetId === 'registration-page') activeTarget = 'signup';
            if (targetId === 'reset-password-page') activeTarget = 'login';

            Object.values(nav).forEach(item => item && item.classList.remove('active')); // Check if item exists
            if (nav[activeTarget]) {
                nav[activeTarget].classList.add('active');
            }

            // Reset Scroll Position
            if (smoothScroller) {
                smoothScroller.data.current = 0;
                smoothScroller.data.last = 0;
                smoothScroller.data.rounded = 0;
                smoothScroller.resize(); // Recalculate height and reset position
            } else {
                 window.scrollTo(0, 0); // Native scroll reset
            }

            currentPageId = targetId;

        }, transitionDuration);
    }

    navLinks.forEach(link => {
        link.addEventListener('click', function (event) {
            event.preventDefault();
            const targetId = this.dataset.target;
            const role = this.dataset.role;

            if (role && targetId === 'registration-page') {
                const userTypeDropdown = document.getElementById('reg-user-type');
                if (userTypeDropdown) {
                    userTypeDropdown.value = role;
                }
            }

            if(targetId) showPage(targetId);
        });
    });

    if (backButton) {
        backButton.addEventListener('click', function(event) {
            event.preventDefault();
            if (pageHistory.length > 1) {
                pageHistory.pop(); // Remove current page
                const previousPageId = pageHistory[pageHistory.length - 1]; // Get the one before
                pageHistory.pop(); // Remove the previous one so showPage adds it back correctly
                showPage(previousPageId);
            } else {
                // If only home is left, go home (though button should be hidden)
                showPage('home-page');
            }
        });
    }

    // Initialize first page view
    if (nav['home']) nav['home'].classList.add('active');

    // --- Authentication Logic ---

    const loginForm = document.getElementById('login-form');
    const loginEmailInput = document.getElementById('login-email');
    const loginPasswordInput = document.getElementById('login-password');
    const loginButton = document.getElementById('login-button');
    const loginMessage = document.getElementById('login-message');

    const registrationForm = document.getElementById('registration-form');
    const regFullNameInput = document.getElementById('reg-full-name');
    const regNumberInput = document.getElementById('reg-number');
    const regEmailInput = document.getElementById('reg-email');
    const regPasswordInput = document.getElementById('reg-password');
    const regDepartmentInput = document.getElementById('reg-department');
    const regUserTypeInput = document.getElementById('reg-user-type');
    const regSecurityQuestionInput = document.getElementById('reg-security-question');
    const regSecurityAnswerInput = document.getElementById('reg-security-answer');
    const registerButton = document.getElementById('register-button');
    const registrationMessage = document.getElementById('registration-message');

    // Function to display messages
    function showMessage(element, message, isError = false) {
        if (!element) return;
        element.textContent = message;
        element.className = `text-center text-sm font-medium p-3 rounded-lg ${
            isError ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                   : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
        }`;
        element.classList.remove('hidden');
    }

    // Function to clear messages
    function clearMessage(element) {
        if (!element) return;
        element.textContent = '';
        element.classList.add('hidden');
    }

     // Function to decode JWT
    function decodeJwt(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) {
            console.error("Failed to decode JWT:", e);
            return null;
        }
    }


    // Login Form Submission
    if (loginForm) {
        loginForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            clearMessage(loginMessage);
            if(loginButton) loginButton.disabled = true;

            const email = loginEmailInput.value;
            const password = loginPasswordInput.value;

            try {
                const response = await fetch(`${API_BASE_URL}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.detail || `Login failed (${response.status})`);
                }

                // --- Success ---
                showMessage(loginMessage, "Login successful! Redirecting...", false);
                const token = data.access_token;
                localStorage.setItem('accessToken', token); // Store token

                // Decode token to get role
                const payload = decodeJwt(token);
                const userRole = payload ? payload.role : null;

                // Redirect based on role
                setTimeout(() => {
                    if (userRole === 'Admin') {
                        window.location.href = 'admin_dashboard.html';
                    } else if (userRole === 'Teacher') {
                        window.location.href = 'teacher_dashboard.html';
                    } else if (userRole === 'Student') {
                        window.location.href = 'student_dashboard.html';
                    } else {
                        // Fallback or error if role is missing/invalid
                        console.error("Invalid or missing user role in token:", userRole);
                        showMessage(loginMessage, "Login successful, but role unknown. Cannot redirect.", true);
                        if(loginButton) loginButton.disabled = false; // Re-enable button if redirect fails
                    }
                }, 1500); // Delay for user to see message

            } catch (error) {
                console.error("Login error:", error);
                showMessage(loginMessage, error.message || "An error occurred during login.", true);
                if(loginButton) loginButton.disabled = false;
            }
        });
    }

    // Registration Form Submission
    if (registrationForm) {
        registrationForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            clearMessage(registrationMessage);
             if(registerButton) registerButton.disabled = true;

            const userData = {
                fullName: regFullNameInput.value,
                registrationNumber: regNumberInput.value,
                email: regEmailInput.value,
                password: regPasswordInput.value,
                department: regDepartmentInput.value,
                role: regUserTypeInput.value,
                securityQuestion: regSecurityQuestionInput.value,
                securityAnswer: regSecurityAnswerInput.value,
            };

            // Basic frontend validation (more robust validation happens on backend)
            if (userData.password.length < 8) {
                 showMessage(registrationMessage, "Password must be at least 8 characters long.", true);
                 if(registerButton) registerButton.disabled = false;
                 return;
            }
             if (!userData.role) {
                showMessage(registrationMessage, "Please select your role (Student or Teacher).", true);
                if (registerButton) registerButton.disabled = false;
                return;
            }
             if (!userData.department) {
                showMessage(registrationMessage, "Please select your department.", true);
                if (registerButton) registerButton.disabled = false;
                return;
            }
             if (!userData.securityQuestion) {
                showMessage(registrationMessage, "Please select a security question.", true);
                if (registerButton) registerButton.disabled = false;
                return;
            }


            try {
                const response = await fetch(`${API_BASE_URL}/signup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(userData)
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.detail || `Signup failed (${response.status})`);
                }

                // --- Success ---
                showMessage(registrationMessage, "Signup successful! Please log in.", false);
                registrationForm.reset(); // Clear the form
                // Optionally redirect to login page after a delay
                setTimeout(() => {
                    showPage('login-page');
                    clearMessage(registrationMessage); // Clear message on redirect
                }, 2000);

            } catch (error) {
                console.error("Signup error:", error);
                showMessage(registrationMessage, error.message || "An error occurred during signup.", true);
                 if(registerButton) registerButton.disabled = false;
            }
        });
    }

    // --- Password Visibility Toggle ---
    document.querySelectorAll('.toggle-password').forEach(button => {
        button.addEventListener('click', function() {
            const input = this.previousElementSibling; // Get the input right before the button
            const icon = this.querySelector('span');
            if (input && icon) {
                if (input.type === 'password') {
                    input.type = 'text';
                    icon.textContent = 'visibility';
                } else {
                    input.type = 'password';
                    icon.textContent = 'visibility_off';
                }
            }
        });
    });

});
