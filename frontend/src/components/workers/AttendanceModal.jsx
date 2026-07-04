/**
 * ============================================================================= 
 * WORKER ATTENDANCE MODAL - Premium Liquid Glass Design
 * =============================================================================
 * 
 * Features:
 * - Bulk attendance marking for all workers
 * - Individual check-in/check-out functionality
 * - Real-time status updates
 * - Premium glass morphism design
 * - Smooth animations and transitions
 * - Color-coded attendance status
 * =============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { workerAPI } from '../../api/workers';
import { getLocalDateString } from '../../utils/api';

// ─── Icons ───────────────────────────────────────────────────────────────────
const ClockInIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
        <path d="M2 12h20" />
    </svg>
);

const ClockOutIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
        <path d="M12 2v4" />
    </svg>
);

const CheckIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
    </svg>
);




// ─── Component Props ───────────────────────────────────────────────────────────
const AttendanceModal = ({
    isOpen,
    workers,
    onClose,
    onAttendanceUpdate
}) => {
    const { isDark } = useTheme();
    const { addToast, showSuccess, showError } = useAlert();
    
    const [attendanceData, setAttendanceData] = useState({});
    const [loading, setLoading] = useState(false);
    const [processingIds, setProcessingIds] = useState(new Set());

    // ─── Initialize Attendance Data ─────────────────────────────────────────────
    useEffect(() => {
        if (isOpen && workers) {
            const initialData = {};
            workers.forEach(worker => {
                // Normalize status from backend (e.g. "Present" -> "present")
                const backendStatus = worker.today_attendance || 'not_marked';
                const status = backendStatus.toLowerCase().replace(' ', '_');
                
                initialData[worker.worker_id] = {
                    status: status === 'not_marked' ? 'not_marked' : (status === 'absent' ? 'absent' : 'present'),
                    check_in: null, // Times are only fetched for certain views, or we could fetch today's full record
                    check_out: null,
                    worker: worker
                };
            });
            setAttendanceData(initialData);
        }
    }, [isOpen, workers]);

    // ─── Action Handlers ───────────────────────────────────────────────────────
    const handleCheckIn = useCallback(async (workerId) => {
        if (processingIds.has(workerId)) return;

        setProcessingIds(prev => new Set(prev).add(workerId));
        
        try {
            const now = new Date();
            const response = await workerAPI.markAttendance(workerId, {
                date: getLocalDateString(now),
                check_in: now.toTimeString().split(' ')[0].substring(0, 5),
                status: 'Present'
            });

            if (response.success) {
                setAttendanceData(prev => ({
                    ...prev,
                    [workerId]: {
                        ...prev[workerId],
                        status: 'present',
                        check_in: now.toTimeString().split(' ')[0].substring(0, 5),
                        check_out: null
                    }
                }));
                
                addToast('✅ Check-in successful', 
                    `${attendanceData[workerId]?.worker?.name} checked in successfully`);
                onAttendanceUpdate?.();
                window.dispatchEvent(new CustomEvent('worker-attendance-updated'));
            } else {
                throw new Error(response.message || 'Check-in failed');
            }
        } catch (error) {
            console.error('Check-in error:', error);
            showError('❌ Check-in failed', error.message);
        } finally {
            setProcessingIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(workerId);
                return newSet;
            });
        }
    }, [processingIds, attendanceData, addToast, showError, onAttendanceUpdate]);

    const handleCheckOut = useCallback(async (workerId) => {
        if (processingIds.has(workerId)) return;

        setProcessingIds(prev => new Set(prev).add(workerId));
        
        try {
            const now = new Date();
            const response = await workerAPI.updateAttendance(workerId, {
                date: getLocalDateString(now),
                check_out: now.toTimeString().split(' ')[0].substring(0, 5)
            });

            if (response.success) {
                setAttendanceData(prev => ({
                    ...prev,
                    [workerId]: {
                        ...prev[workerId],
                        check_out: now.toTimeString().split(' ')[0].substring(0, 5)
                    }
                }));
                
                addToast('✅ Check-out successful', 
                    `${attendanceData[workerId]?.worker?.name} checked out successfully`);
                onAttendanceUpdate?.();
                window.dispatchEvent(new CustomEvent('worker-attendance-updated'));
            } else {
                throw new Error(response.message || 'Check-out failed');
            }
        } catch (error) {
            console.error('Check-out error:', error);
            showError('❌ Check-out failed', error.message);
        } finally {
            setProcessingIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(workerId);
                return newSet;
            });
        }
    }, [processingIds, attendanceData, addToast, showError, onAttendanceUpdate]);

    const handleMarkAbsent = useCallback(async (workerId) => {
        if (processingIds.has(workerId)) return;

        setProcessingIds(prev => new Set(prev).add(workerId));
        
        try {
            const response = await workerAPI.markAttendance(workerId, {
                date: getLocalDateString(new Date()),
                status: 'Absent'
            });

            if (response.success) {
                setAttendanceData(prev => ({
                    ...prev,
                    [workerId]: {
                        ...prev[workerId],
                        status: 'absent',
                        check_in: null,
                        check_out: null
                    }
                }));
                
                addToast('📝 Marked absent', 
                    `${attendanceData[workerId]?.worker?.name} marked as absent`);
                onAttendanceUpdate?.();
                window.dispatchEvent(new CustomEvent('worker-attendance-updated'));
            } else {
                throw new Error(response.message || 'Failed to mark absent');
            }
        } catch (error) {
            console.error('Mark absent error:', error);
            showError('❌ Failed to mark absent', error.message);
        } finally {
            setProcessingIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(workerId);
                return newSet;
            });
        }
    }, [processingIds, attendanceData, addToast, showError, onAttendanceUpdate]);

    const handleMarkAllPresent = useCallback(async () => {
        if (loading) return;
        
        setLoading(true);
        try {
            const now = new Date();
            const attendancePromises = workers.map(worker => 
                workerAPI.markAttendance(worker.worker_id, {
                    date: getLocalDateString(now),
                    check_in: now.toTimeString().split(' ')[0].substring(0, 5),
                    status: 'Present'
                })
            );

            const results = await Promise.allSettled(attendancePromises);
            const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
            const failed = results.length - successful;

            // Update local state for successful ones
            workers.forEach((worker, index) => {
                if (results[index].status === 'fulfilled' && results[index].value.success) {
                    setAttendanceData(prev => ({
                        ...prev,
                        [worker.worker_id]: {
                            ...prev[worker.worker_id],
                            status: 'present',
                            check_in: now.toTimeString().split(' ')[0].substring(0, 5),
                            check_out: null
                        }
                    }));
                }
            });

            if (successful > 0) {
                showSuccess('✅ Bulk attendance marked', 
                    `${successful} workers marked as present${failed > 0 ? `, ${failed} failed` : ''}`);
                onAttendanceUpdate?.();
                window.dispatchEvent(new CustomEvent('worker-attendance-updated'));
            }
            
            if (failed > 0) {
                showError('⚠️ Some operations failed', `${failed} workers could not be marked present`);
            }
        } catch (error) {
            console.error('Bulk attendance error:', error);
            showError('❌ Bulk operation failed', error.message);
        } finally {
            setLoading(false);
        }
    }, [workers, loading, showSuccess, showError, onAttendanceUpdate]);

    // ─── Status Helpers ─────────────────────────────────────────────────────────
    const getStatusColor = (status) => {
        switch (status) {
            case 'present': return '#22c55e';
            case 'absent': return '#ef4444';
            case 'half_day': return '#f59e0b';
            default: return isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)';
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'present': return 'Present';
            case 'absent': return 'Absent';
            case 'half_day': return 'Half Day';
            default: return 'Not Marked';
        }
    };

    // ─── Render ───────────────────────────────────────────────────────────────
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)'
                }}
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ 
                        duration: 0.25, 
                        ease: [0.25, 0.46, 0.45, 0.94] 
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        position: 'relative',
                        width: '90%',
                        maxWidth: '600px',
                        maxHeight: '80vh',
                        padding: '28px',
                        borderRadius: '22px',
                        background: isDark 
                            ? 'rgba(22, 26, 32, 0.9)' 
                            : 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(14px)',
                        WebkitBackdropFilter: 'blur(14px)',
                        border: isDark 
                            ? '1px solid rgba(255, 255, 255, 0.08)' 
                            : '1px solid rgba(0, 0, 0, 0.08)',
                        boxShadow: isDark
                            ? '0 30px 80px rgba(0, 0, 0, 0.55)'
                            : '0 20px 60px rgba(0, 0, 0, 0.12)',
                        color: isDark ? '#ffffff' : '#000000',
                        display: 'flex',
                        flexDirection: 'column'
                    }}
                >
                    {/* ─── Header ─────────────────────────────────────────── */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '24px'
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '16px'
                        }}>
                            <div style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '14px',
                                backgroundImage: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff',
                                flexShrink: 0,
                                boxShadow: '0 8px 24px rgba(59, 130, 246, 0.3)'
                            }}>
                                <ClockInIcon />
                            </div>
                            <div>
                                <h2 style={{
                                    margin: 0,
                                    fontSize: '20px',
                                    fontWeight: 700,
                                    letterSpacing: '0.2px',
                                    lineHeight: '1.3',
                                    color: isDark ? '#ffffff' : '#000000'
                                }}>
                                    Take Attendance
                                </h2>
                                <p style={{
                                    margin: '4px 0 0 0',
                                    fontSize: '13px',
                                    fontWeight: '500',
                                    color: isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)'
                                }}>
                                    {new Date().toLocaleDateString('en-US', { 
                                        weekday: 'long', 
                                        year: 'numeric', 
                                        month: 'long', 
                                        day: 'numeric' 
                                    })}
                                </p>
                            </div>
                        </div>

                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleMarkAllPresent}
                            disabled={loading}
                            style={{
                                padding: '10px 16px',
                                borderRadius: '12px',
                                border: 'none',
                                backgroundImage: loading ? 'none' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                backgroundColor: loading 
                                    ? (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)')
                                    : 'transparent',
                                color: loading 
                                    ? (isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)')
                                    : '#ffffff',
                                fontSize: '14px',
                                fontWeight: 600,
                                cursor: loading ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: loading ? 'none' : '0 4px 12px rgba(59, 130, 246, 0.3)',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <CheckIcon />
                            {loading ? 'Processing...' : 'Mark All Present'}
                        </motion.button>
                    </div>

                    {/* ─── Worker List ─────────────────────────────────────── */}
                    <div style={{
                        flex: 1,
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        maxHeight: '400px'
                    }}>
                        {workers?.map((worker, index) => {
                            const attendance = attendanceData[worker.worker_id] || {};
                            const isProcessing = processingIds.has(worker.worker_id);
                            
                            return (
                                <motion.div
                                    key={worker.worker_id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    style={{
                                        padding: '16px',
                                        borderRadius: '16px',
                                        background: isDark 
                                            ? 'rgba(255, 255, 255, 0.04)' 
                                            : 'rgba(0, 0, 0, 0.04)',
                                        border: isDark 
                                            ? '1px solid rgba(255, 255, 255, 0.08)' 
                                            : '1px solid rgba(0, 0, 0, 0.08)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '16px',
                                        transition: 'all 0.2s ease'
                                    }}
                                    whileHover={{
                                        backgroundColor: isDark 
                                            ? 'rgba(255, 255, 255, 0.06)' 
                                            : 'rgba(0, 0, 0, 0.06)'
                                    }}
                                >
                                    {/* Worker Avatar */}
                                    <div style={{
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: '12px',
                                        backgroundImage: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#ffffff',
                                        flexShrink: 0,
                                        fontSize: '16px',
                                        fontWeight: 600
                                    }}>
                                        {worker.name.charAt(0).toUpperCase()}
                                    </div>

                                    {/* Worker Info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontSize: '15px',
                                            fontWeight: 600,
                                            color: isDark ? '#ffffff' : '#000000',
                                            marginBottom: '4px'
                                        }}>
                                            {worker.name}
                                        </div>
                                        <div style={{
                                            fontSize: '13px',
                                            color: isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)'
                                        }}>
                                            {worker.role}
                                        </div>
                                    </div>

                                    {/* Status Badge */}
                                    <div style={{
                                        padding: '6px 12px',
                                        borderRadius: '20px',
                                        background: `${getStatusColor(attendance.status)}15`,
                                        color: getStatusColor(attendance.status),
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        border: `1px solid ${getStatusColor(attendance.status)}30`
                                    }}>
                                        {getStatusBadge(attendance.status)}
                                    </div>

                                    {/* Action Buttons */}
                                    <div style={{
                                        display: 'flex',
                                        gap: '8px'
                                    }}>
                                        {(attendance.status !== 'present' || !attendance.check_in) && (
                                            <motion.button
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                                onClick={() => handleCheckIn(worker.worker_id)}
                                                disabled={isProcessing}
                                                style={{
                                                    padding: '8px 12px',
                                                    borderRadius: '10px',
                                                    border: 'none',
                                                    backgroundImage: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                                    color: '#ffffff',
                                                    fontSize: '12px',
                                                    fontWeight: 600,
                                                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    opacity: isProcessing ? 0.5 : 1,
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                <ClockInIcon />
                                                Check In
                                            </motion.button>
                                        )}

                                        {attendance.status === 'present' && !attendance.check_out && (
                                            <motion.button
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                                onClick={() => handleCheckOut(worker.worker_id)}
                                                disabled={isProcessing}
                                                style={{
                                                    padding: '8px 12px',
                                                    borderRadius: '10px',
                                                    border: 'none',
                                                    backgroundImage: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                                    color: '#ffffff',
                                                    fontSize: '12px',
                                                    fontWeight: 600,
                                                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    opacity: isProcessing ? 0.5 : 1,
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                <ClockOutIcon />
                                                Check Out
                                            </motion.button>
                                        )}

                                        {(attendance.status === 'not_marked' || attendance.status === 'present') && (
                                            <motion.button
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                                onClick={() => handleMarkAbsent(worker.worker_id)}
                                                disabled={isProcessing}
                                                style={{
                                                    padding: '8px 12px',
                                                    borderRadius: '10px',
                                                    border: isDark 
                                                        ? '1px solid rgba(239, 68, 68, 0.3)' 
                                                        : '1px solid rgba(239, 68, 68, 0.2)',
                                                    background: 'transparent',
                                                    color: '#ef4444',
                                                    fontSize: '12px',
                                                    fontWeight: 600,
                                                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                                                    opacity: isProcessing ? 0.5 : 1,
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                Absent
                                            </motion.button>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>

                    {/* ─── Close Button ─────────────────────────────────────── */}
                    <button
                        onClick={onClose}
                        style={{
                            position: 'absolute',
                            top: '16px',
                            right: '16px',
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            border: 'none',
                            background: isDark 
                                ? 'rgba(255, 255, 255, 0.08)' 
                                : 'rgba(0, 0, 0, 0.06)',
                            color: isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = isDark 
                                ? 'rgba(255, 255, 255, 0.12)' 
                                : 'rgba(0, 0, 0, 0.1)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = isDark 
                                ? 'rgba(255, 255, 255, 0.08)' 
                                : 'rgba(0, 0, 0, 0.06)';
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default AttendanceModal;
