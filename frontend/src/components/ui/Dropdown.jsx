import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import '../../styles/global.css'; // Ensure global variables are available

const ChevronDown = ({ size = 18, style = {} }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={style}
    >
        <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
);

const Dropdown = ({
    label,
    options = [],
    value,
    onChange,
    placeholder = 'Select an option',
    disabled = false,
    className = '',
    zIndex = 50,
    direction = 'down', // 'down' | 'up'
    dropUp = false,
    placement = 'bottom'
}) => {
    const isUp = direction === 'up' || dropUp || placement === 'top';
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    // Close when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (option) => {
        if (!disabled) {
            onChange(option.value);
            setIsOpen(false);
        }
    };

    const selectedOption = options.find((opt) => opt.value === value);

    // Animation variants
    const dropdownVariants = {
        hidden: {
            opacity: 0,
            y: isUp ? 10 : -10,
            scale: 0.95,
            transition: { duration: 0.2 }
        },
        visible: {
            opacity: 1,
            y: 0,
            scale: 1,
            transition: { type: 'spring', stiffness: 300, damping: 24 }
        },
        exit: {
            opacity: 0,
            y: isUp ? 10 : -10,
            scale: 0.95,
            transition: { duration: 0.15 }
        }
    };

    // Icon rotation
    const iconVariants = {
        closed: { rotate: 0 },
        open: { rotate: 180 }
    };

    return (
        <div className={`dropdown-container ${className}`} ref={containerRef} style={{ position: 'relative', width: '100%', marginBottom: '16px' }}>
            {label && <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</label>}

            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className="dropdown-trigger"
                style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'var(--glass-dropdown)',
                    backdropFilter: 'var(--glass-blur)',
                    WebkitBackdropFilter: 'var(--glass-blur)',
                    border: isOpen ? '1px solid var(--accent)' : '1px solid var(--glass-border)',
                    borderRadius: '8px',
                    color: selectedOption ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    fontSize: '15px',
                    textAlign: 'left',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.6 : 1,
                    transition: 'all 0.2s ease',
                    boxShadow: isOpen ? '0 0 0 4px rgba(var(--accent-rgb), 0.1)' : 'none',
                    outline: 'none'
                }}
            >
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <motion.div
                    variants={iconVariants}
                    animate={isOpen ? 'open' : 'closed'}
                    transition={{ duration: 0.2 }}
                >
                    <ChevronDown size={18} style={{ color: 'var(--text-tertiary)' }} />
                </motion.div>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        className="dropdown-menu glass-panel"
                        variants={dropdownVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        style={{
                            position: 'absolute',
                            ...(isUp
                                ? { bottom: '100%', marginBottom: '6px' }
                                : { top: '100%', marginTop: '4px' }),
                            left: 0,
                            right: 0,
                            borderRadius: '8px',
                            overflow: 'hidden',
                            boxShadow: isUp
                                ? '0 -10px 25px -5px rgba(0, 0, 0, 0.3), 0 -8px 10px -6px rgba(0, 0, 0, 0.2)'
                                : '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
                            zIndex: zIndex,
                            maxHeight: '240px',
                            overflowY: 'auto',
                            border: '1px solid var(--glass-border)',
                            background: 'var(--glass-dropdown)',
                            backdropFilter: 'var(--glass-blur)',
                            WebkitBackdropFilter: 'var(--glass-blur)',
                            transformOrigin: isUp ? 'bottom center' : 'top center'
                        }}
                    >
                        <div style={{ padding: '4px' }}>
                            {options.length > 0 ? (
                                options.map((option) => (
                                    <div
                                        key={option.value}
                                        onClick={() => handleSelect(option)}
                                        style={{
                                            padding: '10px 12px',
                                            cursor: 'pointer',
                                            borderRadius: '6px',
                                            fontSize: '14px',
                                            color: option.value === value ? 'var(--accent)' : 'var(--text-primary)',
                                            background: option.value === value ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent',
                                            fontWeight: option.value === value ? 600 : 400,
                                            transition: 'background 0.15s ease',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (option.value !== value) e.currentTarget.style.background = 'var(--bg-tertiary)';
                                        }}
                                        onMouseLeave={(e) => {
                                            if (option.value !== value) e.currentTarget.style.background = 'transparent';
                                        }}
                                    >
                                        {option.label}
                                        {option.value === value && (
                                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
                                    No options available
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Dropdown;
