/**
 * =============================================================================
 * WORKER ATTENDANCE MODAL — ReBill Liquid Glass & Continuous Curve Design
 * =============================================================================
 * 
 * Features:
 * - ReBill signature orange gradient accents & continuous 24px curved glass surfaces
 * - Bulk attendance marking for all active workers
 * - Individual check-in, check-out, half-day, and absent marking
 * - Search by worker name/role & filter chips (All, Pending, Present, Absent)
 * - Real-time statistics counter (Total, Present, Absent, Pending)
 * - Worker photo avatars with fallback initial badges matching WorkerTable
 * - Color-coded status badges with timestamp indicators
 * - Smooth Framer Motion transitions and responsive layout
 * =============================================================================
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    IoClose,
    IoCalendarOutline,
    IoTimeOutline,
    IoCheckmarkDoneOutline,
    IoCheckmarkCircle,
    IoCloseCircle,
    IoCloseCircleOutline,
    IoBriefcase,
    IoSearch,
    IoLogInOutline,
    IoLogOutOutline,
    IoPeopleOutline,
    IoHourglassOutline,
    IoCheckmark
} from 'react-icons/io5';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { workerAPI } from '../../api/workers';
import { getLocalDateString } from '../../utils/api';

const AttendanceModal = ({
    isOpen,
    workers = [],
    onClose,
    onAttendanceUpdate
}) => {
    const { isDark } = useTheme();
    const { addToast, showSuccess, showError } = useAlert();

    const [attendanceData, setAttendanceData] = useState({});
    const [loading, setLoading] = useState(false);
    const [processingIds, setProcessingIds] = useState(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'pending' | 'present' | 'absent'

    // ─── Initialize Attendance Data ─────────────────────────────────────────────
    useEffect(() => {
        if (isOpen && workers) {
            const initialData = {};
            workers.forEach(worker => {
                const backendStatus = worker.today_attendance || 'not_marked';
                const status = backendStatus.toLowerCase().replace(' ', '_').replace('-', '_');

                initialData[worker.worker_id] = {
                    status: status === 'not_marked' ? 'not_marked' : (status === 'absent' ? 'absent' : (status === 'half_day' ? 'half_day' : 'present')),
                    check_in: worker.today_check_in || null,
                    check_out: worker.today_check_out || null,
                    worker: worker
                };
            });
            setAttendanceData(initialData);
            setSearchQuery('');
            setFilterStatus('all');
        }
    }, [isOpen, workers]);

    // ─── Action Handlers ───────────────────────────────────────────────────────
    const handleCheckIn = useCallback(async (workerId) => {
        if (processingIds.has(workerId)) return;

        setProcessingIds(prev => new Set(prev).add(workerId));

        try {
            const now = new Date();
            const timeStr = now.toTimeString().split(' ')[0].substring(0, 5);
            const response = await workerAPI.markAttendance(workerId, {
                date: getLocalDateString(now),
                check_in: timeStr,
                status: 'Present'
            });

            if (response.success) {
                setAttendanceData(prev => ({
                    ...prev,
                    [workerId]: {
                        ...prev[workerId],
                        status: 'present',
                        check_in: timeStr,
                        check_out: null
                    }
                }));

                addToast('✅ Check-In Recorded',
                    `${attendanceData[workerId]?.worker?.name || 'Worker'} checked in at ${timeStr}`);
                onAttendanceUpdate?.();
                window.dispatchEvent(new CustomEvent('worker-attendance-updated'));
            } else {
                throw new Error(response.message || 'Check-in failed');
            }
        } catch (error) {
            console.error('Check-in error:', error);
            showError('Check-in Failed', error.message || 'Could not record check-in');
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(workerId);
                return next;
            });
        }
    }, [processingIds, attendanceData, addToast, showError, onAttendanceUpdate]);

    const handleCheckOut = useCallback(async (workerId) => {
        if (processingIds.has(workerId)) return;

        setProcessingIds(prev => new Set(prev).add(workerId));

        try {
            const now = new Date();
            const timeStr = now.toTimeString().split(' ')[0].substring(0, 5);
            const response = await workerAPI.updateAttendance(workerId, {
                date: getLocalDateString(now),
                check_out: timeStr
            });

            if (response.success) {
                setAttendanceData(prev => ({
                    ...prev,
                    [workerId]: {
                        ...prev[workerId],
                        check_out: timeStr
                    }
                }));

                addToast('✅ Check-Out Recorded',
                    `${attendanceData[workerId]?.worker?.name || 'Worker'} checked out at ${timeStr}`);
                onAttendanceUpdate?.();
                window.dispatchEvent(new CustomEvent('worker-attendance-updated'));
            } else {
                throw new Error(response.message || 'Check-out failed');
            }
        } catch (error) {
            console.error('Check-out error:', error);
            showError('Check-out Failed', error.message || 'Could not record check-out');
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(workerId);
                return next;
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

                addToast('📝 Marked Absent',
                    `${attendanceData[workerId]?.worker?.name || 'Worker'} marked as absent`);
                onAttendanceUpdate?.();
                window.dispatchEvent(new CustomEvent('worker-attendance-updated'));
            } else {
                throw new Error(response.message || 'Failed to mark absent');
            }
        } catch (error) {
            console.error('Mark absent error:', error);
            showError('Mark Absent Failed', error.message || 'Could not mark absent');
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(workerId);
                return next;
            });
        }
    }, [processingIds, attendanceData, addToast, showError, onAttendanceUpdate]);

    const handleMarkAllPresent = useCallback(async () => {
        if (loading || !workers.length) return;

        setLoading(true);
        try {
            const now = new Date();
            const timeStr = now.toTimeString().split(' ')[0].substring(0, 5);
            const attendancePromises = workers.map(worker =>
                workerAPI.markAttendance(worker.worker_id, {
                    date: getLocalDateString(now),
                    check_in: timeStr,
                    status: 'Present'
                })
            );

            const results = await Promise.allSettled(attendancePromises);
            const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
            const failed = results.length - successful;

            workers.forEach((worker, index) => {
                if (results[index].status === 'fulfilled' && results[index].value.success) {
                    setAttendanceData(prev => ({
                        ...prev,
                        [worker.worker_id]: {
                            ...prev[worker.worker_id],
                            status: 'present',
                            check_in: timeStr,
                            check_out: null
                        }
                    }));
                }
            });

            if (successful > 0) {
                showSuccess('Bulk Attendance Marked',
                    `${successful} staff members marked as present${failed > 0 ? ` (${failed} failed)` : ''}`);
                onAttendanceUpdate?.();
                window.dispatchEvent(new CustomEvent('worker-attendance-updated'));
            }

            if (failed > 0) {
                showError('Partial Failure', `${failed} workers could not be marked present`);
            }
        } catch (error) {
            console.error('Bulk attendance error:', error);
            showError('Bulk Action Failed', error.message || 'Failed to complete bulk attendance');
        } finally {
            setLoading(false);
        }
    }, [workers, loading, showSuccess, showError, onAttendanceUpdate]);

    // ─── Stats & Filter Calculations ───────────────────────────────────────────
    const stats = useMemo(() => {
        let present = 0;
        let absent = 0;
        let notMarked = 0;

        workers.forEach(w => {
            const record = attendanceData[w.worker_id];
            const status = record?.status || 'not_marked';
            if (status === 'present' || status === 'half_day') {
                present++;
            } else if (status === 'absent') {
                absent++;
            } else {
                notMarked++;
            }
        });

        return {
            total: workers.length,
            present,
            absent,
            notMarked
        };
    }, [workers, attendanceData]);

    const filteredWorkers = useMemo(() => {
        return workers.filter(worker => {
            const record = attendanceData[worker.worker_id] || {};
            const status = record.status || 'not_marked';

            // Filter status
            if (filterStatus === 'present' && status !== 'present' && status !== 'half_day') return false;
            if (filterStatus === 'absent' && status !== 'absent') return false;
            if (filterStatus === 'pending' && status !== 'not_marked') return false;

            // Search query
            if (searchQuery.trim()) {
                const query = searchQuery.toLowerCase().trim();
                const nameMatch = worker.name?.toLowerCase().includes(query);
                const roleMatch = worker.role?.toLowerCase().includes(query);
                const phoneMatch = worker.phone?.includes(query);
                return nameMatch || roleMatch || phoneMatch;
            }

            return true;
        });
    }, [workers, attendanceData, filterStatus, searchQuery]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div
                style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 1200,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px'
                }}
            >
                {/* ─── Backdrop ───────────────────────────────────────────── */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundColor: 'rgba(8, 10, 14, 0.65)',
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)'
                    }}
                />

                {/* ─── Modal Shell ────────────────────────────────────────── */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 16 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 16 }}
                    transition={{ duration: 0.24, ease: [0.25, 0.46, 0.45, 0.94] }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        position: 'relative',
                        width: '100%',
                        maxWidth: '680px',
                        maxHeight: '90vh',
                        borderRadius: '24px',
                        background: isDark
                            ? 'linear-gradient(145deg, rgba(22, 25, 32, 0.96) 0%, rgba(16, 18, 24, 0.98) 100%)'
                            : 'linear-gradient(145deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.96) 100%)',
                        backdropFilter: 'blur(24px)',
                        WebkitBackdropFilter: 'blur(24px)',
                        border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
                        boxShadow: isDark
                            ? '0 30px 80px rgba(0, 0, 0, 0.65), inset 0 1px 1px rgba(255, 255, 255, 0.07)'
                            : '0 24px 60px rgba(15, 23, 42, 0.14), inset 0 1px 1px rgba(255, 255, 255, 0.9)',
                        color: isDark ? '#FFFFFF' : '#0F172A',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        zIndex: 10
                    }}
                >
                    {/* Top ambient highlight */}
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: '120px',
                            background: isDark
                                ? 'radial-gradient(circle at 50% -20%, rgba(255, 107, 26, 0.12), transparent 70%)'
                                : 'radial-gradient(circle at 50% -20%, rgba(255, 107, 26, 0.08), transparent 70%)',
                            pointerEvents: 'none'
                        }}
                    />

                    {/* ─── Header ─────────────────────────────────────────── */}
                    <div
                        style={{
                            padding: '24px 28px 20px 28px',
                            borderBottom: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'}`,
                            position: 'relative'
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '16px'
                            }}
                        >
                            {/* Title & Brand Icon */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0 }}>
                                <div
                                    style={{
                                        width: '48px',
                                        height: '48px',
                                        borderRadius: '16px',
                                        background: 'linear-gradient(135deg, #FF6B1A 0%, #EA580C 100%)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#FFFFFF',
                                        flexShrink: 0,
                                        boxShadow: '0 8px 20px rgba(255, 107, 26, 0.28)'
                                    }}
                                >
                                    <IoTimeOutline size={26} />
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <h2
                                        style={{
                                            margin: 0,
                                            fontSize: '1.25rem',
                                            fontWeight: 800,
                                            letterSpacing: '-0.02em',
                                            lineHeight: 1.2,
                                            color: isDark ? '#FFFFFF' : '#0F172A'
                                        }}
                                    >
                                        Take Attendance
                                    </h2>
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            marginTop: '5px',
                                            fontSize: '0.82rem',
                                            fontWeight: 600,
                                            color: isDark ? '#94A3B8' : '#64748B'
                                        }}
                                    >
                                        <IoCalendarOutline size={14} style={{ color: '#FF6B1A' }} />
                                        <span>
                                            {new Date().toLocaleDateString('en-US', {
                                                weekday: 'long',
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric'
                                            })}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Header Actions */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                                <motion.button
                                    whileHover={{ scale: 1.03 }}
                                    whileTap={{ scale: 0.96 }}
                                    onClick={handleMarkAllPresent}
                                    disabled={loading || workers.length === 0}
                                    style={{
                                        padding: '9px 16px',
                                        borderRadius: '12px',
                                        border: 'none',
                                        background: loading
                                            ? (isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0')
                                            : 'linear-gradient(135deg, #FF6B1A 0%, #EA580C 100%)',
                                        color: loading
                                            ? (isDark ? 'rgba(255, 255, 255, 0.4)' : '#94A3B8')
                                            : '#FFFFFF',
                                        fontSize: '0.84rem',
                                        fontWeight: 750,
                                        cursor: loading ? 'not-allowed' : 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        boxShadow: loading ? 'none' : '0 4px 14px rgba(255, 107, 26, 0.28)',
                                        transition: 'all 0.2s ease',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    {loading ? (
                                        <>
                                            <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                                            <span>Marking...</span>
                                        </>
                                    ) : (
                                        <>
                                            <IoCheckmarkDoneOutline size={17} />
                                            <span>Mark All Present</span>
                                        </>
                                    )}
                                </motion.button>

                                <motion.button
                                    whileHover={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
                                    whileTap={{ scale: 0.92 }}
                                    onClick={onClose}
                                    style={{
                                        width: '36px',
                                        height: '36px',
                                        borderRadius: '10px',
                                        border: 'none',
                                        background: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
                                        color: isDark ? '#94A3B8' : '#64748B',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <IoClose size={20} />
                                </motion.button>
                            </div>
                        </div>

                        {/* ─── Stats & Filter Strip ───────────────────────────── */}
                        <div
                            style={{
                                marginTop: '18px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '12px',
                                flexWrap: 'wrap'
                            }}
                        >
                            {/* Filter Chips */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {[
                                    { id: 'all', label: 'All', count: stats.total, color: '#FF6B1A' },
                                    { id: 'pending', label: 'Pending', count: stats.notMarked, color: isDark ? '#94A3B8' : '#64748B' },
                                    { id: 'present', label: 'Present', count: stats.present, color: '#10B981' },
                                    { id: 'absent', label: 'Absent', count: stats.absent, color: '#EF4444' }
                                ].map(tab => {
                                    const active = filterStatus === tab.id;
                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => setFilterStatus(tab.id)}
                                            style={{
                                                padding: '5px 12px',
                                                borderRadius: '999px',
                                                border: active
                                                    ? `1px solid ${tab.id === 'all' ? '#FF6B1A' : tab.color}`
                                                    : `1px solid ${isDark ? 'rgba(255, 255, 255, 0.06)' : '#E2E8F0'}`,
                                                background: active
                                                    ? (tab.id === 'all' ? 'rgba(255, 107, 26, 0.12)' : `${tab.color}18`)
                                                    : (isDark ? 'rgba(255, 255, 255, 0.02)' : '#F8FAFC'),
                                                color: active
                                                    ? (tab.id === 'all' ? '#FF6B1A' : tab.color)
                                                    : (isDark ? '#94A3B8' : '#64748B'),
                                                fontSize: '0.78rem',
                                                fontWeight: active ? 750 : 600,
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            <span>{tab.label}</span>
                                            <span
                                                style={{
                                                    padding: '1px 6px',
                                                    borderRadius: '999px',
                                                    fontSize: '0.70rem',
                                                    background: active
                                                        ? (tab.id === 'all' ? '#FF6B1A' : tab.color)
                                                        : (isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0'),
                                                    color: active ? '#FFFFFF' : (isDark ? '#CBD5E1' : '#64748B'),
                                                    fontWeight: 800
                                                }}
                                            >
                                                {tab.count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Mini Search */}
                            <div
                                style={{
                                    position: 'relative',
                                    display: 'flex',
                                    alignItems: 'center',
                                    minWidth: '200px',
                                    flex: '1 1 200px',
                                    maxWidth: '240px'
                                }}
                            >
                                <IoSearch
                                    size={14}
                                    style={{
                                        position: 'absolute',
                                        left: '10px',
                                        color: isDark ? '#64748B' : '#94A3B8',
                                        pointerEvents: 'none'
                                    }}
                                />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search staff or role..."
                                    style={{
                                        width: '100%',
                                        padding: '6px 12px 6px 30px',
                                        borderRadius: '10px',
                                        border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0'}`,
                                        background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#FFFFFF',
                                        color: isDark ? '#FFFFFF' : '#0F172A',
                                        fontSize: '0.80rem',
                                        fontWeight: 600,
                                        outline: 'none',
                                        transition: 'all 0.15s ease'
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* ─── Worker List ─────────────────────────────────────── */}
                    <div
                        style={{
                            flex: 1,
                            overflowY: 'auto',
                            padding: '16px 28px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            maxHeight: '440px'
                        }}
                    >
                        {filteredWorkers.length === 0 ? (
                            <div
                                style={{
                                    padding: '48px 24px',
                                    textAlign: 'center',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '10px',
                                    color: isDark ? '#64748B' : '#94A3B8'
                                }}
                            >
                                <IoPeopleOutline size={40} style={{ opacity: 0.6, color: '#FF6B1A' }} />
                                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: isDark ? '#E2E8F0' : '#334155' }}>
                                    {searchQuery ? 'No staff matching your search' : 'No staff found'}
                                </div>
                                <div style={{ fontSize: '0.80rem' }}>
                                    {searchQuery ? 'Try clearing or changing your search terms' : 'All active staff members will appear here'}
                                </div>
                            </div>
                        ) : (
                            filteredWorkers.map((worker, index) => {
                                const attendance = attendanceData[worker.worker_id] || {};
                                const isProcessing = processingIds.has(worker.worker_id);
                                const status = attendance.status || 'not_marked';
                                const isPresent = status === 'present' || status === 'half_day';
                                const isAbsent = status === 'absent';
                                const isNotMarked = status === 'not_marked';

                                return (
                                    <motion.div
                                        key={worker.worker_id}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.15, delay: index * 0.02 }}
                                        style={{
                                            padding: '12px 16px',
                                            borderRadius: '16px',
                                            background: isDark
                                                ? 'rgba(255, 255, 255, 0.025)'
                                                : '#FFFFFF',
                                            border: isDark
                                                ? '1px solid rgba(255, 255, 255, 0.06)'
                                                : '1px solid #E2E8F0',
                                            boxShadow: isDark
                                                ? '0 2px 6px rgba(0, 0, 0, 0.2)'
                                                : '0 2px 6px rgba(15, 23, 42, 0.03)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '14px',
                                            transition: 'all 0.18s ease'
                                        }}
                                        whileHover={{
                                            backgroundColor: isDark
                                                ? 'rgba(255, 255, 255, 0.045)'
                                                : '#F8FAFC',
                                            borderColor: isDark
                                                ? 'rgba(255, 107, 26, 0.25)'
                                                : 'rgba(255, 107, 26, 0.35)'
                                        }}
                                    >
                                        {/* Left Side: Avatar + Info */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
                                            {/* Profile Avatar Frame matching WorkerTable */}
                                            <div
                                                style={{
                                                    width: '44px',
                                                    height: '44px',
                                                    borderRadius: '14px',
                                                    overflow: 'hidden',
                                                    flexShrink: 0,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    background: 'linear-gradient(135deg, rgba(255,107,26,0.15) 0%, rgba(234,88,12,0.25) 100%)',
                                                    border: '1.5px solid rgba(255,107,26,0.28)',
                                                    boxShadow: '0 4px 10px rgba(255,107,26,0.12)'
                                                }}
                                            >
                                                {worker.photo ? (
                                                    <img
                                                        src={worker.photo}
                                                        alt={worker.name}
                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    />
                                                ) : (
                                                    <span
                                                        style={{
                                                            fontSize: '1.1rem',
                                                            fontWeight: 850,
                                                            color: '#FF6B1A'
                                                        }}
                                                    >
                                                        {(worker.name || '?').charAt(0).toUpperCase()}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Details */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span
                                                        style={{
                                                            fontSize: '0.94rem',
                                                            fontWeight: 750,
                                                            color: isDark ? '#FFFFFF' : '#0F172A',
                                                            letterSpacing: '-0.01em',
                                                            whiteSpace: 'nowrap',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis'
                                                        }}
                                                    >
                                                        {worker.name}
                                                    </span>

                                                    {/* Role Pill */}
                                                    <div
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            padding: '2px 8px',
                                                            background: isDark ? '#1C1D22' : '#F1F5F9',
                                                            border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #CBD5E1',
                                                            borderRadius: '999px',
                                                            fontSize: '0.70rem',
                                                            fontWeight: 700,
                                                            color: isDark ? '#94A3B8' : '#64748B',
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '0.04em',
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                    >
                                                        <IoBriefcase size={11} style={{ color: '#FF6B1A' }} />
                                                        <span>{worker.role}</span>
                                                    </div>
                                                </div>

                                                {/* Time or Status Subtitle */}
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        fontSize: '0.75rem',
                                                        color: isDark ? '#64748B' : '#94A3B8',
                                                        fontWeight: 600
                                                    }}
                                                >
                                                    {attendance.check_in && (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#10B981' }}>
                                                            <IoLogInOutline size={13} />
                                                            In: {attendance.check_in}
                                                        </span>
                                                    )}
                                                    {attendance.check_out && (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#F59E0B' }}>
                                                            <IoLogOutOutline size={13} />
                                                            Out: {attendance.check_out}
                                                        </span>
                                                    )}
                                                    {!attendance.check_in && !attendance.check_out && (
                                                        <span>WKR-{String(worker.worker_id).padStart(4, '0')}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right Side: Status Badge + Action Buttons */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                                            {/* Status Badge */}
                                            <div
                                                style={{
                                                    padding: '4px 10px',
                                                    borderRadius: '999px',
                                                    fontSize: '0.74rem',
                                                    fontWeight: 750,
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    whiteSpace: 'nowrap',
                                                    ...(isPresent
                                                        ? {
                                                            background: 'rgba(16, 185, 129, 0.12)',
                                                            color: '#10B981',
                                                            border: '1px solid rgba(16, 185, 129, 0.25)'
                                                        }
                                                        : isAbsent
                                                        ? {
                                                            background: 'rgba(239, 68, 68, 0.12)',
                                                            color: '#EF4444',
                                                            border: '1px solid rgba(239, 68, 68, 0.25)'
                                                        }
                                                        : {
                                                            background: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F1F5F9',
                                                            color: isDark ? '#94A3B8' : '#64748B',
                                                            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #CBD5E1'
                                                        })
                                                }}
                                            >
                                                {isPresent && <IoCheckmarkCircle size={13} />}
                                                {isAbsent && <IoCloseCircle size={13} />}
                                                {isNotMarked && <IoHourglassOutline size={12} />}
                                                <span>
                                                    {isPresent
                                                        ? (status === 'half_day' ? 'Half Day' : 'Present')
                                                        : (isAbsent ? 'Absent' : 'Pending')}
                                                </span>
                                            </div>

                                            {/* Action Buttons Group */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                {/* Action Button: Check In (if not checked in yet) or Check Out (replaces Check In once checked in) */}
                                                {!isAbsent && !attendance.check_in && (
                                                    <motion.button
                                                        whileHover={{ scale: 1.04 }}
                                                        whileTap={{ scale: 0.95 }}
                                                        onClick={() => handleCheckIn(worker.worker_id)}
                                                        disabled={isProcessing}
                                                        style={{
                                                            padding: '7px 12px',
                                                            borderRadius: '10px',
                                                            border: 'none',
                                                            background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                                                            color: '#FFFFFF',
                                                            fontSize: '0.78rem',
                                                            fontWeight: 750,
                                                            cursor: isProcessing ? 'not-allowed' : 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)',
                                                            opacity: isProcessing ? 0.6 : 1,
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                    >
                                                        <IoLogInOutline size={15} />
                                                        <span>Check In</span>
                                                    </motion.button>
                                                )}

                                                {/* Check-Out Button (Only shown after Check-In, replacing it) */}
                                                {!isAbsent && attendance.check_in && !attendance.check_out && (
                                                    <motion.button
                                                        whileHover={{ scale: 1.04 }}
                                                        whileTap={{ scale: 0.95 }}
                                                        onClick={() => handleCheckOut(worker.worker_id)}
                                                        disabled={isProcessing}
                                                        style={{
                                                            padding: '7px 12px',
                                                            borderRadius: '10px',
                                                            border: 'none',
                                                            background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                                                            color: '#FFFFFF',
                                                            fontSize: '0.78rem',
                                                            fontWeight: 750,
                                                            cursor: isProcessing ? 'not-allowed' : 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            boxShadow: '0 2px 8px rgba(245, 158, 11, 0.25)',
                                                            opacity: isProcessing ? 0.6 : 1,
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                    >
                                                        <IoLogOutOutline size={15} />
                                                        <span>Check Out</span>
                                                    </motion.button>
                                                )}

                                                {/* Mark Absent Button */}
                                                {(isNotMarked || isPresent) && (
                                                    <motion.button
                                                        whileHover={{
                                                            scale: 1.04,
                                                            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.08)'
                                                        }}
                                                        whileTap={{ scale: 0.95 }}
                                                        onClick={() => handleMarkAbsent(worker.worker_id)}
                                                        disabled={isProcessing}
                                                        style={{
                                                            padding: '6px 11px',
                                                            borderRadius: '10px',
                                                            border: isDark
                                                                ? '1.5px solid rgba(239, 68, 68, 0.35)'
                                                                : '1.5px solid rgba(239, 68, 68, 0.25)',
                                                            background: isDark ? 'rgba(239, 68, 68, 0.04)' : 'rgba(239, 68, 68, 0.02)',
                                                            color: '#EF4444',
                                                            fontSize: '0.78rem',
                                                            fontWeight: 750,
                                                            cursor: isProcessing ? 'not-allowed' : 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            opacity: isProcessing ? 0.6 : 1,
                                                            whiteSpace: 'nowrap',
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                    >
                                                        <IoCloseCircleOutline size={14} />
                                                        <span>Absent</span>
                                                    </motion.button>
                                                )}

                                                {/* If already absent, allow changing to Present */}
                                                {isAbsent && (
                                                    <motion.button
                                                        whileHover={{ scale: 1.04 }}
                                                        whileTap={{ scale: 0.95 }}
                                                        onClick={() => handleCheckIn(worker.worker_id)}
                                                        disabled={isProcessing}
                                                        style={{
                                                            padding: '7px 12px',
                                                            borderRadius: '10px',
                                                            border: 'none',
                                                            background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                                                            color: '#FFFFFF',
                                                            fontSize: '0.78rem',
                                                            fontWeight: 750,
                                                            cursor: isProcessing ? 'not-allowed' : 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)',
                                                            opacity: isProcessing ? 0.6 : 1,
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                    >
                                                        <IoCheckmark size={14} />
                                                        <span>Present</span>
                                                    </motion.button>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })
                        )}
                    </div>

                    {/* ─── Footer ─────────────────────────────────────────── */}
                    <div
                        style={{
                            padding: '16px 28px',
                            borderTop: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: isDark ? 'rgba(0, 0, 0, 0.15)' : 'rgba(248, 250, 252, 0.5)'
                        }}
                    >
                        <div
                            style={{
                                fontSize: '0.80rem',
                                color: isDark ? '#64748B' : '#94A3B8',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <span>Attendance records update in real time across the workspace.</span>
                        </div>

                        <motion.button
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={onClose}
                            style={{
                                padding: '8px 22px',
                                borderRadius: '12px',
                                border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #CBD5E1',
                                background: isDark ? 'rgba(255, 255, 255, 0.06)' : '#FFFFFF',
                                color: isDark ? '#FFFFFF' : '#0F172A',
                                fontSize: '0.84rem',
                                fontWeight: 750,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                boxShadow: isDark ? 'none' : '0 1px 3px rgba(0, 0, 0, 0.05)'
                            }}
                        >
                            Done
                        </motion.button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default AttendanceModal;
