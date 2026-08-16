import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import '../../styles/global.css';

// Icons
const CalendarIcon = ({ size = 16, color }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>
);

const ChevronDown = ({ size = 16, color }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
);

const ChevronLeft = ({ size = 16, color }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6"></polyline>
    </svg>
);

const ChevronRight = ({ size = 16, color }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
);

const GlobalDatePicker = ({
    label,
    value,
    onChange,
    type = 'date', // 'date' | 'month'
    placeholder = 'Select date',
    disabled = false,
    className = '',
    forceDown = false,
    direction = 'auto', // 'auto' | 'top' | 'bottom'
    align = 'auto' // 'auto' | 'left' | 'right'
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0, transformOrigin: 'top center' });

    // Internal state for navigation (which month/year is currently visible)
    const [viewDate, setViewDate] = useState(new Date());

    useEffect(() => {
        if (value) {
            const d = new Date(value);
            if (!isNaN(d.getTime())) {
                setViewDate(d);
            }
        }
    }, [value, isOpen]); // Reset view when opening

    // Update position when opening
    useEffect(() => {
        if (isOpen && containerRef.current) {
            const updatePosition = () => {
                const rect = containerRef.current.getBoundingClientRect();
                const viewportHeight = window.innerHeight;
                const viewportWidth = window.innerWidth;

                // Minimum width for the calendar to be usable
                const minDropdownWidth = type === 'date' ? 300 : 280;
                const dropdownWidth = Math.max(rect.width, minDropdownWidth);
                const dropdownHeight = type === 'date' ? 360 : 300; 

                const spaceBelow = viewportHeight - rect.bottom;
                const spaceAbove = rect.top;

                // Determine vertical direction
                let openUp = false;
                if (direction === 'top') {
                    openUp = true;
                } else if (direction === 'bottom' || forceDown) {
                    openUp = false;
                } else {
                    // 'auto' mode: open up if not enough space below and more space above
                    if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
                        openUp = true;
                    } else if (spaceBelow < dropdownHeight && spaceAbove >= dropdownHeight) {
                        openUp = true;
                    }
                }

                const margin = 12;
                let top = 0;
                let originY = 'top';

                if (openUp) {
                    originY = 'bottom';
                    top = rect.top + window.scrollY - dropdownHeight - 6;
                    // Clamp so it never spills above the top of viewport
                    if (top < window.scrollY + margin) {
                        top = window.scrollY + margin;
                    }
                } else {
                    originY = 'top';
                    top = rect.bottom + window.scrollY + 6;
                    // Clamp so it never spills below the bottom of viewport
                    if (top + dropdownHeight > window.scrollY + viewportHeight - margin) {
                        top = window.scrollY + viewportHeight - dropdownHeight - margin;
                    }
                }

                // Determine horizontal position
                let left = rect.left;
                let originX = 'center';

                if (align === 'right') {
                    left = rect.right - dropdownWidth;
                    originX = 'right';
                } else if (align === 'left') {
                    left = rect.left;
                    originX = 'left';
                } else {
                    // 'auto' mode: if expanding right would overflow viewport, align to right edge
                    if (rect.left + dropdownWidth > viewportWidth - margin) {
                        left = rect.right - dropdownWidth;
                        originX = 'right';
                    } else {
                        left = rect.left;
                        originX = 'left';
                    }
                }

                // Clamp horizontally to stay safely within viewport
                if (left + dropdownWidth > viewportWidth - margin) {
                    left = viewportWidth - dropdownWidth - margin;
                }
                if (left < margin) {
                    left = margin;
                }

                setDropdownPos({
                    top,
                    left: left + window.scrollX,
                    width: dropdownWidth,
                    transformOrigin: `${originY} ${originX}`
                });
            };

            updatePosition();
            window.addEventListener('resize', updatePosition);
            window.addEventListener('scroll', updatePosition, true);

            return () => {
                window.removeEventListener('resize', updatePosition);
                window.removeEventListener('scroll', updatePosition, true);
            };
        }
    }, [isOpen, forceDown, direction, align, type]);

    // Close when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                // Check portal
                const dropdown = document.getElementById(`datepicker-dropdown-${label || 'global'}`);
                if (dropdown && dropdown.contains(event.target)) return;
                setIsOpen(false);
            }
        };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, label]);

    const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year, month) => {
        // 0 = Sunday, 1 = Monday...
        // We want Monday to be first if possible, but standard calendar usually starts Sun
        // Let's stick to standard Sunday start for simplicity or Monday if preferred.
        // Let's do Standard Sunday start.
        return new Date(year, month, 1).getDay();
    };

    const handleDateClick = (day) => {
        const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
        // Format YYYY-MM-DD using local time part logic manually to avoid UTC shifts
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const dayStr = String(d.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${dayStr}`;

        onChange(dateStr);
        setIsOpen(false);
    };

    const handleMonthClick = (monthIndex) => {
        const year = viewDate.getFullYear();
        const month = String(monthIndex + 1).padStart(2, '0');
        const monthStr = `${year}-${month}`;

        onChange(monthStr);
        setIsOpen(false);
    };

    const navigateMonth = (direction) => {
        const newDate = new Date(viewDate);
        newDate.setMonth(viewDate.getMonth() + direction);
        setViewDate(newDate);
    };

    const navigateYear = (direction) => {
        const newDate = new Date(viewDate);
        newDate.setFullYear(viewDate.getFullYear() + direction);
        setViewDate(newDate);
    };

    // Render Logic
    const renderCalendar = () => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const daysInMonth = getDaysInMonth(year, month);
        const firstDay = getFirstDayOfMonth(year, month);

        const days = [];
        // Empty slots for previous month
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} style={{ width: '32px', height: '32px' }}></div>);
        }

        const currentDate = new Date();
        const isToday = (d) =>
            d === currentDate.getDate() &&
            month === currentDate.getMonth() &&
            year === currentDate.getFullYear();

        const isSelected = (d) => {
            if (!value || type !== 'date') return false;
            const sel = new Date(value);
            return d === sel.getDate() && month === sel.getMonth() && year === sel.getFullYear();
        };

        for (let d = 1; d <= daysInMonth; d++) {
            const selected = isSelected(d);
            const today = isToday(d);

            days.push(
                <button
                    key={d}
                    onClick={(e) => { e.stopPropagation(); handleDateClick(d); }}
                    style={{
                        width: '32px',
                        height: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '6px',
                        border: 'none',
                        background: selected ? 'var(--primary-500)' : (today ? 'var(--bg-tertiary)' : 'transparent'),
                        color: selected ? '#fff' : 'var(--text-primary)',
                        fontSize: '13px',
                        fontWeight: selected || today ? 600 : 400,
                        cursor: 'pointer',
                        transition: 'all 0.1s'
                    }}
                    onMouseEnter={(e) => {
                        if (!selected) e.currentTarget.style.background = 'var(--bg-secondary)';
                    }}
                    onMouseLeave={(e) => {
                        if (!selected) e.currentTarget.style.background = today ? 'var(--bg-tertiary)' : 'transparent';
                    }}
                >
                    {d}
                </button>
            );
        }
        return days;
    };

    // Display formatted value
    const getDisplayValue = () => {
        if (!value) return placeholder;
        if (type === 'month') {
            if (typeof value !== 'string') return placeholder; // Safety check
            const parts = value.split('-');
            if (parts.length !== 2) return placeholder;
            const [y, m] = parts;
            const date = new Date(parseInt(y), parseInt(m) - 1);
            return date.toLocaleString('default', { month: 'long', year: 'numeric' });
        }
        const date = new Date(value);
        if (isNaN(date.getTime())) return placeholder;
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    return (
        <div
            className={`global-datepicker-container ${className}`}
            ref={containerRef}
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                width: '100%', // Respect container width or class override
                opacity: disabled ? 0.6 : 1,
                pointerEvents: disabled ? 'none' : 'auto'
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

            <div style={{ position: 'relative', width: '100%' }}>
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
                        color: value ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: isOpen ? '0 0 0 3px rgba(var(--primary-rgb), 0.1)' : 'none',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: 'var(--text-tertiary)', display: 'flex' }}><CalendarIcon /></span>
                        <span style={{ whiteSpace: 'nowrap' }}>{getDisplayValue()}</span>
                    </div>

                    <motion.div
                        animate={{ rotate: isOpen ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ display: 'flex', alignItems: 'center', color: 'var(--text-tertiary)' }}
                    >
                        <ChevronDown size={16} />
                    </motion.div>
                </button>

                {createPortal(
                    <AnimatePresence>
                        {isOpen && (
                            <motion.div
                                id={`datepicker-dropdown-${label || 'global'}`}
                                initial={{ opacity: 0, scale: 0.98, y: dropdownPos.transformOrigin?.startsWith('bottom') ? 8 : -8 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.98, y: dropdownPos.transformOrigin?.startsWith('bottom') ? 8 : -8 }}
                                transition={{ duration: 0.15, ease: "easeOut" }}
                                style={{
                                    position: 'absolute',
                                    top: dropdownPos.top,
                                    left: dropdownPos.left,
                                    width: dropdownPos.width,
                                    zIndex: 99999,
                                    transformOrigin: dropdownPos.transformOrigin || 'top center',
                                    background: 'var(--surface-primary)',
                                    border: '1px solid var(--border-primary)',
                                    borderRadius: '12px',
                                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.15)',
                                    padding: '16px 20px',
                                    minWidth: '280px',
                                    maxWidth: 'calc(100vw - 24px)'
                                }}
                                className="glass-panel"
                            >
                                {/* Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); type === 'date' ? navigateMonth(-1) : navigateYear(-1); }}
                                        style={{ background: 'transparent', border: 'none', padding: '4px', color: 'var(--text-secondary)', cursor: 'pointer', borderRadius: '4px' }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <ChevronLeft />
                                    </button>

                                    <span style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>
                                        {type === 'date'
                                            ? viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })
                                            : viewDate.getFullYear()
                                        }
                                    </span>

                                    <button
                                        onClick={(e) => { e.stopPropagation(); type === 'date' ? navigateMonth(1) : navigateYear(1); }}
                                        style={{ background: 'transparent', border: 'none', padding: '4px', color: 'var(--text-secondary)', cursor: 'pointer', borderRadius: '4px' }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <ChevronRight />
                                    </button>
                                </div>

                                {type === 'date' ? (
                                    <>
                                        {/* Weekdays */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '8px', justifyItems: 'center' }}>
                                            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                                                <div key={d} style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)' }}>{d}</div>
                                            ))}
                                        </div>
                                        {/* Days */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', justifyItems: 'center' }}>
                                            {renderCalendar()}
                                        </div>
                                    </>
                                ) : (
                                    /* Month Selection Grid */
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', justifyItems: 'center' }}>
                                        {months.map((m, idx) => {
                                            const isSelected = typeof value === 'string' && value === `${viewDate.getFullYear()}-${String(idx + 1).padStart(2, '0')}`;
                                            return (
                                                <button
                                                    key={m}
                                                    onClick={(e) => { e.stopPropagation(); handleMonthClick(idx); }}
                                                    style={{
                                                        padding: '8px',
                                                        borderRadius: '6px',
                                                        border: 'none',
                                                        background: isSelected ? 'var(--primary-500)' : 'transparent',
                                                        color: isSelected ? '#fff' : 'var(--text-primary)',
                                                        fontSize: '13px',
                                                        cursor: 'pointer',
                                                        fontWeight: isSelected ? 600 : 400
                                                    }}
                                                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                                                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                                                >
                                                    {m.slice(0, 3)}
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>,
                    document.body
                )}
            </div>
        </div>
    );
};

export default GlobalDatePicker;
