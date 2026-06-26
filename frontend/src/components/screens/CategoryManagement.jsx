import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnimation } from '../../hooks/useAnimation';
import { categoriesAPI, groupsAPI, handleAPIError } from '../../utils/api';
import '../../styles/Management.css';
import Button from '../ui/Button';

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



const CategoryManagement = () => {
    const { staggerContainer, staggerItem } = useAnimation();

    const [categories, setCategories] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);
    const [pendingDelete, setPendingDelete] = useState(null);
    const [deleteStatus, setDeleteStatus] = useState(null); // { used: boolean, reason: string }

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        active: true,
        group_id: ''
    });

    useEffect(() => {
        loadCategories();
        loadGroups();
    }, []);

    const loadCategories = async () => {
        try {
            setLoading(true);
            setError('');
            const response = await categoriesAPI.getAllCategories(true);
            setCategories(response.data.categories || []);
        } catch (err) {
            const apiError = handleAPIError(err);
            setError(apiError.message);
        } finally {
            setLoading(false);
        }
    };

    const loadGroups = async () => {
        try {
            const response = await groupsAPI.getAllGroups(false);
            setGroups(response.data.groups || []);
        } catch (err) {
            console.error('Failed to load groups for categories select:', err);
        }
    };

    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            active: true,
            group_id: ''
        });
        setEditingCategory(null);
        setShowAddForm(false);
    };

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setError('');
            const payload = {
                ...formData,
                group_id: formData.group_id ? parseInt(formData.group_id) : null
            };
            if (editingCategory) {
                await categoriesAPI.updateCategory(editingCategory.id, payload);
            } else {
                await categoriesAPI.createCategory(payload);
            }
            resetForm();
            loadCategories();
        } catch (err) {
            const apiError = handleAPIError(err);
            setError(apiError.message);
        }
    };

    const handleEdit = (category) => {
        setEditingCategory(category);
        setFormData({
            name: category.name,
            description: category.description || '',
            active: category.active,
            group_id: category.group_id ? category.group_id.toString() : ''
        });
        setShowAddForm(true);
    };

    const onRequestDelete = async (category) => {
        try {
            const response = await categoriesAPI.checkUsage(category.id);
            setDeleteStatus(response.data.usage);
            setPendingDelete(category);
        } catch (err) {
            setError('Failed to check category usage');
        }
    };

    const handleConfirmDelete = async () => {
        if (!pendingDelete) return;
        try {
            await categoriesAPI.deleteCategory(pendingDelete.id);
            setPendingDelete(null);
            setDeleteStatus(null);
            loadCategories();
            // Show success message if needed
        } catch (err) {
            const apiError = handleAPIError(err);
            setError(apiError.message);
        }
    };

    return (
        <div className="pmSectionContent">
            {/* Header Actions */}
            <div className="pmHeader" style={{ border: 'none', boxShadow: 'none', background: 'transparent', padding: 'calc(16px * var(--display-zoom)) 0', display: 'flex', justifyContent: 'flex-end' }}>
                <div className="pmHeaderActions">
                    <Button
                        variant="primary"
                        onClick={() => setShowAddForm(true)}
                        disabled={showAddForm}
                        icon={<IconPlus />}
                    >
                        Add Category
                    </Button>
                </div>
            </div>

            {/* Add/Edit Form */}
            <AnimatePresence>
                {showAddForm && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="pmFormWrap"
                    >
                        <div className="pmFormHeader">
                            <div className="pmFormTitle">{editingCategory ? 'Edit Category' : 'Add New Category'}</div>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="pmFormGrid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 'calc(10px * var(--display-zoom))' }}>
                                <div className="pmField">
                                    <div className="pmLabel">Category Name</div>
                                    <input
                                        className="pmInput"
                                        value={formData.name}
                                        onChange={(e) => handleInputChange('name', e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="pmField">
                                    <div className="pmLabel">Description</div>
                                    <input
                                        className="pmInput"
                                        value={formData.description}
                                        onChange={(e) => handleInputChange('description', e.target.value)}
                                    />
                                </div>
                                <div className="pmField">
                                    <div className="pmLabel">Item Group</div>
                                    <select
                                        className="pmInput"
                                        value={formData.group_id}
                                        onChange={(e) => handleInputChange('group_id', e.target.value)}
                                    >
                                        <option value="">▼ Select Group (Optional)</option>
                                        {groups.map(g => (
                                            <option key={g.id} value={g.id}>
                                                {g.icon || '📁'} {g.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="pmFormActions">
                                <button type="button" className="pmSecondaryBtn" onClick={resetForm}>Cancel</button>
                                <button type="submit" className="pmPrimaryCta">
                                    {editingCategory ? 'Update Category' : 'Create Category'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Error */}
            {error && <div className="pmError">{error}</div>}

            {/* Categories Grid */}
            <div className="pmGridSection">
                <div className="pmGridHeader">
                    <div className="pmGridTitle" style={{ fontSize: 'calc(20px * var(--text-scale))' }}>Available Categories</div>
                    <div className="pmGridHint">{loading ? 'Loading...' : `${categories.length} categories`}</div>
                </div>

                {loading ? (
                    <div className="pmEmpty glass-card animate-pulse">Loading categories...</div>
                ) : categories.length === 0 ? (
                    <div className="pmEmpty glass-card">No categories found. Add your first category!</div>
                ) : (
                    <motion.div className="pmGrid" variants={staggerContainer} initial="initial" animate="animate">
                        {categories.map((cat) => (
                            <motion.div key={cat.id} variants={staggerItem}>
                                <div
                                    className={`glass-card lift-3d ${!cat.active ? 'opacity-60' : ''}`}
                                    style={{
                                        padding: 'calc(20px * var(--display-zoom))',
                                        position: 'relative',
                                        overflow: 'hidden',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        height: '100%',
                                        minHeight: 'calc(180px * var(--display-zoom))'
                                    }}
                                >
                                    <div style={{ position: 'relative', zIndex: 2, flex: 1 }}>
                                        <div className="pmCardTop" style={{ marginBottom: 'calc(12px * var(--display-zoom))' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <div className="pmName" style={{ fontSize: 'calc(18px * var(--text-scale))', fontWeight: 700 }}>{cat.name}</div>
                                                {cat.group_name && (
                                                    <span style={{ 
                                                        fontSize: 'calc(12px * var(--text-scale))', 
                                                        color: 'var(--primary-500)', 
                                                        fontWeight: 600 
                                                    }}>
                                                        📁 {cat.group_name}
                                                    </span>
                                                )}
                                            </div>
                                            <div 
                                                className="rounded-pill" 
                                                style={{ 
                                                    padding: '2px 10px', 
                                                    fontSize: 'calc(11px * var(--text-scale))', 
                                                    fontWeight: 700,
                                                    background: cat.active ? 'rgba(34, 197, 94, 0.12)' : 'rgba(115, 115, 115, 0.12)',
                                                    color: cat.active ? 'var(--success-500)' : 'var(--text-muted)',
                                                    border: cat.active ? '1px solid rgba(34, 197, 94, 0.2)' : '1px solid rgba(115, 115, 115, 0.2)',
                                                    boxShadow: cat.active ? '0 0 10px rgba(34, 197, 94, 0.1)' : 'none'
                                                }}
                                            >
                                                {cat.active ? 'Active' : 'Inactive'}
                                            </div>
                                        </div>
                                        
                                        <div style={{ 
                                            fontSize: 'calc(13px * var(--text-scale))', 
                                            color: 'var(--text-secondary)',
                                            lineHeight: 1.5,
                                            marginBottom: 'calc(16px * var(--display-zoom))',
                                            opacity: 0.8
                                        }}>
                                            {cat.description || 'No description provided for this category.'}
                                        </div>
                                        
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '8px',
                                            fontSize: 'calc(12px * var(--text-scale))',
                                            color: 'var(--text-muted)',
                                            fontWeight: 500
                                        }}>
                                            <div style={{ 
                                                width: '8px', 
                                                height: '8px', 
                                                borderRadius: '50%', 
                                                background: cat.active ? 'var(--success-500)' : 'var(--text-muted)',
                                                boxShadow: cat.active ? '0 0 8px var(--success-500)' : 'none'
                                            }} />
                                            {cat.product_count} linked products
                                        </div>
                                    </div>

                                    <div className="pmActions" style={{ marginTop: 'calc(20px * var(--display-zoom))', position: 'relative', zIndex: 2 }}>
                                        <div className="pmButtonGrid" style={{ gap: '10px' }}>
                                            <button 
                                                className="pmActionBtn" 
                                                onClick={() => handleEdit(cat)}
                                                style={{ borderRadius: 'var(--radius-md)', padding: '8px', justifyContent: 'center' }}
                                            >
                                                <IconEdit /> Edit
                                            </button>
                                            <button 
                                                className="pmActionBtn pmActionDanger" 
                                                onClick={() => onRequestDelete(cat)}
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

            {/* Confirmation Modal */}
            <AnimatePresence>
                {pendingDelete && (
                    <motion.div className="pmOverlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <motion.div className="pmDialog" initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}>
                            <div className="pmDialogTitle">
                                {deleteStatus?.used ? 'Cannot Remove Category' : 'Remove Category?'}
                            </div>
                            <div className="pmDialogBody">
                                {deleteStatus?.used ? (
                                    <div style={{ color: '#ef4444' }}>
                                        <p><strong>"{pendingDelete.name}"</strong> {deleteStatus.reason}.</p>
                                        <p>Per business rules, it will be <strong>deactivated</strong> instead of deleted to protect historical data.</p>
                                    </div>
                                ) : (
                                    <p>Are you sure you want to permanently remove <strong>"{pendingDelete.name}"</strong>? This category is unused.</p>
                                )}
                            </div>
                            <div className="pmDialogActions">
                                <button className="pmDialogBtn" onClick={() => { setPendingDelete(null); setDeleteStatus(null); }}>Cancel</button>
                                <button
                                    className={`pmDialogBtn ${deleteStatus?.used ? 'pmDialogBtnPrimary' : 'pmDialogBtnPrimary'}`}
                                    onClick={handleConfirmDelete}
                                    style={deleteStatus?.used ? { color: '#F59E0B', borderColor: '#F59E0B' } : {}}
                                >
                                    {deleteStatus?.used ? 'Deactivate Instead' : 'Remove Permanently'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default CategoryManagement;
