import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    IoSparkles,
    IoClose,
    IoArrowForward
} from 'react-icons/io5';
import MilestoneParticles from './MilestoneParticles';
import CelebrationAvatar from './CelebrationAvatar';
import { playCelebrationFanfare } from '../../utils/soundService';
import '../../styles/OrderCelebration.css';

const OrderCelebrationModal = () => {
    const [milestone, setMilestone] = useState(null);
    const [isOpen, setIsOpen] = useState(false);
    const [particlesActive, setParticlesActive] = useState(false);
    const timerRef = useRef(null);

    const handleDismiss = useCallback(() => {
        setIsOpen(false);
        setParticlesActive(false);
        if (timerRef.current) clearTimeout(timerRef.current);
    }, []);

    const triggerCelebration = useCallback((milestoneData) => {
        if (!milestoneData) return;

        // Check if celebrations are disabled in localStorage
        if (localStorage.getItem('disable_milestone_celebrations') === 'true') {
            return;
        }

        const isGrand = Boolean(milestoneData.is_grand);
        const durationMs = isGrand ? 7000 : 5000;

        setMilestone(milestoneData);
        setIsOpen(true);
        setParticlesActive(true);

        // Play refined chime audio
        playCelebrationFanfare(isGrand);

        // Setup auto-dismiss timer
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            handleDismiss();
        }, durationMs);
    }, [handleDismiss]);

    // Global event listeners
    useEffect(() => {
        const handleCelebrateEvent = (e) => {
            const detail = e.detail;
            if (detail && detail.count) {
                triggerCelebration(detail);
            }
        };

        const handleBillCreated = (e) => {
            const bill = e.detail;
            if (bill && bill.milestone && bill.milestone.reached) {
                // Avoid re-triggering the same milestone count on the same calendar day
                const today = new Date().toISOString().split('T')[0];
                const key = `celebrated_milestone_${today}_${bill.milestone.count}`;
                if (!sessionStorage.getItem(key)) {
                    sessionStorage.setItem(key, 'true');
                    triggerCelebration(bill.milestone);
                }
            }
        };

        window.addEventListener('celebrate-order-milestone', handleCelebrateEvent);
        window.addEventListener('bill-created', handleBillCreated);

        return () => {
            window.removeEventListener('celebrate-order-milestone', handleCelebrateEvent);
            window.removeEventListener('bill-created', handleBillCreated);
        };
    }, [triggerCelebration]);

    // Keyboard dismissal (Enter, Space, Escape)
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e) => {
            if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleDismiss();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, handleDismiss]);

    const isGrand = milestone ? Boolean(milestone.is_grand) : false;
    const tierClass = isGrand ? 'oc-tier-grand' : 'oc-tier-standard';

    return (
        <>
            <MilestoneParticles
                active={particlesActive}
                isGrand={isGrand}
                duration={isGrand ? 4500 : 3000}
                onComplete={() => setParticlesActive(false)}
            />

            <AnimatePresence>
                {isOpen && milestone && (
                    <div
                        className="oc-backdrop"
                        onClick={(e) => {
                            if (e.target === e.currentTarget) handleDismiss();
                        }}
                    >
                        <motion.div
                            className={`oc-modal ${tierClass}`}
                            initial={{ scale: 0.95, opacity: 0, y: 12 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.97, opacity: 0, y: 8 }}
                            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Close Button */}
                            <button
                                className="oc-close-x"
                                onClick={handleDismiss}
                                title="Close (Esc)"
                                aria-label="Close"
                            >
                                <IoClose size={16} />
                            </button>

                            {/* Header Badge */}
                            <div className="oc-header-badge">
                                <IoSparkles />
                                <span>{isGrand ? 'Grand Milestone' : 'Daily Milestone'}</span>
                            </div>

                            {/* Animated SVG Cartoon Avatar Mascot Stage */}
                            <CelebrationAvatar
                                count={milestone.count}
                                isGrand={isGrand}
                                size={175}
                            />

                            {/* Title & Subtitle */}
                            <h2 className="oc-title">{milestone.title || `${milestone.count} Orders`}</h2>
                            <p className="oc-subtitle">
                                {milestone.subtitle || `Successfully completed ${milestone.count} orders today.`}
                            </p>

                            {/* Stats Strip */}
                            <div className="oc-stats-strip">
                                <div className="oc-stat-box">
                                    <span className="oc-stat-label">Orders Today</span>
                                    <span className="oc-stat-value">{milestone.count}</span>
                                </div>
                                <div className="oc-stat-box">
                                    <span className="oc-stat-label">Status</span>
                                    <span className="oc-stat-value" style={{ color: 'var(--primary-500)' }}>
                                        On Track
                                    </span>
                                </div>
                            </div>

                            {/* Continue Button */}
                            <button
                                className="oc-btn-continue"
                                onClick={handleDismiss}
                                autoFocus
                            >
                                <span>Continue</span>
                                <IoArrowForward />
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
};

export default OrderCelebrationModal;
