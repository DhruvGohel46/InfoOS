import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSettings } from '../../context/SettingsContext';
import MotionIcon from './MotionIcon';

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

    // Customized navigation items state
    const [customizedNavItems, setCustomizedNavItems] = React.useState([]);
    const [showEditModal, setShowEditModal] = React.useState(false);

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

    // Load saved layout on mount/updates
    React.useEffect(() => {
        const savedLayout = localStorage.getItem('infoos_sidebar_layout');
        if (savedLayout) {
            try {
                const { order, visibility } = JSON.parse(savedLayout);
                const mapped = [];
                order.forEach(id => {
                    const item = navItems.find(n => n.id === id);
                    if (item) {
                        mapped.push({ ...item, visible: visibility[id] !== false });
                    }
                });
                navItems.forEach(item => {
                    if (!mapped.some(m => m.id === item.id)) {
                        mapped.push({ ...item, visible: true });
                    }
                });
                setCustomizedNavItems(mapped);
            } catch (e) {
                console.error("Failed to parse saved sidebar layout:", e);
                setCustomizedNavItems(navItems.map(item => ({ ...item, visible: true })));
            }
        } else {
            setCustomizedNavItems(navItems.map(item => ({ ...item, visible: true })));
        }
    }, [navItems]);

    const saveSidebarLayout = (newItems) => {
        setCustomizedNavItems(newItems);
        const order = newItems.map(item => item.id);
        const visibility = {};
        newItems.forEach(item => {
            visibility[item.id] = item.visible !== false;
        });
        localStorage.setItem('infoos_sidebar_layout', JSON.stringify({ order, visibility }));
    };

    const resetSidebarLayout = () => {
        localStorage.removeItem('infoos_sidebar_layout');
        setCustomizedNavItems(navItems.map(item => ({ ...item, visible: true })));
    };

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
                {customizedNavItems.filter(item => item.visible !== false).map((item) => {
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
                            >
                                <MotionIcon size={iconSize} animateType={isActive ? 'bounce' : 'scale'}>
                                    {item.icon}
                                </MotionIcon>
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

            {/* Bottom Actions Area */}
            <div style={{
                padding: isCollapsed ? 'var(--spacing-4) var(--spacing-2)' : 'var(--spacing-6)',
                display: 'flex',
                flexDirection: isCollapsed ? 'column' : 'row',
                alignItems: 'center',
                justifyContent: isCollapsed ? 'center' : 'space-between',
                gap: '8px'
            }}>
                {/* Edit Layout Button */}
                {!isCollapsed ? (
                    <motion.button
                        onClick={() => setShowEditModal(true)}
                        whileTap={{ scale: 0.92 }}
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
                            padding: '6px 10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                            fontSize: '11px',
                            fontWeight: 600,
                            borderRadius: '8px',
                            transition: 'all var(--transition-normal) var(--ease-out)',
                        }}
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Edit Menu
                    </motion.button>
                ) : (
                    <motion.button
                        onClick={() => setShowEditModal(true)}
                        whileTap={{ scale: 0.92 }}
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
                            color: 'var(--text-secondary)',
                            borderRadius: '8px',
                            transition: 'all var(--transition-normal) var(--ease-out)',
                        }}
                        title="Edit Sidebar Layout"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                    </motion.button>
                )}

                {/* Collapse Toggle */}
                <motion.button
                    onClick={toggleCollapse}
                    whileTap={{ scale: 0.92 }}
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
                        color: 'var(--text-secondary)',
                        transition: 'all var(--transition-normal) var(--ease-out)',
                        borderRadius: '8px',
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

            {/* Edit Sidebar Modal */}
            {showEditModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.65)',
                    backdropFilter: 'blur(12px)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 999999,
                    padding: '20px',
                    color: '#FFFFFF',
                    fontFamily: "'Outfit', sans-serif"
                }}>
                    <div style={{
                        width: '100%',
                        maxWidth: '420px',
                        background: 'var(--surface-primary, #1e1f22)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '24px',
                        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.4)',
                        padding: '28px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '20px'
                    }}>
                        <div>
                            <span style={{ fontSize: '12px', color: 'var(--primary-500)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
                                Navigation Menu
                            </span>
                            <h3 style={{ margin: '4px 0 0 0', fontSize: '20px', fontWeight: 800 }}>Edit Sidebar Layout</h3>
                            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-secondary, #9CA3AF)' }}>
                                Drag or use arrows to reorder and toggle visibility.
                            </p>
                        </div>

                        {/* List of Items */}
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            maxHeight: '320px',
                            overflowY: 'auto',
                            paddingRight: '6px'
                        }}>
                            {customizedNavItems.map((item, index) => (
                                <div key={item.id} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '12px 16px',
                                    background: 'rgba(255, 255, 255, 0.03)',
                                    border: '1px solid rgba(255, 255, 255, 0.06)',
                                    borderRadius: '14px',
                                    transition: 'background 0.2s'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <span style={{ fontSize: '18px', display: 'flex', color: 'var(--text-secondary)' }}>{item.icon}</span>
                                        <span style={{ fontSize: '14px', fontWeight: 600 }}>{item.label}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        {/* Up Button */}
                                        <button
                                            disabled={index === 0}
                                            onClick={() => {
                                                const updated = [...customizedNavItems];
                                                const temp = updated[index];
                                                updated[index] = updated[index - 1];
                                                updated[index - 1] = temp;
                                                setCustomizedNavItems(updated);
                                            }}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                cursor: index === 0 ? 'default' : 'pointer',
                                                color: index === 0 ? 'rgba(255,255,255,0.1)' : 'var(--primary-500)',
                                                fontSize: '14px',
                                                padding: '4px'
                                            }}
                                        >
                                            ▲
                                        </button>
                                        {/* Down Button */}
                                        <button
                                            disabled={index === customizedNavItems.length - 1}
                                            onClick={() => {
                                                const updated = [...customizedNavItems];
                                                const temp = updated[index];
                                                updated[index] = updated[index + 1];
                                                updated[index + 1] = temp;
                                                setCustomizedNavItems(updated);
                                            }}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                cursor: index === customizedNavItems.length - 1 ? 'default' : 'pointer',
                                                color: index === customizedNavItems.length - 1 ? 'rgba(255,255,255,0.1)' : 'var(--primary-500)',
                                                fontSize: '14px',
                                                padding: '4px'
                                            }}
                                        >
                                            ▼
                                        </button>
                                        {/* Toggle Switch */}
                                        <input
                                            type="checkbox"
                                            checked={item.visible !== false}
                                            onChange={(e) => {
                                                const updated = customizedNavItems.map((n, i) => 
                                                    i === index ? { ...n, visible: e.target.checked } : n
                                                );
                                                setCustomizedNavItems(updated);
                                            }}
                                            style={{
                                                cursor: 'pointer',
                                                width: '16px',
                                                height: '16px',
                                                accentColor: 'var(--primary-500)'
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                            <button
                                onClick={() => {
                                    saveSidebarLayout(customizedNavItems);
                                    setShowEditModal(false);
                                }}
                                style={{
                                    flex: 1.2,
                                    background: 'var(--primary-500)',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '12px',
                                    padding: '12px',
                                    fontSize: '14px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    boxShadow: '0 8px 20px rgba(255,122,0,0.25)'
                                }}
                            >
                                Save Layout
                            </button>
                            <button
                                onClick={() => {
                                    resetSidebarLayout();
                                    setShowEditModal(false);
                                }}
                                style={{
                                    flex: 0.8,
                                    background: 'rgba(255,255,255,0.06)',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '12px',
                                    padding: '12px',
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                Reset
                            </button>
                            <button
                                onClick={() => setShowEditModal(false)}
                                style={{
                                    flex: 0.6,
                                    background: 'transparent',
                                    color: 'var(--text-muted, #9CA3AF)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '12px',
                                    padding: '12px',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </motion.div>
    );
};

export default Sidebar;
