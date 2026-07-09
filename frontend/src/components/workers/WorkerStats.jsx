import React from 'react';
import { motion } from 'framer-motion';
import { formatCurrency } from '../../utils/api';
import { useTheme } from '../../context/ThemeContext';
import { IoPeopleOutline, IoCheckmarkCircleOutline, IoCalendarOutline, IoCashOutline, IoWalletOutline } from 'react-icons/io5';

const WorkerStats = ({ stats }) => {
    const { isDark } = useTheme();

    const items = [
        { label: 'Workers', value: stats.totalWorkers || 0, color: '#3B82F6', icon: <IoPeopleOutline size={14} /> },
        { label: 'Active', value: stats.activeWorkers || 0, color: '#10B981', icon: <IoCheckmarkCircleOutline size={14} /> },
        { label: 'Present', value: stats.presentToday || 0, color: '#F97316', icon: <IoCalendarOutline size={14} /> },
        { label: 'Salary', value: formatCurrency(stats.totalSalary || 0), color: '#8B5CF6', icon: <IoWalletOutline size={14} /> },
        { label: 'Net Pay', value: formatCurrency(stats.netPayable || 0), color: '#EF4444', icon: <IoCashOutline size={14} /> },
    ];

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="glass-panel"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 0,
                padding: '0 calc(8px * var(--display-zoom))',
                height: 'calc(54px * var(--display-zoom))',
                margin: 'calc(16px * var(--display-zoom))',
                borderRadius: 'calc(16px * var(--display-zoom))',
                backgroundImage: 'var(--glass-card)',
                border: '1px solid var(--glass-border)',
                backdropFilter: 'var(--glass-blur)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
                overflow: 'hidden'
            }}
        >
            {items.map((item, i) => (
                <React.Fragment key={item.label}>
                    {i > 0 && (
                        <div style={{
                            width: 1,
                            height: 'calc(24px * var(--display-zoom))',
                            background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                            flexShrink: 0,
                        }} />
                    )}
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 'calc(8px * var(--display-zoom))',
                        padding: '0 calc(12px * var(--display-zoom))',
                        minWidth: 0,
                    }}>
                        <div style={{
                            width: 'calc(24px * var(--display-zoom))',
                            height: 'calc(24px * var(--display-zoom))',
                            borderRadius: 'calc(6px * var(--display-zoom))',
                            background: `color-mix(in srgb, ${item.color} 15%, transparent)`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: item.color,
                            flexShrink: 0
                        }}>
                            {item.icon}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'calc(6px * var(--display-zoom))', minWidth: 0 }}>
                            <span style={{
                                fontSize: 'calc(11px * var(--text-scale))',
                                fontWeight: 700,
                                color: isDark ? '#71717A' : '#6B7280',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                whiteSpace: 'nowrap'
                            }}>
                                {item.label}
                            </span>
                            <span style={{
                                fontSize: 'calc(14px * var(--text-scale))',
                                fontWeight: 800,
                                color: isDark ? '#FAFAFA' : '#111827',
                                whiteSpace: 'nowrap',
                                fontVariantNumeric: 'tabular-nums'
                            }}>
                                {item.value}
                            </span>
                        </div>
                    </div>
                </React.Fragment>
            ))}
        </motion.div>
    );
};

export default WorkerStats;
