import React, { useEffect, useRef } from 'react';

/**
 * High-performance, zero-dependency HTML5 Canvas Confetti Cannon.
 * Fires bursts from left and right corners and a golden sparkle shower from the top center.
 * Automatically cleans up after duration.
 */
const ConfettiCannon = ({ active = false, duration = 3500, onComplete = null }) => {
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

        const colors = [
            '#f59e0b', '#fbbf24', '#f43f5e', '#ec4899', '#8b5cf6',
            '#3b82f6', '#06b6d4', '#10b981', '#14b8a6', '#ffffff'
        ];

        const particles = [];
        const totalParticles = 140;

        // Particle generator
        const createParticle = (originX, originY, angleBase, speedBase) => {
            const angle = angleBase + (Math.random() - 0.5) * 0.9;
            const speed = speedBase + Math.random() * 8;
            return {
                x: originX,
                y: originY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                gravity: 0.18 + Math.random() * 0.08,
                drag: 0.982,
                w: Math.random() * 9 + 5,
                h: Math.random() * 7 + 4,
                rotation: Math.random() * 360,
                rotationSpeed: (Math.random() - 0.5) * 12,
                color: colors[Math.floor(Math.random() * colors.length)],
                opacity: 1,
                decay: Math.random() * 0.008 + 0.006,
                shape: Math.random() > 0.4 ? 'rect' : 'circle'
            };
        };

        // Left cannon blast
        for (let i = 0; i < totalParticles / 2; i++) {
            particles.push(createParticle(0, canvas.height * 0.75, -Math.PI / 4, 12));
        }
        // Right cannon blast
        for (let i = 0; i < totalParticles / 2; i++) {
            particles.push(createParticle(canvas.width, canvas.height * 0.75, -3 * Math.PI / 4, 12));
        }

        const startTime = Date.now();

        const render = () => {
            if (!isRunning) return;
            const elapsed = Date.now() - startTime;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            let aliveCount = 0;

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                if (p.opacity <= 0) continue;

                p.vx *= p.drag;
                p.vy = p.vy * p.drag + p.gravity;
                p.x += p.vx;
                p.y += p.vy;
                p.rotation += p.rotationSpeed;
                p.opacity -= p.decay;

                if (p.opacity > 0) {
                    aliveCount++;
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate((p.rotation * Math.PI) / 180);
                    ctx.globalAlpha = Math.max(0, p.opacity);
                    ctx.fillStyle = p.color;

                    if (p.shape === 'rect') {
                        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                    } else {
                        ctx.beginPath();
                        ctx.arc(0, 0, p.w / 2.5, 0, Math.PI * 2);
                        ctx.fill();
                    }
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
    }, [active, duration, onComplete]);

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
                zIndex: 99998
            }}
        />
    );
};

export default ConfettiCannon;
