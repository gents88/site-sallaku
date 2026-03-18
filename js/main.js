/**
 * Main Application Controller
 * Navigation, scroll handling, language switcher, interactivity
 */
class App {
    constructor() {
        this.navbar = document.getElementById('navbar');
        this.navMenu = document.getElementById('navMenu');
        this.navToggle = document.getElementById('navToggle');
        this.navLinks = document.querySelectorAll('.nav-link');
        this.sections = document.querySelectorAll('.section, .hero');
        this.lastScrollY = 0;
        
        this.init();
    }

    init() {
        this.setupNavigation();
        this.setupScrollHandler();
        this.setupSmoothScroll();
        this.setupActiveSection();
        this.setupCursorGlow();
        this.setupLangSwitcher();
        this.setupContactForm();
    }

    // ─── Navigation ───
    setupNavigation() {
        if (this.navToggle) {
            this.navToggle.addEventListener('click', () => {
                this.navToggle.classList.toggle('active');
                this.navMenu.classList.toggle('active');
                document.body.style.overflow = this.navMenu.classList.contains('active') ? 'hidden' : '';
            });
        }

        this.navLinks.forEach(link => {
            link.addEventListener('click', () => {
                this.navToggle.classList.remove('active');
                this.navMenu.classList.remove('active');
                document.body.style.overflow = '';
            });
        });

        document.addEventListener('click', (e) => {
            if (this.navMenu.classList.contains('active') &&
                !this.navMenu.contains(e.target) &&
                !this.navToggle.contains(e.target)) {
                this.navToggle.classList.remove('active');
                this.navMenu.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }

    // ─── Language Switcher ───
    setupLangSwitcher() {
        const switcher = document.getElementById('langSwitcher');
        const toggle = document.getElementById('langToggle');
        const flag = document.getElementById('langFlag');

        if (!switcher || !toggle) return;

        const flags = { it: '🇮🇹', en: '🇬🇧', sq: '🇦🇱' };

        // Toggle dropdown
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            switcher.classList.toggle('open');
        });

        // Close dropdown on outside click
        document.addEventListener('click', (e) => {
            if (!switcher.contains(e.target)) {
                switcher.classList.remove('open');
            }
        });

        // Handle language option clicks
        document.querySelectorAll('.lang-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const lang = btn.dataset.lang;
                i18n.setLanguage(lang);
                flag.textContent = flags[lang] || '🇮🇹';
                switcher.classList.remove('open');
            });
        });

        // Set initial flag from saved language
        const savedLang = localStorage.getItem('gs-portfolio-lang') || 'it';
        if (flags[savedLang]) {
            flag.textContent = flags[savedLang];
        }
    }

    // ─── Scroll Handler ───
    setupScrollHandler() {
        let ticking = false;
        
        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    this.handleScroll();
                    ticking = false;
                });
                ticking = true;
            }
        });

        this.handleScroll();
    }

    handleScroll() {
        const scrollY = window.scrollY;

        if (scrollY > 50) {
            this.navbar.classList.add('scrolled');
        } else {
            this.navbar.classList.remove('scrolled');
        }

        this.lastScrollY = scrollY;
    }

    // ─── Smooth Scroll ───
    setupSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = anchor.getAttribute('href');
                const target = document.querySelector(targetId);
                
                if (target) {
                    const offsetTop = target.offsetTop - 72;
                    window.scrollTo({
                        top: offsetTop,
                        behavior: 'smooth'
                    });
                }
            });
        });
    }

    // ─── Active Section Tracking ───
    setupActiveSection() {
        const options = {
            root: null,
            rootMargin: '-30% 0px -70% 0px',
            threshold: 0
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const sectionId = entry.target.id;
                    this.setActiveNavLink(sectionId);
                }
            });
        }, options);

        this.sections.forEach(section => {
            observer.observe(section);
        });
    }

    setActiveNavLink(sectionId) {
        this.navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('data-section') === sectionId) {
                link.classList.add('active');
            }
        });
    }

    // ─── Cursor Glow Effect on Project Cards ───
    setupCursorGlow() {
        const cards = document.querySelectorAll('.project-card');
        
        cards.forEach(card => {
            const glow = card.querySelector('.project-glow');
            if (!glow) return;

            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                glow.style.left = `${x - 100}px`;
                glow.style.top = `${y - 100}px`;
            });
        });
    }

    // ─── Contact Form ───
    setupContactForm() {
        const form = document.getElementById('contactForm');
        if (!form) return;

        form.addEventListener('submit', (event) => {
            event.preventDefault();

            const formData = new FormData(form);
            const honeypot = String(formData.get('honeypot') || '').trim();
            if (honeypot) return;

            const name = String(formData.get('name') || '').trim();
            const email = String(formData.get('email') || '').trim();
            const message = String(formData.get('message') || '').trim();

            const subject = encodeURIComponent(`Nuovo messaggio da ${name || 'sito portfolio'}`);
            const body = encodeURIComponent(`Nome: ${name}\nEmail: ${email}\n\nMessaggio:\n${message}`);
            const mailto = `mailto:gent.sallaku@email.com?subject=${subject}&body=${body}`;

            window.location.href = mailto;
        });
    }
}

// ─── Initialize App ───
document.addEventListener('DOMContentLoaded', () => {
    new App();
});

// ─── Console Easter Egg ───
console.log(
    '%c⚡ Gent Sallaku – Senior Front-End Developer',
    'color: #4f6af5; font-size: 16px; font-weight: bold; font-family: monospace;'
);
console.log(
    '%cAngular | TypeScript | Data Visualization & 3D Web',
    'color: #8b5cf6; font-size: 12px; font-family: monospace;'
);