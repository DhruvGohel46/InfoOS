import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import '../../styles/global.css';

const ChevronDown = ({ size = 18, color }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color || "currentColor"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
);

const GlobalSelect = ({
    label,
    options = [],
    value,
    onChange,
    placeholder = 'Select option',
    disabled = false,
    className = '',
    direction = 'bottom',
    icon = null,
    style = {}
}) => {
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

    const dropdownStyles = direction === 'top'
        ? {
            bottom: '100%',
            top: 'auto',
            marginBottom: '4px',
            marginTop: 0
        }
        : {
            top: '100%',
            bottom: 'auto',
            marginTop: '4px',
            marginBottom: 0
        };

    return (
        <div
            className={`global-select-container ${className}`}
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                width: '100%',
                opacity: disabled ? 0.6 : 1,
                pointerEvents: disabled ? 'none' : 'auto',
                position: 'relative',
                ...style
            }}
        >
            {label && (
                <label style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    marginLeft: '2px'
                }}>
                    {label}
                </label>
            )}

            <div style={{ position: 'relative' }}>
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    style={{
                        width: '100%',
                        height: '44px',
                        padding: '0 12px',
                        borderRadius: '10px',
                        border: isOpen ? '1px solid var(--primary-500)' : '1px solid var(--border-primary)',
                        background: 'var(--bg-secondary)',
                        color: selectedOption ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: isOpen ? '0 0 0 3px rgba(var(--primary-rgb), 0.1)' : 'none',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        {icon && <span style={{ color: 'var(--text-tertiary)', display: 'flex' }}>{icon}</span>}
                        <span style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>
                            {selectedOption ? selectedOption.label : placeholder}
                        </span>
                    </div>

                    <motion.div
                        animate={{ rotate: isOpen ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ display: 'flex', alignItems: 'center', color: 'var(--text-tertiary)' }}
                    >
                        <ChevronDown size={16} />
                    </motion.div>
                </button>

                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: direction === 'top' ? 4 : -4, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: direction === 'top' ? 4 : -4, scale: 0.98 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            style={{
                                position: 'absolute',
                                left: 0,
                                right: 0,
                                ...dropdownStyles,
                                background: 'var(--surface-primary)', // Using surface color
                                border: '1px solid var(--border-primary)',
                                borderRadius: '10px',
                                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                                zIndex: 1000,
                                maxHeight: '220px',
                                overflowY: 'auto',
                                padding: '4px'
                            }}
                            className="glass-panel" // Optional: if you want glass effect on dropdown too
                        >
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
                                            color: option.value === value ? 'var(--primary-600)' : 'var(--text-primary)',
                                            background: option.value === value ? 'var(--primary-50)' : 'transparent',
                                            fontWeight: option.value === value ? 600 : 400,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            transition: 'background 0.15s ease'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (option.value !== value) e.currentTarget.style.background = 'var(--bg-tertiary)';
                                        }}
                                        onMouseLeave={(e) => {
                                            if (option.value !== value) e.currentTarget.style.background = 'transparent';
                                        }}
                                    >
                                        <span>{option.label}</span>
                                    </div>
                                ))
                            ) : (
                                <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                                    No options available
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default GlobalSelect;
