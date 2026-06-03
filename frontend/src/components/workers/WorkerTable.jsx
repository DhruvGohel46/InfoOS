/**
 * WorkerTable — Premium worker list with card-style rows
 * Each row is a hoverable card with avatar, metadata, and contextual actions
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IoEye, IoPencil, IoTrash, IoEllipsisVertical, IoCall, IoBriefcase } from 'react-icons/io5';
import { useTheme } from '../../context/ThemeContext';
import { formatCurrency } from '../../utils/api';

/* ─── Action Menu ─── */
const ActionMenu = ({ worker, onView, onEdit, onDelete, open, setOpen }) => {
    const { isDark } = useTheme();

    return (
        <div style={{ position: 'relative' }}>
            <motion.button
                onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
                whileHover={{ backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}
                whileTap={{ scale: 0.92 }}
                style={{
                    width: 'calc(32px * var(--display-zoom))', height: 'calc(32px * var(--display-zoom))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    borderRadius: 'calc(8px * var(--display-zoom))',
                    color: isDark ? '#71717A' : '#9CA3AF',
                }}
            >
                <IoEllipsisVertical size={16 * 1} />
            </motion.button>

            <AnimatePresence>
                {open && (
                    <>
                        {/* Invisible backdrop to close menu */}
                        <div
                            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
                            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -4 }}
                            transition={{ duration: 0.12 }}
                            style={{
                                position: 'absolute', right: 0, top: '100%', marginTop: 4,
                                zIndex: 100,
                                minWidth: 140,
                                background: isDark ? '#1E1E22' : '#FFFFFF',
                                border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                                borderRadius: 10,
                                boxShadow: isDark
                                    ? '0 8px 24px rgba(0,0,0,0.5)'
                                    : '0 8px 24px rgba(0,0,0,0.1)',
                                padding: 4,
                                overflow: 'hidden',
                            }}
                        >
                            <MenuItem icon={IoEye} label="View Profile" onClick={() => { onView(worker); setOpen(false); }} color="#F97316" />
                            <MenuItem icon={IoPencil} label="Edit" onClick={() => { onEdit(worker); setOpen(false); }} color="#3B82F6" />
                            <div style={{
                                height: 1, margin: '4px 8px',
                                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                            }} />
                            <MenuItem icon={IoTrash} label="Delete" onClick={() => { onDelete(worker); setOpen(false); }} color="#EF4444" />
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

const MenuItem = ({ icon: Icon, label, onClick, color }) => {
    const { isDark } = useTheme();
    return (
        <motion.button
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            whileHover={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}
            style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', border: 'none', background: 'transparent',
                cursor: 'pointer', borderRadius: 6,
                fontSize: 13, fontWeight: 500,
                color: isDark ? '#D4D4D8' : '#374151',
            }}
        >
            <Icon size={14} style={{ color, flexShrink: 0 }} />
            <span>{label}</span>
        </motion.button>
    );
};

/* ─── Worker Row ─── */
const WorkerRow = ({ worker, onView, onEdit, onDelete, index }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const { isDark } = useTheme();

    const statusColor = worker.status === 'active' ? '#10B981' : '#71717A';
    const hasAdvance = worker.current_advance > 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.04, ease: [0.25, 0.46, 0.45, 0.94] }}
            onClick={() => onView(worker)}
            whileHover={{
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.6)',
                scale: 1.01,
                transition: { duration: 0.2 }
            }}
            className="lift-3d"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'calc(16px * var(--display-zoom))',
                padding: 'calc(16px * var(--display-zoom)) calc(20px * var(--display-zoom))',
                borderRadius: 'calc(20px * var(--display-zoom))',
                cursor: 'pointer',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'}`,
                background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.3)',
                backdropFilter: 'var(--glass-blur)',
                marginBottom: 'calc(8px * var(--display-zoom))',
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                position: 'relative',
                zIndex: menuOpen ? 50 : 1,
                overflow: 'visible',
            }}
        >
            {/* Avatar */}
            <div style={{
                width: 'calc(42px * var(--display-zoom))', height: 'calc(42px * var(--display-zoom))', borderRadius: 'calc(12px * var(--display-zoom))',
                overflow: 'hidden', flexShrink: 0,
                backgroundImage: isDark
                    ? 'linear-gradient(145deg, #27272A, #1C1C1F)'
                    : 'linear-gradient(145deg, #F9FAFB, #F0F1F3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#F97316', fontWeight: 600, fontSize: 'calc(15px * var(--text-scale))',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
            }}>
                {worker.photo ? (
                    <img src={worker.photo} alt={worker.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                    (worker.name || '?').charAt(0).toUpperCase()
                )}
            </div>

            {/* Name + Phone */}
            <div style={{ flex: `1 1 calc(180px * var(--display-zoom))`, minWidth: 0 }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 'calc(8px * var(--display-zoom))',
                }}>
                    <span style={{
                        fontSize: 'calc(14px * var(--text-scale))', fontWeight: 600,
                        color: isDark ? '#FAFAFA' : '#111827',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        {worker.name}
                    </span>
                    {/* Status dot */}
                    <span style={{
                        width: 'calc(6px * var(--display-zoom))', height: 'calc(6px * var(--display-zoom))', borderRadius: '50%',
                        background: statusColor, flexShrink: 0,
                        boxShadow: worker.status === 'active' ? '0 0 6px rgba(16,185,129,0.4)' : 'none',
                    }} />
                </div>
                {worker.phone && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        fontSize: 12, color: isDark ? '#52525B' : '#9CA3AF',
                        marginTop: 2,
                    }}>
                        <IoCall size={10} />
                        {worker.phone}
                    </div>
                )}
            </div>

            {/* Role */}
            <div style={{
                flex: `0 1 calc(120px * var(--display-zoom))`, minWidth: 0,
                display: 'flex', alignItems: 'center', gap: 'calc(6px * var(--display-zoom))',
            }}>
                <div style={{
                    padding: 'calc(4px * var(--display-zoom)) calc(10px * var(--display-zoom))',
                    borderRadius: 'calc(6px * var(--display-zoom))',
                    background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                    fontSize: 'calc(12px * var(--text-scale))', fontWeight: 500,
                    color: isDark ? '#A1A1AA' : '#6B7280',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    display: 'flex', alignItems: 'center', gap: 'calc(4px * var(--display-zoom))',
                }}>
                    <IoBriefcase size={11} style={{ flexShrink: 0, opacity: 0.6 }} />
                    {worker.role}
                </div>
            </div>

            {/* Salary */}
            <div style={{
                flex: `0 1 calc(130px * var(--display-zoom))`, minWidth: 0,
                textAlign: 'right',
            }}>
                <span style={{
                    fontSize: 'calc(14px * var(--text-scale))', fontWeight: 600,
                    color: isDark ? '#FAFAFA' : '#111827',
                    fontVariantNumeric: 'tabular-nums',
                }}>
                    {formatCurrency(worker.salary)}
                </span>
                <span style={{
                    fontSize: 'calc(11px * var(--text-scale))', color: isDark ? '#52525B' : '#9CA3AF',
                    marginLeft: 'calc(2px * var(--display-zoom))',
                }}>/mo</span>
            </div>

            {/* Advance */}
            <div style={{
                flex: `0 1 calc(100px * var(--display-zoom))`, minWidth: 0,
                textAlign: 'right',
            }}>
                {hasAdvance ? (
                    <span style={{
                        fontSize: 'calc(13px * var(--text-scale))', fontWeight: 600,
                        color: '#EF4444',
                        fontVariantNumeric: 'tabular-nums',
                        padding: 'calc(3px * var(--display-zoom)) calc(8px * var(--display-zoom))',
                        borderRadius: 'calc(6px * var(--display-zoom))',
                        background: 'rgba(239,68,68,0.08)',
                    }}>
                        {formatCurrency(worker.current_advance)}
                    </span>
                ) : (
                    <span style={{
                        fontSize: 12,
                        color: isDark ? '#3F3F46' : '#D1D5DB',
                    }}>
                        —
                    </span>
                )}
            </div>

            {/* Action Menu */}
            <div style={{ flexShrink: 0, marginLeft: 4 }}>
                <ActionMenu
                    worker={worker}
                    onView={onView}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    open={menuOpen}
                    setOpen={setMenuOpen}
                />
            </div>
        </motion.div>
    );
};

/* ─── Table Container ─── */
const WorkerTable = ({ workers, onView, onEdit, onDelete }) => {
    const { isDark } = useTheme();

    return (
        <div>
            {/* Column labels */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 'calc(16px * var(--display-zoom))',
                padding: `0 calc(16px * var(--display-zoom)) calc(10px * var(--display-zoom)) calc(16px * var(--display-zoom))`,
                borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
            }}>
                {/* Avatar spacer */}
                <div style={{ width: 'calc(42px * var(--display-zoom))', flexShrink: 0 }} />
                <div style={{
                    flex: `1 1 calc(180px * var(--display-zoom))`, fontSize: 'calc(11px * var(--text-scale))', fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    color: isDark ? '#52525B' : '#9CA3AF',
                }}>Name</div>
                <div style={{
                    flex: `0 1 calc(120px * var(--display-zoom))`, fontSize: 'calc(11px * var(--text-scale))', fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    color: isDark ? '#52525B' : '#9CA3AF',
                }}>Role</div>
                <div style={{
                    flex: `0 1 calc(130px * var(--display-zoom))`, fontSize: 'calc(11px * var(--text-scale))', fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    color: isDark ? '#52525B' : '#9CA3AF', textAlign: 'right',
                }}>Salary</div>
                <div style={{
                    flex: `0 1 calc(100px * var(--display-zoom))`, fontSize: 'calc(11px * var(--text-scale))', fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    color: isDark ? '#52525B' : '#9CA3AF', textAlign: 'right',
                }}>Advance</div>
                {/* Action spacer */}
                <div style={{ width: 'calc(36px * var(--display-zoom))', flexShrink: 0 }} />
            </div>

            {/* Rows */}
            <div style={{ marginTop: 4 }}>
                {workers.map((worker, i) => (
                    <WorkerRow
                        key={worker.worker_id}
                        worker={worker}
                        onView={onView}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        index={i}
                    />
                ))}
            </div>
        </div>
    );
};

export default WorkerTable;
