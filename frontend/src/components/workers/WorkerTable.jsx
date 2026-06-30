/**
 * WorkerTable — Premium worker grid list replacing old list rows
 * Each card displays a worker in a highly polished 340-380px square card layout.
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    IoEye, 
    IoPencil, 
    IoTrash, 
    IoEllipsisVertical, 
    IoCall, 
    IoBriefcase,
    IoWalletOutline,
    IoCashOutline,
    IoCalendarOutline,
    IoDocumentTextOutline
} from 'react-icons/io5';
import { formatCurrency } from '../../utils/api';

/* ─── Action Menu ─── */
const ActionMenu = ({ worker, onView, onEdit, onDelete, open, setOpen }) => {
    return (
        <div style={{ position: 'relative' }}>
            <motion.button
                onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
                whileHover={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                whileTap={{ scale: 0.92 }}
                style={{
                    width: '32px', height: '32px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    borderRadius: '8px',
                    color: '#71717A',
                }}
            >
                <IoEllipsisVertical size={16} />
            </motion.button>

            <AnimatePresence>
                {open && (
                    <>
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
                                minWidth: 160,
                                background: '#1E1E22',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 12,
                                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                                padding: 6,
                                overflow: 'hidden',
                            }}
                        >
                            <MenuItem icon={IoEye} label="View Profile" onClick={() => { onView(worker); setOpen(false); }} color="#FF7A00" />
                            <MenuItem icon={IoPencil} label="Edit Worker" onClick={() => { onEdit(worker); setOpen(false); }} color="#3B82F6" />
                            <MenuItem icon={IoCalendarOutline} label="Attendance" onClick={() => { setOpen(false); }} color="#10B981" />
                            <MenuItem icon={IoWalletOutline} label="Salary History" onClick={() => { setOpen(false); }} color="#A855F7" />
                            <MenuItem icon={IoDocumentTextOutline} label="Payroll" onClick={() => { setOpen(false); }} color="#F59E0B" />
                            <div style={{
                                height: 1, margin: '6px 8px',
                                background: 'rgba(255,255,255,0.06)',
                            }} />
                            <MenuItem icon={IoTrash} label="Delete Worker" onClick={() => { onDelete(worker); setOpen(false); }} color="#EF4444" />
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

const MenuItem = ({ icon: Icon, label, onClick, color }) => {
    return (
        <motion.button
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
            style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', border: 'none', background: 'transparent',
                cursor: 'pointer', borderRadius: 8,
                fontSize: 13, fontWeight: 500,
                color: '#D4D4D8',
            }}
        >
            <Icon size={14} style={{ color, flexShrink: 0 }} />
            <span>{label}</span>
        </motion.button>
    );
};

/* ─── Worker Card (Square Design) ─── */
const WorkerCard = ({ worker, onView, onEdit, onDelete, index }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.03, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => onView(worker)}
            className="worker-premium-card"
            style={{
                width: '100%',
                maxWidth: '380px',
                aspectRatio: '1 / 1',
                background: '#17181C',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '24px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                cursor: 'pointer',
                position: 'relative',
                boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                boxSizing: 'border-box'
            }}
        >
            {/* Top Right Three Dot Menu */}
            <div 
                style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 10 }}
                onClick={(e) => e.stopPropagation()}
            >
                <ActionMenu
                    worker={worker}
                    onView={onView}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    open={menuOpen}
                    setOpen={setMenuOpen}
                />
            </div>

            {/* Header Section (Top 45%) */}
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center', height: '45%' }}>
                {/* Profile Frame */}
                <div style={{
                    width: '120px',
                    height: '120px',
                    borderRadius: '18px',
                    overflow: 'hidden',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, rgba(255,122,0,0.1) 0%, rgba(255,90,0,0.2) 100%)',
                    border: '1px solid rgba(255,122,0,0.3)',
                    boxShadow: '0 8px 16px rgba(0,0,0,0.2)',
                    transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
                }} className="worker-profile-frame">
                    {worker.photo ? (
                        <img 
                            src={worker.photo} 
                            alt={worker.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                        />
                    ) : (
                        <span style={{ 
                            fontSize: '36px', 
                            fontWeight: 800, 
                            color: '#FF7A00',
                            textShadow: '0 2px 10px rgba(255,122,0,0.2)'
                        }}>
                            {(worker.name || '?').charAt(0).toUpperCase()}
                        </span>
                    )}
                </div>

                {/* Employee Information */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
                    <span style={{ 
                        fontSize: '18px', 
                        fontWeight: 700, 
                        color: '#FFFFFF',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    }}>
                        {worker.name}
                    </span>
                    
                    {/* Role Badge */}
                    <div style={{ 
                        alignSelf: 'flex-start',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '20px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'rgba(255,255,255,0.6)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                    }}>
                        <IoBriefcase size={11} style={{ opacity: 0.8 }} />
                        <span>{worker.role}</span>
                    </div>

                    {/* Phone Number */}
                    {worker.phone && (
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '6px',
                            fontSize: '13px',
                            color: 'rgba(255,255,255,0.4)'
                        }}>
                            <IoCall size={12} style={{ opacity: 0.6 }} />
                            <span>{worker.phone}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Divider */}
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '12px 0' }}></div>

            {/* Salary Section */}
            <div style={{ display: 'flex', gap: '12px' }}>
                {/* Left Card */}
                <div style={{
                    flex: 1,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.04)',
                    borderRadius: '16px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '6px',
                            background: 'rgba(255,122,0,0.1)',
                            color: '#FF7A00',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <IoWalletOutline size={12} />
                        </div>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.05em' }}>SALARY</span>
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>
                        {formatCurrency(worker.salary)}
                    </span>
                </div>

                {/* Right Card */}
                <div style={{
                    flex: 1,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.04)',
                    borderRadius: '16px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '6px',
                            background: 'rgba(34,197,94,0.1)',
                            color: '#22C55E',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <IoCashOutline size={12} />
                        </div>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.05em' }}>NET PAY</span>
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>
                        {formatCurrency(worker.salary - (worker.current_advance || 0))}
                    </span>
                </div>
            </div>

            {/* Bottom Section */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>
                    ID: WKR-{String(worker.worker_id).padStart(4, '0')}
                </span>
                
                <button
                    onClick={(e) => { e.stopPropagation(); onView(worker); }}
                    className="worker-view-btn"
                    style={{
                        padding: '8px 16px',
                        background: 'transparent',
                        border: '1px solid #FF7A00',
                        borderRadius: '12px',
                        color: '#FF7A00',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}
                >
                    View Details →
                </button>
            </div>
        </motion.div>
    );
};

/* ─── Responsive Grid Container ─── */
const WorkerTable = ({ workers, onView, onEdit, onDelete }) => {
    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '24px',
            padding: '4px 0 24px 0',
            width: '100%'
        }} className="workers-grid-layout">
            {workers.map((worker, i) => (
                <WorkerCard
                    key={worker.worker_id}
                    worker={worker}
                    onView={onView}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    index={i}
                />
            ))}
        </div>
    );
};

export default WorkerTable;
