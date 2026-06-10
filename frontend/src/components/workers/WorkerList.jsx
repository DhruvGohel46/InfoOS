import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';

import { usePOSData } from '../../context/POSDataContext';
import { useDebounce } from '../../hooks/useDebounce';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import { formatCurrency } from '../../utils/api';
import { useNavigate } from 'react-router-dom';
import AddWorkerModal from './AddWorkerModal';

const WorkerList = () => {
    const { currentTheme, isDark } = useTheme();
    const navigate = useNavigate();
    const { workers: contextWorkers, refreshWorkers } = usePOSData();
    
    const [showModal, setShowModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearch = useDebounce(searchQuery, 300);

    const handleWorkerSaved = () => {
        refreshWorkers();
        setShowModal(false);
    };

    const filteredWorkers = useMemo(() => {
        return contextWorkers.filter(w =>
            w.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
            w.role.toLowerCase().includes(debouncedSearch.toLowerCase())
        );
    }, [contextWorkers, debouncedSearch]);

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
                        Workers
                    </h2>
                    <p style={{ margin: '4px 0 0 0', color: currentTheme.colors.text.secondary }}>
                        Manage your staff
                    </p>
                </div>
                <Button
                    variant="primary"
                    onClick={() => setShowModal(true)}
                    style={{
                        backgroundImage: 'linear-gradient(135deg, #FF6B00 0%, #FF8800 100%)',
                        border: 'none'
                    }}
                >
                    Add New Worker
                </Button>
            </header>

            {/* Search */}
            <div style={{ marginBottom: '24px', maxWidth: '400px' }}>
                <Input
                    placeholder="Search workers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            {/* Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '20px'
            }}>
                {filteredWorkers.map(worker => (
                    <motion.div
                        key={worker.worker_id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={() => navigate(`/workers/${worker.worker_id}`)}
                        style={{ cursor: 'pointer' }}
                    >
                        <Card style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '16px',
                            padding: '20px',
                            borderLeft: `4px solid ${worker.status === 'active' ? '#10B981' : '#EF4444'}`
                        }}>
                            {/* Avatar or Initials */}
                            <div style={{
                                width: '60px', height: '60px',
                                borderRadius: '50%',
                                background: currentTheme.colors.surface,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '1.5rem', fontWeight: 700,
                                color: '#FF6B00',
                                border: `2px solid ${currentTheme.colors.border}`,
                                overflow: 'hidden'
                            }}>
                                {worker.photo ? (
                                    <img src={worker.photo} alt={worker.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    worker.name.charAt(0).toUpperCase()
                                )}
                            </div>

                            <div style={{ flex: 1 }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', color: currentTheme.colors.text.primary }}>
                                    {worker.name}
                                </h3>
                                <p style={{ margin: '4px 0', color: currentTheme.colors.text.secondary, fontSize: '0.9rem' }}>
                                    {worker.role}
                                </p>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                                    <span style={{
                                        fontSize: '0.85rem',
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        background: isDark ? 'rgba(255, 107, 0, 0.1)' : 'rgba(255, 107, 0, 0.1)',
                                        color: '#FF6B00'
                                    }}>
                                        {formatCurrency(worker.salary)}/mo
                                    </span>
                                </div>
                            </div>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {/* Use Shared AddWorkerModal Component */}
            <AddWorkerModal
                open={showModal}
                onClose={() => setShowModal(false)}
                onSaved={handleWorkerSaved}
            />
        </div>
    );
};

export default WorkerList;
