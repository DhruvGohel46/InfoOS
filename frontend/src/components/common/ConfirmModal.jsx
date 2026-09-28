/**
 * ConfirmModal — Premium confirmation dialog for destructive actions
 */
import React, { useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';

// ─── Default Icons ───
const TrashIcon = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
);

const AlertTriangleIcon = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
);

const InfoCircleIcon = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
);

const DEFAULT_ICONS = {
    danger: TrashIcon,
    warning: AlertTriangleIcon,
    primary: InfoCircleIcon,
    info: InfoCircleIcon,
};

const ConfirmModal = ({
    title,
    description,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'danger',
    icon: CustomIcon,
    onConfirm,
    onCancel,
}) => {
    const { isDark } = useTheme();
    const Icon = CustomIcon || DEFAULT_ICONS[variant] || TrashIcon;

    // Keyboard: Enter = confirm, Escape = cancel
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            onConfirm();
        }
    }, [onCancel, onConfirm]);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    // Map variant to button class
    const btnVariantClass = `rb-confirm__btn--${variant}`;
    const iconVariantClass = `rb-confirm__icon--${variant}`;

    const getIconBorder = () => {
        if (variant === 'danger') return isDark ? '1px solid rgba(239, 68, 68, 0.25)' : '1.5px solid #FECACA';
        if (variant === 'warning') return isDark ? '1px solid rgba(245, 158, 11, 0.25)' : '1.5px solid #FDE68A';
        if (variant === 'primary') return isDark ? '1px solid rgba(255, 106, 0, 0.25)' : '1.5px solid #FED7AA';
        return isDark ? '1px solid rgba(14, 165, 233, 0.25)' : '1.5px solid #BAE6FD';
    };

    const getIconBg = () => {
        if (variant === 'danger') return isDark ? 'rgba(239, 68, 68, 0.14)' : '#FEF2F2';
        if (variant === 'warning') return isDark ? 'rgba(245, 158, 11, 0.14)' : '#FFFBEB';
        if (variant === 'primary') return isDark ? 'rgba(255, 106, 0, 0.14)' : '#FFF7ED';
        return isDark ? 'rgba(14, 165, 233, 0.14)' : '#F0F9FF';
    };

    const getIconColor = () => {
        if (variant === 'danger') return '#EF4444';
        if (variant === 'warning') return '#F59E0B';
        if (variant === 'primary') return '#FF6A00';
        return '#0EA5E9';
    };

    const getCardBorder = () => {
        if (variant === 'danger') return isDark ? '1px solid rgba(239, 68, 68, 0.25)' : '1.5px solid #FECACA';
        if (variant === 'warning') return isDark ? '1px solid rgba(245, 158, 11, 0.25)' : '1.5px solid #FDE68A';
        if (variant === 'primary') return isDark ? '1px solid rgba(255, 106, 0, 0.25)' : '1.5px solid #FED7AA';
        return isDark ? '1px solid rgba(14, 165, 233, 0.25)' : '1.5px solid #BAE6FD';
    };

    const getConfirmBtnBg = () => {
        if (variant === 'danger') return '#EF4444';
        if (variant === 'warning') return '#F59E0B';
        if (variant === 'primary') return '#FF6A00';
        return '#0EA5E9';
    };

    const getConfirmBtnShadow = () => {
        if (variant === 'danger') return '0 4px 14px rgba(239, 68, 68, 0.35)';
        if (variant === 'warning') return '0 4px 14px rgba(245, 158, 11, 0.35)';
        if (variant === 'primary') return '0 4px 14px rgba(255, 106, 0, 0.35)';
        return '0 4px 14px rgba(14, 165, 233, 0.35)';
    };

    return (
        <motion.div
            className="rb-confirm-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onCancel}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 2000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isDark ? 'rgba(0, 0, 0, 0.65)' : 'rgba(15, 23, 42, 0.45)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)'
            }}
        >
            <motion.div
                className="rb-confirm-card liquid-glass-card"
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.96 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: 'relative',
                    width: 'calc(460px * var(--display-zoom, 1))', 
                    maxWidth: '92vw', 
                    padding: 'var(--spacing-8, 32px)',
                    borderRadius: '24px',
                    backgroundColor: isDark ? 'rgba(22, 26, 32, 0.95)' : '#FFFFFF',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    border: getCardBorder(),
                    boxShadow: isDark
                        ? '0 25px 60px -10px rgba(0, 0, 0, 0.75), 0 0 1px 1px rgba(255, 255, 255, 0.08)'
                        : '0 20px 50px -10px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(226, 232, 240, 0.8)'
                }}
            >
                {/* Icon + Title Section */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-4, 16px)',
                    marginBottom: 'var(--spacing-5, 20px)'
                }}>
                    <div className={`rb-confirm__icon ${iconVariantClass}`} style={{
                        width: 'calc(58px * var(--display-zoom, 1))', 
                        height: 'calc(58px * var(--display-zoom, 1))', 
                        borderRadius: 'calc(18px * var(--display-zoom, 1))',
                        backgroundColor: getIconBg(),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: getIconColor(),
                        flexShrink: 0,
                        border: getIconBorder(),
                        marginBottom: 0
                    }}>
                        <Icon />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 className="rb-confirm__title" style={{
                            margin: 0,
                            color: isDark ? '#FFFFFF' : '#0F172A',
                            fontSize: 'calc(var(--text-xl, 20px) * var(--display-zoom, 1))',
                            fontWeight: '700',
                            letterSpacing: '-0.01em',
                            lineHeight: '1.3'
                        }}>
                            {title}
                        </h3>
                        <p className="rb-confirm__subtitle" style={{
                            margin: '4px 0 0 0',
                            color: isDark ? '#94A3B8' : '#64748B',
                            fontSize: 'calc(var(--text-sm, 14px) * var(--display-zoom, 1))',
                            fontWeight: '600'
                        }}>
                            {variant === 'danger' ? 'Destructive action' :
                             variant === 'warning' ? 'Please confirm' :
                             variant === 'primary' ? 'Action required' :
                             'Information'}
                        </p>
                    </div>
                </div>

                {/* Description */}
                {description && (
                    <p className="rb-confirm__description" style={{
                        color: isDark ? '#CBD5E1' : '#334155',
                        fontSize: 'calc(var(--text-base, 15px) * var(--display-zoom, 1))',
                        lineHeight: '1.6',
                        margin: '0 0 var(--spacing-6, 24px) 0',
                        fontWeight: '400'
                    }}>
                        {description}
                    </p>
                )}

                {/* Actions */}
                <div className="rb-confirm__actions" style={{
                    display: 'flex',
                    gap: 'var(--spacing-3, 12px)',
                    justifyContent: 'flex-end'
                }}>
                    <button
                        className="rb-confirm__btn rb-confirm__btn--cancel"
                        onClick={onCancel}
                        style={{
                            padding: 'calc(10px * var(--display-zoom, 1)) calc(20px * var(--display-zoom, 1))',
                            fontSize: 'calc(var(--text-sm, 14px) * var(--display-zoom, 1))',
                            fontWeight: '600',
                            borderRadius: '14px',
                            background: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
                            color: isDark ? '#E2E8F0' : '#334155',
                            border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1.5px solid #CBD5E1',
                            cursor: 'pointer',
                            boxShadow: isDark ? 'none' : '0 1px 2px rgba(15, 23, 42, 0.05)',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        className={`rb-confirm__btn ${btnVariantClass}`}
                        onClick={onConfirm}
                        autoFocus
                        style={{
                            padding: 'calc(10px * var(--display-zoom, 1)) calc(22px * var(--display-zoom, 1))',
                            fontSize: 'calc(var(--text-sm, 14px) * var(--display-zoom, 1))',
                            fontWeight: '700',
                            borderRadius: '14px',
                            border: 'none',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            backgroundColor: getConfirmBtnBg(),
                            color: '#FFFFFF',
                            boxShadow: getConfirmBtnShadow()
                        }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default ConfirmModal;
