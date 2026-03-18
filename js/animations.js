/**
 * Scroll Animations & Reveal System
 * Intersection Observer based reveal-on-scroll
 */
class ScrollAnimator {
    constructor() {
        this.reveals = [];
        this.techBars = [];
        this.init();
    }

    init() {
        this.setupRevealObserver();
        this.setupTechBarsObserver();
        this.setupCounterAnimation();
    }

    setupRevealObserver() {
        const options = {
            root: null,
            rootMargin: '0px 0px -60px 0px',
            threshold: 0.1
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, options);

        document.querySelectorAll('.reveal').forEach(el => {
            observer.observe(el);
        });
    }

    setupTechBarsObserver() {
        const options = {
            root: null,
            threshold: 0.3
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const bars = entry.target.querySelectorAll('.tech-bar-fill');
                    bars.forEach((bar, index) => {
                        setTimeout(() => {
                            bar.classList.add('animated');
                        }, index * 120);
                    });
                    observer.unobserve(entry.target);
                }
            });
        }, options);

        document.querySelectorAll('.tech-category').forEach(el => {
            observer.observe(el);
        });
    }

    setupCounterAnimation() {
        const options = {
            root: null,
            threshold: 0.5
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.animateCounters(entry.target);
                    observer.unobserve(entry.target);
                }
            });
        }, options);

        const statsContainer = document.querySelector('.hero-stats');
        if (statsContainer) {
            observer.observe(statsContainer);
        }
    }

    animateCounters(container) {
        const counters = container.querySelectorAll('.stat-number');
        counters.forEach(counter => {
            const target = parseInt(counter.getAttribute('data-count'));
            const duration = 2000;
            const startTime = performance.now();

            const updateCounter = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                // Easing function
                const eased = 1 - Math.pow(1 - progress, 3);
                const current = Math.round(eased * target);
                
                counter.textContent = current;
                
                if (progress < 1) {
                    requestAnimationFrame(updateCounter);
                }
            };

            requestAnimationFrame(updateCounter);
        });
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new ScrollAnimator();
});