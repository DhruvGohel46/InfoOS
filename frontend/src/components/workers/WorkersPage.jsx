import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { IoAdd, IoSearch, IoTimeOutline } from 'react-icons/io5';
import { useAlert } from '../../context/AlertContext';
import { workerService } from '../../services/workerService';
import Button from '../../components/ui/Button';
import WorkerStats from './WorkerStats';
import WorkerTable from './WorkerTable';
import WorkerEmpty from './WorkerEmpty';
import AddWorkerModal from './AddWorkerModal';
import AttendanceModal from './AttendanceModal';
import '../../styles/Workers.css';

const WorkersPage = () => {
    const { showConfirm, showError } = useAlert();
    const navigate = useNavigate();

    const [stats, setStats] = useState({});
    const [workers, setWorkers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingWorker, setEditingWorker] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showAttendanceModal, setShowAttendanceModal] = useState(false);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [statsData, workersData] = await Promise.all([
                workerService.getStats(),
                workerService.getWorkers()
            ]);
            setStats(statsData || {});
            setWorkers(workersData || []);
        } catch (err) {
            console.error('Failed to load worker data', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAddClick = () => { setEditingWorker(null); setShowAddModal(true); };
    const handleEditClick = (worker) => { setEditingWorker(worker); setShowAddModal(true); };
    const handleViewClick = (worker) => { navigate(`/workers/${worker.worker_id}`); };
    const handleAttendanceClick = () => { setShowAttendanceModal(true); };

    const handleDeleteClick = async (worker) => {
        const confirmed = await showConfirm({
            title: `Delete ${worker.name}?`,
            description: 'This worker will be permanently removed. This action cannot be undone.',
            confirmLabel: 'Delete',
            cancelLabel: 'Cancel',
            variant: 'danger',
        });
        if (confirmed) {
            try {
                await workerService.deleteWorker(worker.worker_id);
                await loadData();
            } catch (err) {
                showError('Failed to delete worker');
            }
        }
    };

    const handleModalSave = async () => { await loadData(); setShowAddModal(false); };

    const filteredWorkers = workers.filter(w =>
        w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (w.phone && w.phone.includes(searchQuery))
    );

    // Skeleton loader
    const SkeletonRows = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
            {[...Array(4)].map((_, i) => (
                <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--spacing-4)',
                    padding: 'var(--spacing-4) var(--spacing-6)',
                    borderRadius: 'var(--radius-2xl)',
                    background: 'color-mix(in srgb, var(--glass-card) 92%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--glass-border) 80%, transparent)',
                    opacity: 1 - (i * 0.15),
                }}>
                    <div style={{
                        width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                        background: 'rgba(255,255,255,0.04)',
                        animation: 'pulse 1.5s ease-in-out infinite',
                    }} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ width: 120 + (i * 20), height: 12, borderRadius: 4, background: 'rgba(255,255,255,0.04)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                        <div style={{ width: 80, height: 10, borderRadius: 4, background: 'rgba(255,255,255,0.03)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                    </div>
                </div>
            ))}
        </div>
    );

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel workers-panel"
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                margin: 'var(--spacing-4)',
                borderRadius: 'var(--radius-3xl)',
                overflow: 'hidden',
                background: 'var(--glass-panel)',
                border: '1px solid var(--glass-border)',
                boxShadow: 'var(--shadow-xl)',
            }}
        >
            {/* ── Header ── */}
            <div className="workers-header" style={{
                padding: 'var(--spacing-8) var(--spacing-8) var(--spacing-6) var(--spacing-8)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
            }}>
                <div>
                    <h2 className="workers-title" style={{
                        fontSize: 'var(--text-3xl)', fontWeight: 700, margin: 0,
                        color: 'var(--text-primary)', letterSpacing: '-0.02em',
                    }}>
                        Workers
                    </h2>
                    <p className="workers-subtitle" style={{
                        margin: 'var(--spacing-1) 0 0 0',
                        color: 'var(--text-secondary)', fontSize: 'var(--text-lg)',
                    }}>
                        Manage your staff, attendance and salary
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-3)', alignItems: 'center' }}>
                    <Button
                        variant="secondary"
                        onClick={handleAttendanceClick}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)',
                            padding: 'var(--spacing-3) var(--spacing-5)',
                            borderRadius: 'var(--radius-xl)',
                            fontSize: 'var(--text-base)', fontWeight: 600,
                            background: 'rgba(59, 130, 246, 0.1)',
                            border: '1px solid rgba(59, 130, 246, 0.2)',
                            color: '#3B82F6',
                        }}
                    >
                        <IoTimeOutline size={18} />
                        Attendance
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleAddClick}
                        className="workers-add-btn"
                        style={{
                            display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)',
                            padding: 'var(--spacing-3) var(--spacing-6)',
                            borderRadius: 'var(--radius-xl)',
                            fontSize: 'var(--text-base)', fontWeight: 600,
                        }}
                    >
                        <IoAdd size={20} /> Add Worker
                    </Button>
                </div>
            </div>

            {/* ── Stats Bar ── */}
            <div style={{ padding: '0 var(--spacing-8) var(--spacing-4) var(--spacing-8)' }}>
                <WorkerStats stats={stats} />
            </div>

            {/* ── Search + Count ── */}
            <div className="workers-controls" style={{
                padding: '0 var(--spacing-8) var(--spacing-6) var(--spacing-8)',
                display: 'flex', gap: 'var(--spacing-4)', alignItems: 'center',
            }}>
                <div className="workers-search">
                    <IoSearch className="workers-search-icon" />
                    <input
                        className="workers-search-input"
                        type="text"
                        placeholder="Search by name, role or phone..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <span style={{
                    fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)',
                    fontWeight: 500, whiteSpace: 'nowrap',
                }}>
                    {filteredWorkers.length} {filteredWorkers.length === 1 ? 'worker' : 'workers'}
                </span>
            </div>

            {/* ── Workers List ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--spacing-8) var(--spacing-8) var(--spacing-8)' }}>
                {loading ? (
                    <SkeletonRows />
                ) : workers.length === 0 ? (
                    <WorkerEmpty onAdd={handleAddClick} />
                ) : filteredWorkers.length === 0 ? (
                    <div style={{
                        textAlign: 'center', color: 'var(--text-tertiary)',
                        padding: 'var(--spacing-12)',
                        background: 'var(--glass-card)',
                        borderRadius: 'var(--radius-2xl)',
                        border: '1px dashed var(--glass-border)',
                    }}>
                        No workers match "{searchQuery}"
                    </div>
                ) : (
                    <WorkerTable
                        workers={filteredWorkers}
                        onView={handleViewClick}
                        onEdit={handleEditClick}
                        onDelete={handleDeleteClick}
                    />
                )}
            </div>

            {/* Add/Edit Modal */}
            <AddWorkerModal
                open={showAddModal}
                onClose={() => setShowAddModal(false)}
                onSaved={handleModalSave}
                initialData={editingWorker}
            />

            {/* Attendance Modal */}
            <AttendanceModal
                isOpen={showAttendanceModal}
                workers={workers}
                onClose={() => setShowAttendanceModal(false)}
                onAttendanceUpdate={() => loadData()}
            />
        </motion.div>
    );
};

export default WorkersPage;
