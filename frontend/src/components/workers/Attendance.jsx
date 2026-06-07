import React, { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { workerAPI } from '../../api/workers';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';


const Attendance = () => {
    const { currentTheme, isDark } = useTheme();
    const { showSuccess, showError, showConfirm } = useAlert();
    const [workers, setWorkers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await workerAPI.getWorkers();
            setWorkers(data);
        } catch (error) {
            console.error("Failed to load", error);
        } finally {
            setLoading(false);
        }
    };

    const markIndividual = async (id, status) => {
        try {
            await workerAPI.markAttendance(id, { status, check_in: '09:00' });
            loadData();
        } catch (e) {
            showError('Error marking attendance');
        }
    };

    const markAllPresent = async () => {
        const confirmed = await showConfirm({
            title: 'Mark All Present',
            description: 'Mark ALL active workers as PRESENT for today?',
            confirmLabel: 'Mark All Present',
            cancelLabel: 'Cancel',
            variant: 'primary',
        });
        if (!confirmed) return;
        try {
            await workerAPI.bulkMarkPresent();
            loadData();
            showSuccess('All workers marked Present!');
        } catch (e) {
            showError('Error in bulk action');
        }
    };

    return (
        <div style={{ padding: '24px', height: '100%', overflowY: 'auto' }}>
            <header style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '24px'
            }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', margin: 0, color: currentTheme.colors.text.primary }}>
                        Daily Attendance
                    </h2>
                    <p style={{ margin: '4px 0 0 0', color: currentTheme.colors.text.secondary }}>
                        {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                </div>

                {/* MASTER BUTTON */}
                <Button
                    variant="primary"
                    onClick={markAllPresent}
                    style={{
                        backgroundImage: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', // Green for positive action
                        border: 'none',
                        padding: '12px 24px',
                        fontSize: '1rem',
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)'
                    }}
                >
                    Check-In All Workers (Present)
                </Button>
            </header>

            <Card style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
                        <tr>
                            <th style={{ padding: '16px', textAlign: 'left', color: currentTheme.colors.text.secondary }}>Worker</th>
                            <th style={{ padding: '16px', textAlign: 'left', color: currentTheme.colors.text.secondary }}>Role</th>
                            <th style={{ padding: '16px', textAlign: 'center', color: currentTheme.colors.text.secondary }}>Status Today</th>
                            <th style={{ padding: '16px', textAlign: 'right', color: currentTheme.colors.text.secondary }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {workers.map(worker => (
                            <tr key={worker.worker_id} style={{ borderBottom: `1px solid ${currentTheme.colors.border}` }}>
                                <td style={{ padding: '16px', fontWeight: 600, color: currentTheme.colors.text.primary }}>
                                    {worker.name}
                                </td>
                                <td style={{ padding: '16px', color: currentTheme.colors.text.secondary }}>
                                    {worker.role}
                                </td>
                                <td style={{ padding: '16px', textAlign: 'center' }}>
                                    <span style={{
                                        padding: '4px 12px', borderRadius: '99px',
                                        fontSize: '0.875rem', fontWeight: 600,
                                        background: worker.today_attendance === 'Present' ? 'rgba(16, 185, 129, 0.1)' :
                                            worker.today_attendance === 'Absent' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                                        color: worker.today_attendance === 'Present' ? '#10B981' :
                                            worker.today_attendance === 'Absent' ? '#EF4444' : '#6B7280'
                                    }}>
                                        {worker.today_attendance || 'Not Marked'}
                                    </span>
                                </td>
                                <td style={{ padding: '16px', textAlign: 'right' }}>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                        <Button
                                            size="sm"
                                            onClick={() => markIndividual(worker.worker_id, 'Present')}
                                            style={{ background: '#10B981', border: 'none', color: 'white' }}
                                        >
                                            P
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={() => markIndividual(worker.worker_id, 'Absent')}
                                            style={{ background: '#EF4444', border: 'none', color: 'white' }}
                                        >
                                            A
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>

            {workers.length === 0 && !loading && (
                <div style={{ textAlign: 'center', padding: '40px', color: currentTheme.colors.text.secondary }}>
                    No workers found. Add some workers first.
                </div>
            )}
        </div>
    );
};

export default Attendance;
