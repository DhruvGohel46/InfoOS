import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnimation } from '../../hooks/useAnimation';
import { groupsAPI, handleAPIError } from '../../utils/api';
import '../../styles/Management.css';
import Button from '../ui/Button';

// Color Presets for beautiful group tags
const COLOR_PRESETS = [
    { name: 'Sunset Orange', value: '#F97316' },
    { name: 'Sky Cyan', value: '#06B6D4' },
    { name: 'Mint Emerald', value: '#10B981' },
    { name: 'Lavender Purple', value: '#8B5CF6' },
    { name: 'Rose Pink', value: '#EC4899' },
    { name: 'Amber Gold', value: '#F59E0B' },
    { name: 'Cobalt Blue', value: '#3B82F6' },
    { name: 'Slate Gray', value: '#64748B' }
];

// Icon/Emoji Presets for categories
const ICON_PRESETS = [
    '🍕', '☕', '🍰', '🍔', '🍺', '🍧', '🍿', '🍞', '🍎',
    '🥗', '🍣', '🍷', '🍵', '🛍️', '🏷️', '📦', '✨', '🍽️'
];

const IconPlus = (props) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

const IconEdit = (props) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M12 20H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const IconTrash = (props) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const GroupManagement = () => {
    const { staggerContainer, staggerItem } = useAnimation();

    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingGroup, setEditingGroup] = useState(null);

    // Filter, Search, Pagination
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState('display_order'); // 'display_order' or 'name'
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 6;

    // Bulk selection
    const [selectedGroupIds, setSelectedGroupIds] = useState([]);

    // Delete dialog logic
    const [pendingDelete, setPendingDelete] = useState(null);
    const [deleteOption, setDeleteOption] = useState('remove'); // 'remove' or 'move'
    const [targetGroupId, setTargetGroupId] = useState('');

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        display_order: 0,
        color: COLOR_PRESETS[0].value,
        icon: ICON_PRESETS[0],
        is_active: true
    });

    useEffect(() => {
        loadGroups();
    }, []);

    const loadGroups = async () => {
        try {
            setLoading(true);
            setError('');
            const response = await groupsAPI.getAllGroups(true);
            setGroups(response.data.groups || []);
        } catch (err) {
            const apiError = handleAPIError(err);
            setError(apiError.message);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            display_order: 0,
            color: COLOR_PRESETS[0].value,
            icon: ICON_PRESETS[0],
            is_active: true
        });
        setEditingGroup(null);
        setShowAddForm(false);
    };

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setError('');
            if (editingGroup) {
                await groupsAPI.updateGroup(editingGroup.id, formData);
            } else {
                await groupsAPI.createGroup(formData);
            }
            resetForm();
            loadGroups();
        } catch (err) {
            const apiError = handleAPIError(err);
            setError(apiError.message);
        }
    };

    const handleEdit = (group) => {
        setEditingGroup(group);
        setFormData({
            name: group.name,
            description: group.description || '',
            display_order: group.display_order || 0,
            color: group.color || COLOR_PRESETS[0].value,
            icon: group.icon || ICON_PRESETS[0],
            is_active: group.is_active
        });
        setShowAddForm(true);
    };

    const onRequestDelete = (group) => {
        setPendingDelete(group);
        // Default target group to first option that is not this group
        const otherGroups = groups.filter(g => g.id !== group.id);
        if (otherGroups.length > 0) {
            setTargetGroupId(otherGroups[0].id.toString());
        } else {
            setTargetGroupId('');
        }
    };

    const handleConfirmDelete = async () => {
        if (!pendingDelete) return;
        try {
            if (pendingDelete.categories_count > 0) {
                // Perform deletion with selected action option
                await groupsAPI.deleteGroup(
                    pendingDelete.id,
                    deleteOption,
                    deleteOption === 'move' ? targetGroupId : ''
                );
            } else {
                await groupsAPI.deleteGroup(pendingDelete.id);
            }
            setPendingDelete(null);
            loadGroups();
        } catch (err) {
            const apiError = handleAPIError(err);
            setError(apiError.message);
        }
    };

    const toggleGroupActive = async (group) => {
        try {
            await groupsAPI.updateGroup(group.id, { is_active: !group.is_active });
            loadGroups();
        } catch (err) {
            const apiError = handleAPIError(err);
            setError(apiError.message);
        }
    };

    // Bulk actions
    const handleToggleSelectGroup = (id) => {
        setSelectedGroupIds(prev => 
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleSelectAll = (visibleGroups) => {
        if (selectedGroupIds.length === visibleGroups.length) {
            setSelectedGroupIds([]);
        } else {
            setSelectedGroupIds(visibleGroups.map(g => g.id));
        }
    };

    const handleBulkDelete = async () => {
        if (selectedGroupIds.length === 0) return;
        if (!window.confirm(`Are you sure you want to delete ${selectedGroupIds.length} groups? Any linked categories will lose their group assignment.`)) return;

        try {
            setLoading(true);
            for (const id of selectedGroupIds) {
                await groupsAPI.deleteGroup(id, 'remove');
            }
            setSelectedGroupIds([]);
            loadGroups();
        } catch (err) {
            setError('Bulk delete encountered an issue.');
            loadGroups();
        }
    };

    const handleBulkStatusChange = async (activeState) => {
        if (selectedGroupIds.length === 0) return;
        try {
            setLoading(true);
            for (const id of selectedGroupIds) {
                await groupsAPI.updateGroup(id, { is_active: activeState });
            }
            setSelectedGroupIds([]);
            loadGroups();
        } catch (err) {
            setError('Bulk status update encountered an issue.');
            loadGroups();
        }
    };

    // Filtering, sorting and paging logic
    const filteredGroups = groups
        .filter(g => g.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                     (g.description || '').toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => {
            if (sortBy === 'display_order') {
                return (a.display_order || 0) - (b.display_order || 0);
            }
            return a.name.localeCompare(b.name);
        });

    const pageCount = Math.ceil(filteredGroups.length / pageSize);
    const paginatedGroups = filteredGroups.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    // Other groups list for move options
    const otherGroups = groups.filter(g => g.id !== (pendingDelete?.id || 0));

    return (
        <div className="pmSectionContent">
            {/* Header Actions */}
            <div className="pmHeader" style={{ border: 'none', boxShadow: 'none', background: 'transparent', padding: 'calc(16px * var(--display-zoom)) 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 'calc(12px * var(--display-zoom))' }}>
                    <input
                        className="pmInput"
                        placeholder="🔍 Search groups..."
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                        style={{ width: 'calc(240px * var(--display-zoom))', height: 'calc(38px * var(--display-zoom))' }}
                    />
                    <select
                        className="pmInput"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        style={{ width: 'calc(160px * var(--display-zoom))', height: 'calc(38px * var(--display-zoom))' }}
                    >
                        <option value="display_order">Sort: Order</option>
                        <option value="name">Sort: Name</option>
                    </select>
                </div>

                <div className="pmHeaderActions">
                    <Button
                        variant="primary"
                        onClick={() => setShowAddForm(true)}
                        disabled={showAddForm}
                        icon={<IconPlus />}
                    >
                        Add Group
                    </Button>
                </div>
            </div>

            {/* Bulk Action Controls */}
            {selectedGroupIds.length > 0 && (
                <div className="glass-card" style={{ display: 'flex', padding: '12px 20px', gap: '12px', alignItems: 'center', marginBottom: '16px', background: 'rgba(249, 115, 22, 0.08)', border: '1px solid rgba(249, 115, 22, 0.2)' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--primary-500)' }}>
                        {selectedGroupIds.length} groups selected
                    </span>
                    <button className="pmSecondaryBtn" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => handleBulkStatusChange(true)}>Activate</button>
                    <button className="pmSecondaryBtn" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => handleBulkStatusChange(false)}>Deactivate</button>
                    <button className="pmSecondaryBtn pmActionDanger" style={{ padding: '6px 12px', fontSize: '12px', color: '#ef4444', borderColor: '#ef4444' }} onClick={handleBulkDelete}>Delete</button>
                </div>
            )}

            {/* Add/Edit Form */}
            <AnimatePresence>
                {showAddForm && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="pmFormWrap"
                        style={{ marginBottom: 'calc(24px * var(--display-zoom))' }}
                    >
                        <div className="pmFormHeader">
                            <div className="pmFormTitle">{editingGroup ? 'Edit Item Group' : 'Add New Item Group'}</div>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="pmFormGrid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 'calc(16px * var(--display-zoom))' }}>
                                <div className="pmField">
                                    <div className="pmLabel">Group Name *</div>
                                    <input
                                        className="pmInput"
                                        value={formData.name}
                                        onChange={(e) => handleInputChange('name', e.target.value)}
                                        maxLength={50}
                                        required
                                    />
                                </div>
                                <div className="pmField">
                                    <div className="pmLabel">Display Order</div>
                                    <input
                                        className="pmInput"
                                        type="number"
                                        value={formData.display_order}
                                        onChange={(e) => handleInputChange('display_order', parseInt(e.target.value) || 0)}
                                    />
                                </div>
                                <div className="pmField" style={{ gridColumn: 'span 2' }}>
                                    <div className="pmLabel">Description</div>
                                    <input
                                        className="pmInput"
                                        value={formData.description}
                                        onChange={(e) => handleInputChange('description', e.target.value)}
                                    />
                                </div>

                                <div className="pmField">
                                    <div className="pmLabel">Icon Pick</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '8px', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)' }}>
                                        {ICON_PRESETS.map(emoji => (
                                            <button
                                                key={emoji}
                                                type="button"
                                                onClick={() => handleInputChange('icon', emoji)}
                                                style={{
                                                    fontSize: '20px',
                                                    padding: '4px',
                                                    border: formData.icon === emoji ? '2px solid var(--primary-500)' : '2px solid transparent',
                                                    borderRadius: '4px',
                                                    background: 'transparent',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {emoji}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="pmField">
                                    <div className="pmLabel">Color Theme</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', padding: '8px', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)' }}>
                                        {COLOR_PRESETS.map(preset => (
                                            <button
                                                key={preset.value}
                                                type="button"
                                                onClick={() => handleInputChange('color', preset.value)}
                                                style={{
                                                    height: '24px',
                                                    backgroundColor: preset.value,
                                                    border: formData.color === preset.value ? '2px solid white' : 'none',
                                                    outline: formData.color === preset.value ? '2px solid var(--primary-500)' : 'none',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                    title: preset.name
                                                }}
                                            />
                                        ))}
                                    </div>
                                </div>

                                <div className="pmField" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <input
                                        type="checkbox"
                                        id="is_active_toggle"
                                        checked={formData.is_active}
                                        onChange={(e) => handleInputChange('is_active', e.target.checked)}
                                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                    />
                                    <label htmlFor="is_active_toggle" style={{ fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>Active Group</label>
                                </div>
                            </div>
                            <div className="pmFormActions" style={{ marginTop: '20px' }}>
                                <button type="button" className="pmSecondaryBtn" onClick={resetForm}>Cancel</button>
                                <button type="submit" className="pmPrimaryCta">
                                    {editingGroup ? 'Update Group' : 'Create Group'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Error alerts */}
            {error && <div className="pmError">{error}</div>}

            {/* Grid display */}
            <div className="pmGridSection">
                <div className="pmGridHeader" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div className="pmGridTitle" style={{ fontSize: 'calc(20px * var(--text-scale))' }}>Available Groups</div>
                        <div className="pmGridHint">{loading ? 'Loading...' : `${filteredGroups.length} groups found`}</div>
                    </div>
                    {filteredGroups.length > 0 && (
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <input 
                                type="checkbox" 
                                checked={selectedGroupIds.length === paginatedGroups.length && paginatedGroups.length > 0}
                                onChange={() => handleSelectAll(paginatedGroups)}
                                style={{ transform: 'scale(1.2)', cursor: 'pointer', marginRight: '6px' }}
                            />
                            <span style={{ fontSize: '12px', fontWeight: 600 }}>Select Page</span>
                        </div>
                    )}
                </div>

                {loading ? (
                    <div className="pmEmpty glass-card animate-pulse">Loading groups...</div>
                ) : filteredGroups.length === 0 ? (
                    <div className="pmEmpty glass-card">No item groups found. Customize your menu categories by groups!</div>
                ) : (
                    <motion.div className="pmGrid" variants={staggerContainer} initial="initial" animate="animate">
                        {paginatedGroups.map((group) => (
                            <motion.div key={group.id} variants={staggerItem}>
                                <div
                                    className={`glass-card lift-3d ${!group.is_active ? 'opacity-60' : ''}`}
                                    style={{
                                        padding: 'calc(20px * var(--display-zoom))',
                                        position: 'relative',
                                        overflow: 'hidden',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        height: '100%',
                                        minHeight: 'calc(190px * var(--display-zoom))',
                                        borderTop: `4px solid ${group.color || 'var(--primary-500)'}`
                                    }}
                                >
                                    {/* Selection Checkbox */}
                                    <div style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 10 }}>
                                        <input 
                                            type="checkbox"
                                            checked={selectedGroupIds.includes(group.id)}
                                            onChange={() => handleToggleSelectGroup(group.id)}
                                            style={{ transform: 'scale(1.2)', cursor: 'pointer' }}
                                        />
                                    </div>

                                    <div style={{ position: 'relative', zIndex: 2, flex: 1 }}>
                                        <div className="pmCardTop" style={{ marginBottom: 'calc(8px * var(--display-zoom))' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '24px' }}>{group.icon || '📁'}</span>
                                                <div className="pmName" style={{ fontSize: 'calc(18px * var(--text-scale))', fontWeight: 700 }}>
                                                    {group.name}
                                                </div>
                                            </div>
                                            <div 
                                                className="rounded-pill" 
                                                style={{ 
                                                    padding: '2px 10px', 
                                                    fontSize: 'calc(11px * var(--text-scale))', 
                                                    fontWeight: 700,
                                                    background: group.is_active ? 'rgba(34, 197, 94, 0.12)' : 'rgba(115, 115, 115, 0.12)',
                                                    color: group.is_active ? 'var(--success-500)' : 'var(--text-muted)',
                                                    border: group.is_active ? '1px solid rgba(34, 197, 94, 0.2)' : '1px solid rgba(115, 115, 115, 0.2)',
                                                }}
                                                onClick={() => toggleGroupActive(group)}
                                                className="cursor-pointer"
                                            >
                                                {group.is_active ? 'Active' : 'Inactive'}
                                            </div>
                                        </div>
                                        
                                        <div style={{ 
                                            fontSize: 'calc(13px * var(--text-scale))', 
                                            color: 'var(--text-secondary)',
                                            lineHeight: 1.5,
                                            marginBottom: 'calc(16px * var(--display-zoom))',
                                            opacity: 0.8
                                        }}>
                                            {group.description || 'No description provided.'}
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                                            <span>Display Order: <strong>{group.display_order}</strong></span>
                                            <span><strong>{group.categories_count}</strong> categories</span>
                                        </div>
                                    </div>

                                    <div className="pmActions" style={{ marginTop: 'calc(20px * var(--display-zoom))', position: 'relative', zIndex: 2 }}>
                                        <div className="pmButtonGrid" style={{ gap: '10px' }}>
                                            <button 
                                                className="pmActionBtn" 
                                                onClick={() => handleEdit(group)}
                                                style={{ borderRadius: 'var(--radius-md)', padding: '8px', justifyContent: 'center' }}
                                            >
                                                <IconEdit /> Edit
                                            </button>
                                            <button 
                                                className="pmActionBtn pmActionDanger" 
                                                onClick={() => onRequestDelete(group)}
                                                style={{ borderRadius: 'var(--radius-md)', padding: '8px', justifyContent: 'center' }}
                                            >
                                                <IconTrash /> Remove
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                )}
            </div>

            {/* Pagination Controls */}
            {pageCount > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '24px', alignItems: 'center' }}>
                    <button 
                        className="pmSecondaryBtn" 
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(prev => prev - 1)}
                        style={{ padding: '6px 12px' }}
                    >
                        Prev
                    </button>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>
                        Page {currentPage} of {pageCount}
                    </span>
                    <button 
                        className="pmSecondaryBtn" 
                        disabled={currentPage === pageCount}
                        onClick={() => setCurrentPage(prev => prev + 1)}
                        style={{ padding: '6px 12px' }}
                    >
                        Next
                    </button>
                </div>
            )}

            {/* Deletion Prompt Modal */}
            <AnimatePresence>
                {pendingDelete && (
                    <motion.div className="pmOverlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <motion.div className="pmDialog" style={{ width: 'calc(450px * var(--display-zoom))' }} initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}>
                            <div className="pmDialogTitle">Delete Group?</div>
                            <div className="pmDialogBody">
                                <p>Are you sure you want to delete group <strong>"{pendingDelete.name}"</strong>?</p>
                                
                                {pendingDelete.categories_count > 0 && (
                                    <div className="glass-card" style={{ padding: '16px', marginTop: '12px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                        <p style={{ color: '#ef4444', fontWeight: 700, margin: '0 0 10px 0' }}>
                                            ⚠️ This group contains {pendingDelete.categories_count} active categories.
                                        </p>
                                        <p style={{ fontSize: '13px', margin: '0 0 12px 0' }}>Choose what to do with them:</p>
                                        
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            {otherGroups.length > 0 && (
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                                                    <input 
                                                        type="radio" 
                                                        name="delete_action"
                                                        checked={deleteOption === 'move'}
                                                        onChange={() => setDeleteOption('move')}
                                                    />
                                                    Move categories to another group:
                                                </label>
                                            )}
                                            
                                            {deleteOption === 'move' && otherGroups.length > 0 && (
                                                <select 
                                                    className="pmInput"
                                                    value={targetGroupId}
                                                    onChange={(e) => setTargetGroupId(e.target.value)}
                                                    style={{ marginLeft: '24px', width: '80%', height: 'calc(34px * var(--display-zoom))' }}
                                                >
                                                    {otherGroups.map(g => (
                                                        <option key={g.id} value={g.id}>{g.name}</option>
                                                    ))}
                                                </select>
                                            )}
                                            
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                                                <input 
                                                    type="radio" 
                                                    name="delete_action"
                                                    checked={deleteOption === 'remove'}
                                                    onChange={() => setDeleteOption('remove')}
                                                />
                                                Remove group assignment (leave categories unassigned)
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="pmDialogActions">
                                <button className="pmDialogBtn" onClick={() => setPendingDelete(null)}>Cancel</button>
                                <button className="pmDialogBtn pmDialogBtnPrimary" style={{ background: '#ef4444', borderColor: '#ef4444', color: 'white' }} onClick={handleConfirmDelete}>
                                    Confirm Delete
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default GroupManagement;
