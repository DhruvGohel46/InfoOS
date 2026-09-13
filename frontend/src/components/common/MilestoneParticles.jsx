import React, { useEffect, useRef } from 'react';

/**
 * Subtle rising particle effect for order milestone celebrations.
 * Warm-toned dots float upward with gentle horizontal drift and fade out.
 * Matches the Liquid Glass professional POS aesthetic.
 */
const MilestoneParticles = ({ active = false, isGrand = false, duration = 3000, onComplete = null }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        if (!active) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let animationFrameId;
        let isRunning = true;

        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Warm, brand-adjacent tones only
        const colors = isGrand
            ? ['#f97316', '#fbbf24', '#fdba74', '#fb923c', '#f59e0b', '#fcd34d', 'rgba(255,255,255,0.5)']
            : ['#f97316', '#fbbf24', '#fdba74', '#fb923c', 'rgba(255,255,255,0.4)'];

        const particleCount = isGrand ? 75 : 40;
        const particles = [];

        // Generate particles across the bottom third of the screen
        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: canvas.height + Math.random() * 80,            // Start below viewport
                vx: (Math.random() - 0.5) * 0.8,                 // Gentle horizontal drift
                vy: -(1.2 + Math.random() * 2.0),                // Float upward
                radius: 2 + Math.random() * (isGrand ? 4 : 3),   // 2-6px for grand, 2-5px standard
                color: colors[Math.floor(Math.random() * colors.length)],
                opacity: 0.6 + Math.random() * 0.4,
                decay: 0.003 + Math.random() * 0.004,
                delay: Math.random() * (isGrand ? 1200 : 800),   // Stagger particle appearance
            });
        }

        const startTime = Date.now();

        const render = () => {
            if (!isRunning) return;

            const elapsed = Date.now() - startTime;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            let aliveCount = 0;

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];

                // Respect stagger delay
                if (elapsed < p.delay) {
                    aliveCount++;
                    continue;
                }

                if (p.opacity <= 0) continue;

                p.x += p.vx;
                p.y += p.vy;
                p.opacity -= p.decay;

                // Gentle horizontal wobble
                p.vx += (Math.random() - 0.5) * 0.05;

                if (p.opacity > 0) {
                    aliveCount++;
                    ctx.save();
                    ctx.globalAlpha = Math.max(0, p.opacity);
                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            }

            if (elapsed < duration && aliveCount > 0) {
                animationFrameId = requestAnimationFrame(render);
            } else {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                if (onComplete) onComplete();
            }
        };

        animationFrameId = requestAnimationFrame(render);

        return () => {
            isRunning = false;
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', resizeCanvas);
        };
    }, [active, isGrand, duration, onComplete]);

    if (!active) return null;

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                pointerEvents: 'none',
                zIndex: 99998,
            }}
        />
    );
};

export default MilestoneParticles;
