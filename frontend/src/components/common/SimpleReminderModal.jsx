/**
 * ============================================================================= 
 * SIMPLE REMINDER MODAL - Minimal centering approach
 * =============================================================================
 * 
 * Uses the most basic positioning possible to ensure centering works
 * =============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';

// ─── Icons ─────────────────────────────────────────────────────────────────--
const BellIcon = () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
);

const CheckIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
    </svg>
);

const SnoozeIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v10l4 2" />
        <path d="M16 12h4" />
        <path d="M4 12h4" />
        <circle cx="12" cy="12" r="10" />
    </svg>
);

const DismissIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6L6 18M6 6l12 12" />
    </svg>
);

// ─── Component Props ─────────────────────────────────────────────────────────--
const SimpleReminderModal = ({
    isOpen,
    reminder,
    onMarkDone,
    onSnooze,
    onDismiss,
    onClose
}) => {
    const { isDark } = useTheme();
    const { addToast } = useAlert();
    const [isProcessing, setIsProcessing] = useState(false);

    // ─── System Sound Effect ─────────────────────────────────────────────────────
    useEffect(() => {
        if (isOpen && reminder) {
            playSystemSound();
            
            // Simple body lock
            document.body.style.overflow = 'hidden';
            
            // Add debug info
            console.log('SimpleReminderModal opened:', {
                viewport: { w: window.innerWidth, h: window.innerHeight },
                scroll: { x: window.scrollX, y: window.scrollY },
                body: {
                    position: getComputedStyle(document.body).position,
                    transform: getComputedStyle(document.body).transform
                }
            });
        }
        
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen, reminder]);

    const playSystemSound = useCallback(() => {
        try {
            if (window.electronAPI && window.electronAPI.playNotificationSound) {
                window.electronAPI.playNotificationSound();
                return;
            }
            
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
            
        } catch (error) {
            console.log('Sound notification failed:', error);
        }
    }, []);

    // ─── Action Handlers ─────────────────────────────────────────────────────--
    const handleMarkDone = useCallback(async () => {
        if (isProcessing) return;
        
        setIsProcessing(true);
        try {
            await onMarkDone?.(reminder);
            addToast('✅ Reminder completed', reminder.title);
            onClose?.();
        } catch (error) {
            console.error('Error marking reminder as done:', error);
            addToast('❌ Error', 'Failed to mark reminder as done');
        } finally {
            setIsProcessing(false);
        }
    }, [reminder, onMarkDone, onClose, isProcessing, addToast]);

    const handleSnooze = useCallback(async (minutes) => {
        if (isProcessing) return;
        
        setIsProcessing(true);
        try {
            await onSnooze?.(reminder, minutes);
            addToast('😴 Reminder snoozed', `Snoozed for ${minutes} minutes`);
            onClose?.();
        } catch (error) {
            console.error('Error snoozing reminder:', error);
            addToast('❌ Error', 'Failed to snooze reminder');
        } finally {
            setIsProcessing(false);
        }
    }, [reminder, onSnooze, onClose, isProcessing, addToast]);

    const handleDismiss = useCallback(async () => {
        if (isProcessing) return;
        
        setIsProcessing(true);
        try {
            await onDismiss?.(reminder);
            addToast('🔕 Reminder dismissed', reminder.title);
            onClose?.();
        } catch (error) {
            console.error('Error dismissing reminder:', error);
            addToast('❌ Error', 'Failed to dismiss reminder');
        } finally {
            setIsProcessing(false);
        }
    }, [reminder, onDismiss, onClose, isProcessing, addToast]);

    // ─── Format Time ─────────────────────────────────────────────────────────--
    const formatReminderTime = (timeString) => {
        try {
            const date = new Date(timeString);
            return date.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
        } catch (error) {
            return 'Invalid time';
        }
    };

    // ─── Snooze Options ─────────────────────────────────────────────────────────
    const snoozeOptions = [
        { minutes: 5, label: '5 min' },
        { minutes: 10, label: '10 min' },
        { minutes: 30, label: '30 min' },
        { minutes: 60, label: '1 hour' }
    ];

    // ─── Simple Render - No Portal, No Complex Positioning ───────────────────────
    if (!isOpen || !reminder) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: '0px',
                left: '0px',
                width: 'var(--viewport-width, 100vw)',
                height: 'var(--viewport-height, 100vh)',
                zIndex: 999999,
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px'
            }}
            onClick={onClose}
        >
            <div
                style={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: '420px',
                    padding: '28px',
                    borderRadius: '22px',
                    background: isDark 
                        ? 'rgba(22, 26, 32, 0.9)' 
                        : 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(14px)',
                    WebkitBackdropFilter: 'blur(14px)',
                    border: isDark 
                        ? '1px solid rgba(255, 255, 255, 0.08)' 
                        : '1px solid rgba(0, 0, 0, 0.08)',
                    boxShadow: isDark
                        ? '0 30px 80px rgba(0, 0, 0, 0.55)'
                        : '0 20px 60px rgba(0, 0, 0, 0.12)',
                    color: isDark ? '#ffffff' : '#000000',
                    maxHeight: '90vh',
                    overflowY: 'auto'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* ─── Header Section ─────────────────────────────────────────── */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    marginBottom: '20px'
                }}>
                    <div style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '16px',
                        backgroundImage: 'linear-gradient(135deg, #FF6A00, #FF8A3D)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        flexShrink: 0,
                        boxShadow: '0 8px 24px rgba(255, 106, 0, 0.3)'
                    }}>
                        <BellIcon />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h2 style={{
                            margin: 0,
                            fontSize: '20px',
                            fontWeight: 700,
                            letterSpacing: '0.2px',
                            lineHeight: '1.3',
                            color: isDark ? '#ffffff' : '#000000'
                        }}>
                            Reminder
                        </h2>
                        <p style={{
                            margin: '4px 0 0 0',
                            fontSize: '13px',
                            fontWeight: 500,
                            color: isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)'
                        }}>
                            Time: {formatReminderTime(reminder.reminder_time)}
                        </p>
                    </div>
                </div>

                {/* ─── Content Section ─────────────────────────────────────────── */}
                <div style={{ marginBottom: '24px' }}>
                    <h3 style={{
                        margin: '0 0 8px 0',
                        fontSize: '18px',
                        fontWeight: 600,
                        lineHeight: '1.4',
                        color: isDark ? '#ffffff' : '#000000'
                    }}>
                        {reminder.title}
                    </h3>
                    {reminder.description && (
                        <p style={{
                            margin: 0,
                            fontSize: '15px',
                            lineHeight: '1.6',
                            color: isDark ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.7)'
                        }}>
                            {reminder.description}
                        </p>
                    )}
                </div>

                {/* ─── Action Buttons ─────────────────────────────────────────── */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                }}>
                    {/* Primary Action - Mark Done */}
                    <button
                        onClick={handleMarkDone}
                        disabled={isProcessing}
                        style={{
                            padding: '14px 20px',
                            borderRadius: '14px',
                            border: 'none',
                            backgroundImage: 'linear-gradient(135deg, #22c55e, #16a34a)',
                            color: '#ffffff',
                            fontSize: '15px',
                            fontWeight: 600,
                            cursor: isProcessing ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)',
                            transition: 'all 0.2s ease',
                            opacity: isProcessing ? 0.7 : 1
                        }}
                    >
                        <CheckIcon />
                        {isProcessing ? 'Processing...' : 'Mark Done'}
                    </button>

                    {/* Snooze Options */}
                    <div style={{
                        display: 'flex',
                        gap: '8px',
                        padding: '4px',
                        background: isDark 
                            ? 'rgba(255, 255, 255, 0.04)' 
                            : 'rgba(0, 0, 0, 0.04)',
                        borderRadius: '12px'
                    }}>
                        {snoozeOptions.map((option) => (
                            <button
                                key={option.minutes}
                                onClick={() => handleSnooze(option.minutes)}
                                disabled={isProcessing}
                                style={{
                                    flex: 1,
                                    padding: '10px 12px',
                                    borderRadius: '10px',
                                    border: 'none',
                                    background: isDark 
                                        ? 'rgba(255, 255, 255, 0.08)' 
                                        : 'rgba(0, 0, 0, 0.06)',
                                    color: isDark ? '#ffffff' : '#000000',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    transition: 'all 0.2s ease',
                                    opacity: isProcessing ? 0.5 : 1
                                }}
                            >
                                <SnoozeIcon />
                                {option.label}
                            </button>
                        ))}
                    </div>

                    {/* Dismiss Button */}
                    <button
                        onClick={handleDismiss}
                        disabled={isProcessing}
                        style={{
                            padding: '12px 20px',
                            borderRadius: '12px',
                            border: isDark 
                                ? '1px solid rgba(255, 255, 255, 0.15)' 
                                : '1px solid rgba(0, 0, 0, 0.15)',
                            background: 'transparent',
                            color: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
                            fontSize: '14px',
                            fontWeight: 500,
                            cursor: isProcessing ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            transition: 'all 0.2s ease',
                            opacity: isProcessing ? 0.5 : 1
                        }}
                    >
                        <DismissIcon />
                        Dismiss
                    </button>
                </div>

                {/* ─── Close Button ─────────────────────────────────────────── */}
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '16px',
                        right: '16px',
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        border: 'none',
                        background: isDark 
                            ? 'rgba(255, 255, 255, 0.08)' 
                            : 'rgba(0, 0, 0, 0.06)',
                        color: isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = isDark 
                            ? 'rgba(255, 255, 255, 0.12)' 
                            : 'rgba(0, 0, 0, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = isDark 
                            ? 'rgba(255, 255, 255, 0.08)' 
                            : 'rgba(0, 0, 0, 0.06)';
                    }}
                >
                    <DismissIcon />
                </button>
            </div>
        </div>
    );
};

export default SimpleReminderModal;
