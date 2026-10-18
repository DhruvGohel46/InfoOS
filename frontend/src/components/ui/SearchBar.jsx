import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';

const SearchBar = ({ value, onChange, placeholder = "Search items..." }) => {
    const { currentTheme, isDark } = useTheme();
    const inputRef = useRef(null);
    const [localValue, setLocalValue] = useState(value);
    const [isFocused, setIsFocused] = useState(false);

    // Update local value if prop changes (e.g. cleared externally)
    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    // Debounce logic: Call onChange only after 300ms of no typing
    useEffect(() => {
        const handler = setTimeout(() => {
            // Only fire if the value is different from what might be in the parent
            // But since we can't know parent state easily without prop, we rely on parent to update.
            // Actually, we should just fire. The parent state update is cheap.
            if (value !== localValue) {
                onChange(localValue);
            }
        }, 300);

        return () => {
            clearTimeout(handler);
        };
    }, [localValue, onChange, value]);

    // Keyboard shortcut '/' to focus
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Check if '/' is pressed and no other input is focused
            if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                e.preventDefault();
                inputRef.current?.focus();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleClear = () => {
        setLocalValue('');
        onChange('');
        inputRef.current?.focus();
    };

    return (
        <div style={{
            position: 'relative',
            width: '100%',
            height: 'calc(48px * var(--display-zoom))', // Standardized height
            display: 'flex',
            alignItems: 'center',
            fontFamily: currentTheme.typography.fontFamily.primary,
        }}>
            {/* Search Icon - Absolutely Positioned Left */}
            <div style={{
                position: 'absolute',
                left: 'calc(12px * var(--display-zoom))',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                color: isFocused ? currentTheme.colors.primary[500] : currentTheme.colors.text.secondary,
                transition: 'color 0.2s',
                zIndex: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <svg width="1.2em" height="1.2em" style={{ fontSize: 'calc(15px * var(--display-zoom))' }} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </div>

            {/* Glassmorphic Input */}
            <input
                ref={inputRef}
                type="text"
                size={1}
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder={placeholder}
                style={{
                    width: '100%',
                    minWidth: 0,
                    height: '100%',
                    paddingLeft: 'calc(36px * var(--display-zoom))', // Space for icon
                    paddingRight: 'calc(34px * var(--display-zoom))', // Space for clear button/badge
                    borderRadius: 'calc(12px * var(--display-zoom))',
                    border: `1px solid ${isFocused ? currentTheme.colors.primary[500] : (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)')}`,
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.5)',
                    color: currentTheme.colors.text.primary,
                    fontSize: 'calc(0.9rem * var(--text-scale))',
                    fontWeight: 500,
                    outline: 'none',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    boxShadow: isFocused ? currentTheme.shadows.glow.primary : 'none',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
            />

            {/* Right Side Actions (Clear / Shortcut) */}
            <div style={{
                position: 'absolute',
                right: 'calc(12px * var(--display-zoom))',
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: 'calc(8px * var(--display-zoom))',
            }}>
                {localValue ? (
                    <button
                        onClick={handleClear}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '4px',
                            color: currentTheme.colors.text.secondary,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '50%',
                            transition: 'color 0.2s',
                        }}
                        title="Clear search"
                        onMouseEnter={(e) => e.currentTarget.style.color = currentTheme.colors.text.primary}
                        onMouseLeave={(e) => e.currentTarget.style.color = currentTheme.colors.text.secondary}
                    >
                        <svg width="1.2em" height="1.2em" style={{ fontSize: 'calc(16px * var(--display-zoom))' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="15" y1="9" x2="9" y2="15"></line>
                            <line x1="9" y1="9" x2="15" y2="15"></line>
                        </svg>
                    </button>
                ) : (
                    <div style={{
                        pointerEvents: 'none',
                        width: 'calc(20px * var(--display-zoom))',
                        height: 'calc(20px * var(--display-zoom))',
                        borderRadius: 'calc(6px * var(--display-zoom))',
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                        color: currentTheme.colors.text.muted,
                        fontSize: 'calc(0.75rem * var(--text-scale))',
                        fontWeight: 600,
                        fontFamily: 'monospace',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0.7
                    }}>
                        /
                    </div>
                )}
            </div>
        </div>
    );
};

export default SearchBar;
