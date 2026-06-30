import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';

import { usePOSData } from '../../context/POSDataContext';
import { useDebounce } from '../../hooks/useDebounce';
import Button from '../../components/ui/Button';
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
    const [statusFilter, setStatusFilter] = useState('all');
    const debouncedSearch = useDebounce(searchQuery, 300);

    const handleWorkerSaved = () => {
        refreshWorkers();
        setShowModal(false);
    };

    const filteredWorkers = useMemo(() => {
        return contextWorkers.filter(w => {
            const matchesSearch =
                w.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                w.role.toLowerCase().includes(debouncedSearch.toLowerCase());
            
            const matchesStatus =
                statusFilter === 'all' ||
                (statusFilter === 'active' && w.status === 'active') ||
                (statusFilter === 'inactive' && w.status === 'inactive');
            
            return matchesSearch && matchesStatus;
        });
    }, [contextWorkers, debouncedSearch, statusFilter]);

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

            {/* Search & Filter */}
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, maxWidth: '400px' }}>
                    <Input
                        placeholder="Search workers..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {['all', 'active', 'inactive'].map((filter) => (
                        <button
                            key={filter}
                            onClick={() => setStatusFilter(filter)}
                            style={{
                                padding: '10px 16px',
                                background: statusFilter === filter ? '#FF7A00' : 'rgba(255,255,255,0.05)',
                                border: statusFilter === filter ? 'none' : '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '12px',
                                color: statusFilter === filter ? '#FFFFFF' : 'rgba(255,255,255,0.7)',
                                fontSize: '14px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 180ms ease-out',
                                textTransform: 'capitalize'
                            }}
                        >
                            {filter}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid */}
            {filteredWorkers.length > 0 ? (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '24px'
                }}>
                    {filteredWorkers.map((worker, index) => (
                        <motion.div
                            key={worker.worker_id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: index * 0.05 }}
                            whileHover={{ y: -4, transition: { duration: 0.2, ease: 'easeOut' } }}
                            onClick={() => navigate(`/workers/${worker.worker_id}`)}
                            style={{
                                cursor: 'pointer',
                                background: isDark ? '#1a1d21' : '#FFFFFF',
                                border: '1px solid var(--border-secondary)',
                                borderRadius: '16px',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                                transition: 'all 180ms ease-out',
                                position: 'relative',
                                overflow: 'hidden'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = '#FF7A00';
                                e.currentTarget.style.boxShadow = '0 8px 24px rgba(255,122,0,0.15)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'var(--border-secondary)';
                                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
                            }}
                        >
                            {/* Overflow Menu */}
                            <div style={{
                                position: 'absolute',
                                top: '12px',
                                right: '12px',
                                padding: '6px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                transition: 'background 180ms ease-out',
                                color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)',
                                zIndex: 10
                            }}
                            onClick={(e) => e.stopPropagation()}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="1" />
                                    <circle cx="12" cy="5" r="1" />
                                    <circle cx="12" cy="19" r="1" />
                                </svg>
                            </div>

                            {/* Header Section */}
                            <div style={{
                                display: 'flex',
                                padding: '20px',
                                gap: '16px',
                                borderBottom: '1px solid var(--border-secondary)'
                            }}>
                                {/* Profile Image - Left 40% */}
                                <div style={{
                                    width: '40%',
                                    height: '100px',
                                    borderRadius: '12px',
                                    overflow: 'hidden',
                                    background: isDark ? 'rgba(255,122,0,0.1)' : 'rgba(255,122,0,0.05)',
                                    flexShrink: 0
                                }}>
                                    {worker.photo ? (
                                        <img 
                                            src={worker.photo} 
                                            alt={worker.name} 
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                        />
                                    ) : (
                                        <div style={{
                                            width: '100%',
                                            height: '100%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '2.5rem',
                                            fontWeight: 700,
                                            color: '#FF7A00'
                                        }}>
                                            {worker.name.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                </div>

                                {/* Worker Info - Right 60% */}
                                <div style={{
                                    width: '60%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px',
                                    justifyContent: 'center'
                                }}>
                                    <h3 style={{
                                        margin: 0,
                                        fontSize: '16px',
                                        fontWeight: 600,
                                        color: isDark ? '#FFFFFF' : '#0F172A',
                                        lineHeight: 1.3
                                    }}>
                                        {worker.name}
                                    </h3>
                                    <div style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        padding: '4px 10px',
                                        background: isDark ? 'rgba(255,122,0,0.15)' : 'rgba(255,122,0,0.1)',
                                        borderRadius: '6px',
                                        fontSize: '12px',
                                        fontWeight: 500,
                                        color: '#FF7A00',
                                        width: 'fit-content'
                                    }}>
                                        {worker.role}
                                    </div>
                                    {worker.phone && (
                                        <div style={{
                                            fontSize: '13px',
                                            color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)'
                                        }}>
                                            {worker.phone}
                                        </div>
                                    )}
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        fontSize: '12px',
                                        color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'
                                    }}>
                                        <div style={{
                                            width: '8px',
                                            height: '8px',
                                            borderRadius: '50%',
                                            background: worker.status === 'active' ? '#10B981' : '#EF4444'
                                        }} />
                                        {worker.status === 'active' ? 'Online' : 'Offline'}
                                        {worker.employee_id && (
                                            <span style={{ marginLeft: '8px', opacity: 0.7 }}>
                                                • ID: {worker.employee_id}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Lower Section - Info Blocks */}
                            <div style={{
                                padding: '16px 20px',
                                display: 'grid',
                                gridTemplateColumns: 'repeat(2, 1fr)',
                                gap: '12px'
                            }}>
                                <div style={{
                                    padding: '12px',
                                    background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                                    borderRadius: '8px'
                                }}>
                                    <div style={{
                                        fontSize: '11px',
                                        color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
                                        marginBottom: '4px',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em'
                                    }}>
                                        Salary
                                    </div>
                                    <div style={{
                                        fontSize: '15px',
                                        fontWeight: 600,
                                        color: isDark ? '#FFFFFF' : '#0F172A'
                                    }}>
                                        {formatCurrency(worker.salary)}/mo
                                    </div>
                                </div>

                                <div style={{
                                    padding: '12px',
                                    background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                                    borderRadius: '8px'
                                }}>
                                    <div style={{
                                        fontSize: '11px',
                                        color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
                                        marginBottom: '4px',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em'
                                    }}>
                                        Advance
                                    </div>
                                    <div style={{
                                        fontSize: '15px',
                                        fontWeight: 600,
                                        color: isDark ? '#FFFFFF' : '#0F172A'
                                    }}>
                                        {worker.advance ? formatCurrency(worker.advance) : '—'}
                                    </div>
                                </div>

                                <div style={{
                                    padding: '12px',
                                    background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                                    borderRadius: '8px'
                                }}>
                                    <div style={{
                                        fontSize: '11px',
                                        color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
                                        marginBottom: '4px',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em'
                                    }}>
                                        Attendance
                                    </div>
                                    <div style={{
                                        fontSize: '15px',
                                        fontWeight: 600,
                                        color: isDark ? '#FFFFFF' : '#0F172A'
                                    }}>
                                        {worker.attendance || '—'}
                                    </div>
                                </div>

                                {worker.joining_date && (
                                    <div style={{
                                        padding: '12px',
                                        background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                                        borderRadius: '8px'
                                    }}>
                                        <div style={{
                                            fontSize: '11px',
                                            color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
                                            marginBottom: '4px',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em'
                                        }}>
                                            Joined
                                        </div>
                                        <div style={{
                                            fontSize: '15px',
                                            fontWeight: 600,
                                            color: isDark ? '#FFFFFF' : '#0F172A'
                                        }}>
                                            {new Date(worker.joining_date).toLocaleDateString()}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </div>
            ) : (
                /* Empty State */
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '80px 20px',
                    background: isDark ? 'rgba(255,255,255,0.01)' : 'rgba(0,0,0,0.02)',
                    border: '1px dashed rgba(255,255,255,0.08)',
                    borderRadius: '20px'
                }}>
                    <div style={{
                        fontSize: '4rem',
                        marginBottom: '20px',
                        opacity: 0.5
                    }}>
                        👥
                    </div>
                    <h3 style={{
                        fontSize: '1.2rem',
                        fontWeight: 700,
                        color: currentTheme.colors.text.primary,
                        marginBottom: '8px'
                    }}>
                        No workers found
                    </h3>
                    <p style={{
                        color: currentTheme.colors.text.secondary,
                        marginBottom: '20px',
                        textAlign: 'center',
                        maxWidth: '340px'
                    }}>
                        {searchQuery 
                            ? 'Try adjusting your search terms'
                            : 'Add your first team member to get started'
                        }
                    </p>
                    {!searchQuery && (
                        <Button
                            variant="primary"
                            onClick={() => setShowModal(true)}
                            style={{
                                backgroundImage: 'linear-gradient(135deg, #FF6B00 0%, #FF8800 100%)',
                                border: 'none'
                            }}
                        >
                            Add Worker
                        </Button>
                    )}
                </div>
            )}

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
