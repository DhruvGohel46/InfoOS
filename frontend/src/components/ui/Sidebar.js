import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';

import { useSettings } from '../../context/SettingsContext';

const Sidebar = ({
    isCollapsed,
    toggleCollapse,
    navItems = [],
    onNavigate,
}) => {

    const { settings } = useSettings();
    const location = useLocation();
    const navigate = useNavigate();
    const restaurantName = settings?.shop_name || 'InfoOS POS';

    // Read display-zoom from CSS variable (updated by Settings)
    const getZoom = () => parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--display-zoom') || '1'
    );

    // Sidebar widths update whenever display-zoom changes
    const [zoom, setZoom] = React.useState(getZoom);
    React.useEffect(() => {
        // Poll the CSS var — it changes when Settings applies a new zoom
        const id = setInterval(() => {
            const next = getZoom();
            setZoom(prev => prev !== next ? next : prev);
        }, 300);
        return () => clearInterval(id);
    }, []);

    const expandedW = Math.round(260 * zoom);
    const collapsedW = Math.round(80 * zoom);
    const logoH = Math.round(80 * zoom);
    const iconSize = Math.max(14, Math.round(20 * zoom));

    // Generate acronym
    const getAcronym = (name) => {
        return name
            .split(' ')
            .map(word => word[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    const acronym = getAcronym(restaurantName);

    const sidebarVariants = {
        expanded: { width: `${expandedW}px` },
        collapsed: { width: `${collapsedW}px` }
    };

    const [lastTap, setLastTap] = React.useState(0);

    const handleDoubleTap = (e) => {
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;
        if (tapLength < 300 && tapLength > 0) {
            toggleCollapse();
            e.preventDefault();
        }
        setLastTap(currentTime);
    };

    return (
        <motion.div
            initial={isCollapsed ? 'collapsed' : 'expanded'}
            animate={isCollapsed ? 'collapsed' : 'expanded'}
            variants={sidebarVariants}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onDoubleClick={toggleCollapse}
            onTouchEnd={handleDoubleTap}
            className="glass-sidebar"
            style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                zIndex: 50,
                flexShrink: 0,
                userSelect: 'none',
                position: 'relative',
                borderRadius: 'var(--radius-sharp)',
                margin: '0',
            }}
        >
            {/* Header / Logo Area */}
            <div style={{
                height: `${logoH}px`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                padding: isCollapsed ? '0' : '0 var(--spacing-6)',
                marginBottom: 'var(--spacing-2)'
            }}>
                <AnimatePresence mode="wait">
                    {!isCollapsed ? (
                        <motion.div
                            key="full-logo"
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.4 }}
                            style={{
                                fontSize: 'var(--text-xl)',
                                fontWeight: 'var(--font-semibold)',
                                letterSpacing: '0.3px',
                                color: 'var(--primary-500)',
                                cursor: 'default'
                            }}
                            whileHover={{ filter: 'brightness(1.1)' }}
                        >
                            {restaurantName}
                        </motion.div>
                    ) : (
                        <motion.div
                            key="acronym-logo"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            style={{
                                fontSize: 'var(--text-xl)',
                                fontWeight: 'var(--font-semibold)',
                                color: 'var(--primary-500)',
                            }}
                        >
                            {acronym}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Navigation Items */}
            <div style={{
                flex: 1,
                padding: '0 var(--spacing-3)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--spacing-2)',
                overflowY: 'auto',
            }}>
                {navItems.map((item) => {
                    // Route-based active detection
                    const isActive = location.pathname === item.path ||
                        (item.path !== '/' && location.pathname.startsWith(item.path));

                    return (
                        <motion.div
                            key={item.id}
                            onClick={() => {
                                if (typeof onNavigate === 'function') {
                                    onNavigate(item);
                                } else {
                                    navigate(item.path);
                                }
                            }}
                            title={isCollapsed ? item.label : ''}
                            initial={false}
                            whileTap={{ scale: 0.97, transition: { duration: 0.1 } }}
                            style={{
                                position: 'relative',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: isCollapsed ? 'center' : 'flex-start',
                                width: '100%',
                                padding: 'var(--spacing-3) var(--spacing-4)',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                                outline: 'none',
                                transition: 'all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                                backdropFilter: 'var(--glass-blur)',
                                WebkitBackdropFilter: 'var(--glass-blur)',
                                border: isActive ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid var(--glass-border)',
                                background: isActive 
                                    ? 'linear-gradient(135deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.1) 100%), var(--primary-500)' 
                                    : 'transparent',
                                color: isActive ? 'var(--text-inverse)' : 'var(--text-secondary)',
                                boxShadow: isActive 
                                    ? 'inset 0 1px 1px rgba(255,255,255,0.6), inset 0 -2px 4px rgba(0,0,0,0.2), 0 8px 16px rgba(255, 106, 0, 0.3)' 
                                    : 'none',
                            }}
                            onMouseEnter={(e) => {
                                if (!isActive) {
                                    e.currentTarget.style.background = 'var(--glass-card)';
                                    e.currentTarget.style.color = 'var(--text-primary)';
                                    e.currentTarget.style.transform = 'translateX(4px)';
                                } else {
                                    e.currentTarget.style.transform = 'translateX(4px) scale(1.02)';
                                    e.currentTarget.style.boxShadow = 'inset 0 1px 1px rgba(255,255,255,0.8), inset 0 -2px 4px rgba(0,0,0,0.2), 0 12px 20px rgba(255, 106, 0, 0.4)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isActive) {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = 'var(--text-secondary)';
                                    e.currentTarget.style.transform = 'translateX(0)';
                                } else {
                                    e.currentTarget.style.transform = 'translateX(0) scale(1)';
                                    e.currentTarget.style.boxShadow = 'inset 0 1px 1px rgba(255,255,255,0.6), inset 0 -2px 4px rgba(0,0,0,0.2), 0 8px 16px rgba(255, 106, 0, 0.3)';
                                }
                            }}
                        >
                            {/* Icon Wrapper */}
                            <motion.span
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: `${iconSize}px`,
                                    marginRight: isCollapsed ? 0 : 'var(--spacing-3)',
                                    color: 'currentColor'
                                }}
                                animate={isActive ? {
                                    scale: [1, 1.05, 1],
                                    transition: { duration: 4, repeat: Infinity, ease: "easeInOut" }
                                } : { scale: 1 }}
                            >
                                {item.icon}
                            </motion.span>

                            {/* Label */}
                            <AnimatePresence>
                                {!isCollapsed && (
                                    <motion.span
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -10 }}
                                        transition={{ duration: 0.2 }}
                                        style={{
                                            fontWeight: isActive ? 'var(--font-semibold)' : 'var(--font-medium)',
                                            fontSize: 'var(--text-sm)',
                                            whiteSpace: 'nowrap'
                                        }}
                                    >
                                        {item.label}
                                    </motion.span>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    );
                })}
            </div>

            {/* Collapse Toggle */}
            <div style={{
                padding: 'var(--spacing-6)',
                display: 'flex',
                justifyContent: isCollapsed ? 'center' : 'flex-end',
            }}>
                <motion.button
                    onClick={toggleCollapse}
                    whileTap={{ scale: 0.92 }}
                    className="rounded-lg"
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--glass-card)';
                        e.currentTarget.style.transform = 'scale(1.05)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.transform = 'scale(1)';
                    }}
                    style={{
                        background: 'transparent',
                        border: '1px solid var(--glass-border)',
                        width: '32px',
                        height: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                        transition: 'all var(--transition-normal) var(--ease-out)',
                        backdropFilter: 'var(--glass-blur)',
                        WebkitBackdropFilter: 'var(--glass-blur)',
                    }}
                >
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        style={{
                            transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.4s cubic-bezier(.4,0,.2,1)'
                        }}
                    >
                        <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </motion.button>
            </div>
        </motion.div>
    );
};

export default Sidebar;
