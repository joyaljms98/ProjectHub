document.addEventListener('DOMContentLoaded', function () {
    
    const mainHeader = document.getElementById('main-header');
    const backButton = document.getElementById('back-button');
    let lastScrollTop = 0;
    
    const background = document.getElementById('main-background');
    const initialZoom = 1.10;
    
    // --- START: Smooth Scroll Class ---
    const math = {
        lerp: (a, b, n) => {
            return (1 - n) * a + n * b
        },
        norm: (value, min, max) => {
            return (value - min) / (max - min)
        }
    }

    const config = {
        height: window.innerHeight,
        width: window.innerWidth
    }

    class Smooth {
        constructor() {
            this.bindMethods()

            this.data = {
                ease: 0.08, 
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
            Object.assign(this.dom.el.style, {
                position: 'fixed',
                top: 0,
                left: 0,
                height: '100%',
                width: '100%',
                overflow: 'hidden'
            })
        }

        setHeight() {
            document.body.style.height = `${this.dom.content.getBoundingClientRect().height}px`
        }

        resize() {
            this.setHeight()
            this.scroll()
        }

        preload() {
            imagesLoaded(this.dom.content, (instance) => {
                this.setHeight()
            })
        }

        scroll() {
            this.data.current = window.scrollY
        }

        run() {
            this.data.last += (this.data.current - this.data.last) * this.data.ease;
            this.data.rounded = Math.round(this.data.last * 100) / 100;
            
            const currentScroll = this.data.rounded;
            const headerHeight = mainHeader.offsetHeight;

            if (!document.getElementById('home-page').classList.contains('hidden')) {
                mainHeader.classList.remove('header-hidden');
            } else if (currentScroll > lastScrollTop && currentScroll > headerHeight) {
                mainHeader.classList.add('header-hidden');
            } else if (currentScroll < lastScrollTop) {
                mainHeader.classList.remove('header-hidden');
            }
            lastScrollTop = currentScroll <= 0 ? 0 : currentScroll;
            
            this.dom.content.style.transform = `translate3d(0, -${this.data.rounded}px, 0)`;

            this.handleScrollZoomAndPosition(this.data.rounded);

            this.requestAnimationFrame();
        }
        
        handleScrollZoomAndPosition(smoothedScrollY) {
            if (document.getElementById('home-page').classList.contains('hidden')) {
                background.style.backgroundSize = `${initialZoom * 100}%`;
                background.style.backgroundPosition = `center top`;
                return;
            }

            const windowHeight = window.innerHeight;
            const contentHeight = background.scrollHeight;
            
            const maxScrollDistance = contentHeight - windowHeight;
            const scrollFraction = maxScrollDistance > 0 ? Math.min(smoothedScrollY / maxScrollDistance, 1) : 0;

            const finalZoom = 1.00;
            const zoomDelta = initialZoom - finalZoom;
            const newZoom = initialZoom - (scrollFraction * zoomDelta);
            
            background.style.backgroundSize = `${newZoom * 100}%`;
            background.style.backgroundPosition = `center ${scrollFraction * 100}%`;
        }

        on() { 
            this.setStyles()
            this.setHeight()
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

        resize() {
            this.setHeight()
            this.data.rounded = this.data.last = this.data.current
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
            this.handleScrollZoomAndPosition(0); 
        }
    }
    
    const smoothScroller = new Smooth();
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
        if (currentPageId === targetId) return;

        if (pageHistory[pageHistory.length - 1] !== targetId) {
            pageHistory.push(targetId);
        }
        
        if (targetId === 'home-page') {
            backButton.classList.add('hidden');
            backButton.classList.add('back-button-home');
            backButton.classList.remove('back-button-internal');
        } else {
            backButton.classList.remove('hidden');
            backButton.classList.remove('back-button-home');
            backButton.classList.add('back-button-internal');
        }

        mainHeader.classList.remove('header-hidden');

        const targetPage = document.getElementById(targetId);
        const currentPage = document.getElementById(currentPageId);

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
            
            if (targetId === 'home-page') {
                mainHeader.classList.add('header-home');
                mainHeader.classList.remove('header-internal');
            } else {
                mainHeader.classList.remove('header-home');
                mainHeader.classList.add('header-internal');
            }
            
            let activeTarget = targetId.replace('-page', '');
            if (targetId === 'registration-page') activeTarget = 'signup';
            if (targetId === 'reset-password-page') activeTarget = 'login';
            
            Object.values(nav).forEach(item => item.classList.remove('active'));
            if (nav[activeTarget]) {
                nav[activeTarget].classList.add('active');
            }

            if (smoothScroller) {
                smoothScroller.data.current = 0;
                smoothScroller.data.last = 0;
                smoothScroller.data.rounded = 0;
                smoothScroller.resize();
            } else {
                 window.scrollTo(0, 0);
            }

            currentPageId = targetId;

        }, transitionDuration);
    }

    navLinks.forEach(link => {
        link.addEventListener('click', function (event) {
            event.preventDefault();
            const targetId = this.dataset.target;

            const role = this.dataset.role;
            if (role) {
                const userTypeDropdown = document.getElementById('user-type');
                if (userTypeDropdown) {
                    userTypeDropdown.value = role;
                }
            }
            
            if(targetId) showPage(targetId);
        });
    });

    backButton.addEventListener('click', function(event) {
        event.preventDefault();
        
        if (pageHistory.length > 1) {
            pageHistory.pop(); 
            const previousPageId = pageHistory[pageHistory.length - 1];
            pageHistory.pop(); 
            
            showPage(previousPageId);
        }
    });

    // Initialize first page view
    nav['home'].classList.add('active');
});
