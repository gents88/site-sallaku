/**
 * Particle System - Hero Background
 * Lightweight particle engine for ambient visual effect
 */
class ParticleSystem {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;
        this.particles = [];
        this.maxParticles = 25;
        this.init();
    }

    init() {
        this.createParticles();
        this.createOrbs();
    }

    createParticles() {
        for (let i = 0; i < this.maxParticles; i++) {
            setTimeout(() => this.spawnParticle(), i * 400);
        }
        // Continuously spawn
        setInterval(() => this.spawnParticle(), 2000);
    }

    spawnParticle() {
        const particle = document.createElement('div');
        particle.className = 'particle';
        
        const size = Math.random() * 3 + 1;
        const x = Math.random() * 100;
        const duration = Math.random() * 15 + 10;
        const delay = Math.random() * 5;
        
        const colors = [
            'rgba(79, 106, 245, 0.4)',
            'rgba(139, 92, 246, 0.35)',
            'rgba(167, 139, 250, 0.3)',
            'rgba(34, 211, 238, 0.25)'
        ];
        const color = colors[Math.floor(Math.random() * colors.length)];

        particle.style.cssText = `
            width: ${size}px;
            height: ${size}px;
            left: ${x}%;
            bottom: -10px;
            background: ${color};
            box-shadow: 0 0 ${size * 3}px ${color};
            animation-duration: ${duration}s;
            animation-delay: ${delay}s;
        `;

        this.container.appendChild(particle);

        // Cleanup
        setTimeout(() => {
            if (particle.parentNode) {
                particle.parentNode.removeChild(particle);
            }
        }, (duration + delay) * 1000);
    }

    createOrbs() {
        const orbConfigs = [
            { size: 300, x: '15%', y: '20%', color: 'rgba(79, 106, 245, 0.06)', duration: 20 },
            { size: 250, x: '75%', y: '60%', color: 'rgba(139, 92, 246, 0.05)', duration: 25 },
            { size: 200, x: '50%', y: '80%', color: 'rgba(34, 211, 238, 0.04)', duration: 18 },
        ];

        orbConfigs.forEach(config => {
            const orb = document.createElement('div');
            orb.style.cssText = `
                position: absolute;
                width: ${config.size}px;
                height: ${config.size}px;
                left: ${config.x};
                top: ${config.y};
                background: radial-gradient(circle, ${config.color} 0%, transparent 70%);
                border-radius: 50%;
                pointer-events: none;
                animation: orbFloat ${config.duration}s ease-in-out infinite alternate;
                filter: blur(40px);
            `;
            this.container.appendChild(orb);
        });

        // Add orb animation
        if (!document.getElementById('orb-styles')) {
            const style = document.createElement('style');
            style.id = 'orb-styles';
            style.textContent = `
                @keyframes orbFloat {
                    0% { transform: translate(0, 0) scale(1); }
                    33% { transform: translate(30px, -20px) scale(1.05); }
                    66% { transform: translate(-20px, 15px) scale(0.95); }
                    100% { transform: translate(10px, -10px) scale(1.02); }
                }
            `;
            document.head.appendChild(style);
        }
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    new ParticleSystem('heroParticles');
});