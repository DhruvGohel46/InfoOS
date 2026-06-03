/**
 * ToastItem — Premium toast notification with progress bar & hover-pause
 */
import React, { useState, useEffect, useRef, useCallback, forwardRef } from 'react';
import { motion } from 'framer-motion';

// ─── SVG Icons ───
const CheckIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
    </svg>
);

const ErrorIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
);

const WarningIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
);

const InfoIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
);

const CloseIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

const ICONS = {
    success: CheckIcon,
    error: ErrorIcon,
    warning: WarningIcon,
    info: InfoIcon,
};

const ToastItem = forwardRef(({ toast, onClose }, ref) => {
    const { type, title, description, duration, action, timestamp } = toast;
    const [isPaused, setIsPaused] = useState(false);
    const startTimeRef = useRef(Date.now());
    const remainingRef = useRef(duration);
    const rafRef = useRef(null);

    const Icon = ICONS[type] || InfoIcon;

    // Animate the progress bar
    const tick = useCallback(() => {
        if (duration <= 0) return;

        const elapsed = Date.now() - startTimeRef.current;
        const remaining = remainingRef.current - elapsed;

        if (remaining <= 0) {
            onClose();
            return;
        }

        rafRef.current = requestAnimationFrame(tick);
    }, [duration, onClose]);

    useEffect(() => {
        if (duration <= 0) return;
        if (!isPaused) {
            startTimeRef.current = Date.now();
            rafRef.current = requestAnimationFrame(tick);
        }
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [isPaused, tick, duration]);

    const handleMouseEnter = () => {
        if (duration <= 0) return;
        setIsPaused(true);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        // Save how much time is left
        const elapsed = Date.now() - startTimeRef.current;
        remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    };

    const handleMouseLeave = () => {
        if (duration <= 0) return;
        setIsPaused(false);
    };

    return (
        <motion.div
            ref={ref}
            layout
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            className={`rb-toast rb-toast--${type}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {/* Icon */}
            <div className={`rb-toast__icon rb-toast__icon--${type}`}>
                <Icon />
            </div>

            {/* Content */}
            <div className="rb-toast__content">
                {title && <p className="rb-toast__title">{title}</p>}
                {description && <p className="rb-toast__description">{description}</p>}
                {timestamp && <p className="rb-toast__meta">{timestamp}</p>}
                {action && (
                    <button
                        className={`rb-toast__action rb-toast__action--${type}`}
                        onClick={() => {
                            action.onClick?.();
                            onClose();
                        }}
                    >
                        {action.label}
                    </button>
                )}
            </div>

            {/* Close */}
            <button className="rb-toast__close" onClick={onClose} aria-label="Close notification">
                <CloseIcon />
            </button>

        </motion.div>
    );
});

export default ToastItem;
