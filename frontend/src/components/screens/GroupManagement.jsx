import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnimation } from '../../hooks/useAnimation';
import { groupsAPI, categoriesAPI, handleAPIError } from '../../utils/api';
import '../../styles/Management.css';
import Button from '../ui/Button';
import PageContainer from '../layout/PageContainer';
import {
  IoFolderOutline,
  IoAddOutline,
  IoCloseOutline,
  IoCreateOutline,
  IoTrashOutline,
  IoSearchOutline,
  IoChevronBackOutline
} from 'react-icons/io5';

const GroupManagement = () => {
  const { staggerContainer, staggerItem } = useAnimation();

  // Groups state
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);

  // Bulk selection
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);

  // Delete dialog for groups
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteOption, setDeleteOption] = useState('remove'); // 'remove' or 'move'
  const [targetGroupId, setTargetGroupId] = useState('');

  // ----- Category management inside a selected group -----
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [showAddCategoryForm, setShowAddCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryFormData, setCategoryFormData] = useState({
    name: '',
    description: '',
    active: true,
  });

  // ----- Load groups -----
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

  // ----- Group form handling -----
  const resetForm = () => {
    setEditingGroup(null);
    setShowAddForm(false);
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#64748B', // neutral gray, kept for backward compatibility but not displayed
    icon: '',
    is_active: true,
  });

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
      color: group.color || '#64748B',
      icon: group.icon || '',
      is_active: group.is_active,
    });
    setShowAddForm(true);
  };

  // ----- Group selection -----
  const selectGroup = (group) => {
    setSelectedGroup(group);
    loadCategoriesForGroup(group.id);
  };

  const deselectGroup = () => {
    setSelectedGroup(null);
    setCategories([]);
  };

  const loadCategoriesForGroup = async (groupId) => {
    try {
      setLoadingCategories(true);
      const response = await categoriesAPI.getAllCategories(true);
      const all = response.data.categories || [];
      const filtered = all.filter(cat => cat.group_id === groupId);
      setCategories(filtered);
    } catch (err) {
      const apiError = handleAPIError(err);
      setError(apiError.message);
    } finally {
      setLoadingCategories(false);
    }
  };

  // ----- Category form handling -----
  const resetCategoryForm = () => {
    setEditingCategory(null);
    setShowAddCategoryForm(false);
    setCategoryFormData({ name: '', description: '', active: true });
  };

  const handleCategoryInputChange = (field, value) => {
    setCategoryFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCategorySubmit = async (e) => {
    e.preventDefault();
    if (!selectedGroup) return;
    try {
      setError('');
      const payload = {
        ...categoryFormData,
        active: categoryFormData.active,
        group_id: selectedGroup.id,
      };
      if (editingCategory) {
        await categoriesAPI.updateCategory(editingCategory.id, payload);
      } else {
        await categoriesAPI.createCategory(payload);
      }
      resetCategoryForm();
      loadCategoriesForGroup(selectedGroup.id);
    } catch (err) {
      const apiError = handleAPIError(err);
      setError(apiError.message);
    }
  };

  const handleCategoryEdit = (cat) => {
    setEditingCategory(cat);
    setCategoryFormData({ name: cat.name, description: cat.description || '', active: cat.active });
    setShowAddCategoryForm(true);
  };

  const handleCategoryDelete = async (cat) => {
    if (!window.confirm(`Delete category "${cat.name}"?`)) return;
    try {
      await categoriesAPI.deleteCategory(cat.id);
      loadCategoriesForGroup(selectedGroup.id);
    } catch (err) {
      const apiError = handleAPIError(err);
      setError(apiError.message);
    }
  };

  // ----- Bulk actions for groups -----
  const onRequestDelete = (group) => {
    setPendingDelete(group);
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
    if (!window.confirm(`Are you sure you want to delete ${selectedGroupIds.length} groups?`)) return;
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

  // ----- Filtering and pagination -----
  const [searchTerm, setSearchTerm] = useState('');
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 6;

  const filteredGroups = groups
    .filter(g =>
      g.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (g.description || '').toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const pageCount = Math.ceil(filteredGroups.length / pageSize);
  const paginatedGroups = filteredGroups.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const filteredCategories = categories
    .filter(cat =>
      cat.name.toLowerCase().includes(categorySearchTerm.toLowerCase()) ||
      (cat.description || '').toLowerCase().includes(categorySearchTerm.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const otherGroups = groups.filter(g => g.id !== (pendingDelete?.id || 0));

  return (
    <PageContainer>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{ marginBottom: '24px' }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '24px',
          flexWrap: 'wrap'
        }}>
          <div style={{ flex: 1, minWidth: '300px' }}>
            <h1 style={{
              fontSize: '28px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: '0 0 8px 0'
            }}>
              Group Management
            </h1>
            <p style={{
              fontSize: '14px',
              color: 'var(--text-secondary)',
              margin: 0
            }}>
              Organize your menu categories into groups for better organization
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div className="glass-card" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 16px',
              borderRadius: '12px',
              minWidth: '280px'
            }}>
              <IoSearchOutline size={18} color="var(--text-secondary)" />
              <input
                className="pmInput"
                placeholder="Search groups..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  fontSize: '14px'
                }}
              />
            </div>
            <Button
              variant="primary"
              onClick={() => setShowAddForm(true)}
              disabled={showAddForm}
              icon={<IoAddOutline size={18} />}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                padding: '10px 20px',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: 600
              }}
            >
              Add Group
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Bulk Action Controls */}
      {selectedGroupIds.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card"
          style={{ 
            display: 'flex', 
            padding: '12px 20px', 
            gap: '12px', 
            alignItems: 'center', 
            marginBottom: '16px', 
            background: 'rgba(100, 116, 139, 0.08)', 
            border: '1px solid rgba(100, 116, 139, 0.2)',
            borderRadius: '12px'
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {selectedGroupIds.length} groups selected
          </span>
          <button 
            className="pmSecondaryBtn" 
            style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '8px' }} 
            onClick={() => handleBulkStatusChange(true)}
          >
            Activate
          </button>
          <button 
            className="pmSecondaryBtn" 
            style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '8px' }} 
            onClick={() => handleBulkStatusChange(false)}
          >
            Deactivate
          </button>
          <button 
            className="pmSecondaryBtn pmActionDanger" 
            style={{ padding: '6px 12px', fontSize: '12px', color: '#ef4444', borderColor: '#ef4444', borderRadius: '8px' }} 
            onClick={handleBulkDelete}
          >
            Delete
          </button>
        </motion.div>
      )}

      {/* Add/Edit Group Form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass-card"
            style={{ 
              marginBottom: '24px',
              padding: '24px',
              borderRadius: '16px',
              border: '1px solid var(--glass-border)'
            }}
          >
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '20px',
              paddingBottom: '16px',
              borderBottom: '1px solid var(--glass-border)'
            }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {editingGroup ? 'Edit Group' : 'Add New Group'}
              </div>
              <button 
                onClick={resetForm}
                style={{
                  padding: '8px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <IoCloseOutline size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>Group Name *</div>
                  <input 
                    className="pmInput" 
                    value={formData.name} 
                    onChange={(e) => handleInputChange('name', e.target.value)} 
                    maxLength={50} 
                    required 
                    style={{
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '1px solid var(--glass-border)',
                      background: 'var(--bg-secondary)',
                      fontSize: '14px',
                      width: '100%'
                    }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>Description</div>
                  <input 
                    className="pmInput" 
                    value={formData.description} 
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    style={{
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '1px solid var(--glass-border)',
                      background: 'var(--bg-secondary)',
                      fontSize: '14px',
                      width: '100%'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)' }}>
                  <input 
                    type="checkbox" 
                    id="is_active_toggle" 
                    checked={formData.is_active} 
                    onChange={(e) => handleInputChange('is_active', e.target.checked)} 
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }} 
                  />
                  <label htmlFor="is_active_toggle" style={{ fontWeight: 600, fontSize: '14px', cursor: 'pointer', color: 'var(--text-primary)' }}>Active Group</label>
                </div>
              </div>
              <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <Button 
                  type="button" 
                  variant="secondary" 
                  onClick={resetForm}
                  style={{ padding: '10px 24px', borderRadius: '12px' }}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  variant="primary"
                  style={{ padding: '10px 24px', borderRadius: '12px' }}
                >
                  {editingGroup ? 'Update Group' : 'Create Group'}
                </Button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error alerts */}
      {error && <div className="pmError">{error}</div>}

      {/* Groups Section */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '16px'
        }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>
              Groups
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
              {loading ? 'Loading...' : `${filteredGroups.length} groups`}
            </p>
          </div>
          {filteredGroups.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={selectedGroupIds.length === paginatedGroups.length && paginatedGroups.length > 0}
                onChange={() => handleSelectAll(paginatedGroups)}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Select Page</span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>Loading groups...</div>
        ) : filteredGroups.length === 0 ? (
          <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>No groups found. Create your first group to get started!</div>
        ) : (
          <motion.div 
            style={{ 
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '16px'
            }}
            variants={staggerContainer} 
            initial="initial" 
            animate="animate"
          >
            {paginatedGroups.map((group) => (
              <motion.div key={group.id} variants={staggerItem}>
                <div
                  className={`glass-card ${!group.is_active ? 'opacity-60' : ''}`}
                  style={{
                    padding: '20px',
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: '180px',
                    borderTop: selectedGroup?.id === group.id ? '4px solid #F97316' : '4px solid #94a3b8',
                    border: selectedGroup?.id === group.id ? '2px solid rgba(249, 115, 22, 0.3)' : '1px solid var(--glass-border)',
                    boxShadow: selectedGroup?.id === group.id ? '0 8px 24px rgba(249, 115, 22, 0.15)' : 'var(--shadow-card)',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    borderRadius: '16px'
                  }}
                  onClick={() => selectGroup(group)}
                  onMouseEnter={(e) => {
                    if (selectedGroup?.id !== group.id) {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 12px 28px rgba(0, 0, 0, 0.15)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedGroup?.id !== group.id) {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'var(--shadow-card)';
                    }
                  }}
                >
                  {/* Selection Checkbox */}
                  <div style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 10 }} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedGroupIds.includes(group.id)}
                      onChange={() => handleToggleSelectGroup(group.id)}
                      style={{ cursor: 'pointer' }}
                    />
                  </div>

                  {selectedGroup?.id === group.id && (
                    <div style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 10 }}>
                      <div style={{
                        padding: '4px 12px',
                        borderRadius: '20px',
                        background: 'rgba(249, 115, 22, 0.15)',
                        color: '#F97316',
                        fontSize: '11px',
                        fontWeight: 700,
                        border: '1px solid rgba(249, 115, 22, 0.3)'
                      }}>
                        ✓ Selected
                      </div>
                    </div>
                  )}

                  <div style={{ position: 'relative', zIndex: 2, flex: 1 }}>
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>{group.name}</div>
                      <div
                        style={{
                          display: 'inline-block',
                          padding: '4px 12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: group.is_active ? 'rgba(34, 197, 94, 0.12)' : 'rgba(115, 115, 115, 0.12)',
                          color: group.is_active ? 'var(--success-500)' : 'var(--text-muted)',
                          border: group.is_active ? '1px solid rgba(34, 197, 94, 0.2)' : '1px solid rgba(115, 115, 115, 0.2)',
                          borderRadius: '20px',
                          cursor: 'pointer'
                        }}
                        onClick={(e) => { e.stopPropagation(); toggleGroupActive(group); }}
                      >
                        {group.is_active ? 'Active' : 'Inactive'}
                      </div>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '12px', opacity: 0.8 }}>
                      {group.description || 'No description provided.'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--primary-500)', fontWeight: 600, marginTop: 'auto', marginBottom: '16px' }}>
                      {group.categories_count || 0} categories
                    </div>
                    <div style={{ marginTop: 'auto', display: 'flex', gap: '8px' }}>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleEdit(group); }} 
                        style={{ 
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid var(--glass-border)',
                          background: 'var(--bg-secondary)',
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--glass-border)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'var(--bg-secondary)';
                        }}
                      >
                        <IoCreateOutline size={14} /> Edit
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); onRequestDelete(group); }} 
                        style={{ 
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          background: 'rgba(239, 68, 68, 0.1)',
                          color: '#ef4444',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                        }}
                      >
                        <IoTrashOutline size={14} /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Pagination Controls */}
        {pageCount > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '24px', alignItems: 'center' }}>
            <button 
              className="pmSecondaryBtn" 
              disabled={currentPage === 1} 
              onClick={() => setCurrentPage(prev => prev - 1)} 
              style={{ padding: '8px 16px', borderRadius: '8px' }}
            >
              Prev
            </button>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Page {currentPage} of {pageCount}</span>
            <button 
              className="pmSecondaryBtn" 
              disabled={currentPage === pageCount} 
              onClick={() => setCurrentPage(prev => prev + 1)} 
              style={{ padding: '8px 16px', borderRadius: '8px' }}
            >
              Next
            </button>
          </div>
        )}
      </motion.div>

      {/* Category Management Section (visible when a group is selected) */}
      {selectedGroup && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          style={{ marginTop: '24px' }}
        >
          {/* Category Section Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            paddingBottom: '16px',
            borderBottom: '2px solid rgba(249, 115, 22, 0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                onClick={deselectGroup}
                style={{
                  padding: '8px',
                  borderRadius: '8px',
                  background: 'rgba(100, 116, 139, 0.1)',
                  border: '1px solid rgba(100, 116, 139, 0.2)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <IoChevronBackOutline size={20} />
              </button>
              <div>
                <h2 style={{
                  fontSize: '20px',
                  fontWeight: 700,
                  margin: '0 0 4px 0',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <IoFolderOutline size={20} color="#F97316" />
                  Categories in "{selectedGroup.name}"
                </h2>
                <p style={{
                  margin: 0,
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  opacity: 0.8
                }}>
                  {loadingCategories ? 'Loading...' : `${categories.length} categories`}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div className="glass-card" style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 16px',
                borderRadius: '12px',
                minWidth: '280px'
              }}>
                <IoSearchOutline size={18} color="var(--text-secondary)" />
                <input
                  className="pmInput"
                  placeholder="Search categories..."
                  value={categorySearchTerm}
                  onChange={(e) => setCategorySearchTerm(e.target.value)}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    fontSize: '14px'
                  }}
                />
              </div>
              <Button
                variant="primary"
                onClick={() => setShowAddCategoryForm(true)}
                disabled={showAddCategoryForm}
                icon={<IoAddOutline size={18} />}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 600,
                  background: '#F97316',
                  borderColor: '#F97316'
                }}
              >
                Add Category
              </Button>
            </div>
          </div>

          {/* Add/Edit Category Form */}
          <AnimatePresence>
            {showAddCategoryForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="glass-card"
                style={{
                  marginBottom: '24px',
                  padding: '24px',
                  borderRadius: '16px',
                  border: '1px solid rgba(249, 115, 22, 0.3)',
                  background: 'rgba(249, 115, 22, 0.05)'
                }}
              >
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: '20px',
                  paddingBottom: '16px',
                  borderBottom: '1px solid rgba(249, 115, 22, 0.2)'
                }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#F97316' }}>
                    {editingCategory ? 'Edit Category' : 'Add New Category'}
                  </div>
                  <button 
                    onClick={resetCategoryForm}
                    style={{
                      padding: '8px',
                      borderRadius: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <IoCloseOutline size={20} />
                  </button>
                </div>
                <form onSubmit={handleCategorySubmit}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>Category Name *</div>
                      <input 
                        className="pmInput" 
                        value={categoryFormData.name} 
                        onChange={(e) => handleCategoryInputChange('name', e.target.value)} 
                        maxLength={50} 
                        required
                        style={{
                          padding: '12px 16px',
                          borderRadius: '12px',
                          border: '1px solid var(--glass-border)',
                          background: 'var(--bg-secondary)',
                          fontSize: '14px',
                          width: '100%'
                        }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>Description</div>
                      <input 
                        className="pmInput" 
                        value={categoryFormData.description} 
                        onChange={(e) => handleCategoryInputChange('description', e.target.value)}
                        style={{
                          padding: '12px 16px',
                          borderRadius: '12px',
                          border: '1px solid var(--glass-border)',
                          background: 'var(--bg-secondary)',
                          fontSize: '14px',
                          width: '100%'
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)' }}>
                      <input 
                        type="checkbox" 
                        id="cat_active_toggle" 
                        checked={categoryFormData.active} 
                        onChange={(e) => handleCategoryInputChange('active', e.target.checked)} 
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }} 
                      />
                      <label htmlFor="cat_active_toggle" style={{ fontWeight: 600, fontSize: '14px', cursor: 'pointer', color: 'var(--text-primary)' }}>Active Category</label>
                    </div>
                  </div>
                  <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <Button 
                      type="button" 
                      variant="secondary" 
                      onClick={resetCategoryForm}
                      style={{ padding: '10px 24px', borderRadius: '12px' }}
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      variant="primary"
                      style={{ padding: '10px 24px', borderRadius: '12px', background: '#F97316', borderColor: '#F97316' }}
                    >
                      {editingCategory ? 'Update Category' : 'Create Category'}
                    </Button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Category List */}
          {loadingCategories ? (
            <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>Loading categories...</div>
          ) : filteredCategories.length === 0 ? (
            <div className="glass-card" style={{
              padding: '40px',
              textAlign: 'center',
              border: '2px dashed rgba(249, 115, 22, 0.3)',
              background: 'rgba(249, 115, 22, 0.02)',
              borderRadius: '16px'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📂</div>
              <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>No categories yet</div>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                {categorySearchTerm ? 'No categories match your search' : 'Click "Add Category" to create your first category in this group'}
              </div>
            </div>
          ) : (
            <motion.div 
              style={{ 
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '16px'
              }}
              variants={staggerContainer} 
              initial="initial" 
              animate="animate"
            >
              {filteredCategories.map((cat) => (
                <motion.div key={cat.id} variants={staggerItem}>
                  <div
                    className="glass-card"
                    style={{
                      padding: '20px',
                      position: 'relative',
                      overflow: 'hidden',
                      borderTop: `4px solid ${cat.active ? '#10b981' : '#94a3b8'}`,
                      border: cat.active ? '1px solid var(--glass-border)' : '1px solid rgba(148, 163, 184, 0.3)',
                      opacity: cat.active ? 1 : 0.6,
                      transition: 'all 0.3s ease',
                      borderRadius: '16px',
                      minHeight: '180px',
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 12px 28px rgba(0, 0, 0, 0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'var(--shadow-card)';
                    }}
                  >
                    <div style={{ position: 'relative', zIndex: 2, flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{cat.name}</div>
                        <div
                          style={{
                            padding: '4px 12px',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: cat.active ? 'rgba(16, 185, 129, 0.12)' : 'rgba(148, 163, 184, 0.12)',
                            color: cat.active ? '#10b981' : '#94a3b8',
                            border: cat.active ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(148, 163, 184, 0.2)',
                            borderRadius: '20px'
                          }}
                        >
                          {cat.active ? 'Active' : 'Inactive'}
                        </div>
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '12px', opacity: 0.8 }}>
                        {cat.description || 'No description provided.'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--primary-500)', fontWeight: 600, marginBottom: '16px', marginTop: 'auto' }}>
                        {cat.product_count || 0} products
                      </div>
                      <div style={{ marginTop: 'auto', display: 'flex', gap: '8px' }}>
                        <button 
                          onClick={() => handleCategoryEdit(cat)} 
                          style={{ 
                            flex: 1,
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: '1px solid var(--glass-border)',
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--glass-border)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--bg-secondary)';
                          }}
                        >
                          <IoCreateOutline size={14} /> Edit
                        </button>
                        <button 
                          onClick={() => handleCategoryDelete(cat)}
                          style={{ 
                            flex: 1,
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#ef4444',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                          }}
                        >
                          <IoTrashOutline size={14} /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Deletion Prompt Modal for groups */}
      <AnimatePresence>
        {pendingDelete && (
          <motion.div className="pmOverlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="pmDialog" style={{ width: 'calc(450px * var(--display-zoom))' }} initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}>
              <div className="pmDialogTitle">Delete Group?</div>
              <div className="pmDialogBody">
                <p>Are you sure you want to delete group <strong>"{pendingDelete.name}"</strong>?</p>
                {pendingDelete.categories_count > 0 && (
                  <div className="glass-card" style={{ padding: '16px', marginTop: '12px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    <p style={{ color: '#ef4444', fontWeight: 700, margin: '0 0 10px 0' }}>⚠️ This group contains {pendingDelete.categories_count} active categories.</p>
                    <p style={{ fontSize: '13px', margin: '0 0 12px 0' }}>Choose what to do with them:</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {otherGroups.length > 0 && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                          <input type="radio" name="delete_action" checked={deleteOption === 'move'} onChange={() => setDeleteOption('move')} />
                          Move categories to another group:
                        </label>
                      )}
                      {deleteOption === 'move' && otherGroups.length > 0 && (
                        <select className="pmInput" value={targetGroupId} onChange={(e) => setTargetGroupId(e.target.value)} style={{ marginLeft: '24px', width: '80%', height: 'calc(34px * var(--display-zoom))' }}>
                          {otherGroups.map(g => (<option key={g.id} value={g.id}>{g.name}</option>))}
                        </select>
                      )}
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                        <input type="radio" name="delete_action" checked={deleteOption === 'remove'} onChange={() => setDeleteOption('remove')} />
                        Remove group assignment (leave categories unassigned)
                      </label>
                    </div>
                  </div>
                )}
              </div>
              <div className="pmDialogActions">
                <button className="pmDialogBtn" onClick={() => setPendingDelete(null)}>Cancel</button>
                <button className="pmDialogBtn pmDialogBtnPrimary" style={{ background: '#ef4444', borderColor: '#ef4444', color: 'white' }} onClick={handleConfirmDelete}>Confirm Delete</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageContainer>
  );
};

export default GroupManagement;
