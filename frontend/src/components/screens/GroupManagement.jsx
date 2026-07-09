import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnimation } from '../../hooks/useAnimation';
import { groupsAPI, categoriesAPI, handleAPIError } from '../../utils/api';
import '../../styles/Management.css';
import Button from '../ui/Button';
import PageContainer from '../layout/PageContainer';
import {
  IoAddOutline,
  IoCloseOutline,
  IoCreateOutline,
  IoTrashOutline,
  IoSearchOutline,
  IoChevronBackOutline,
  IoCheckmarkCircle,
  IoFolderOpenOutline
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
  const [isShowingAllCategories, setIsShowingAllCategories] = useState(false);
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [showAddCategoryForm, setShowAddCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryFormData, setCategoryFormData] = useState({
    name: '',
    description: '',
    active: true,
    group_id: '',
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
    color: '#64748B', 
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

  const onRequestDelete = (group) => {
    setPendingDelete(group);
    setDeleteOption('remove');
    setTargetGroupId('');
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      setError('');
      await groupsAPI.deleteGroup(pendingDelete.id, deleteOption, targetGroupId);
      setPendingDelete(null);
      loadGroups();
      if (selectedGroup && selectedGroup.id === pendingDelete.id) {
        setSelectedGroup(null);
      }
    } catch (err) {
      const apiError = handleAPIError(err);
      setError(apiError.message);
    }
  };

  const toggleGroupActive = async (group) => {
    try {
      setError('');
      const updatedData = {
        name: group.name,
        description: group.description || '',
        color: group.color || '#64748B',
        icon: group.icon || '',
        is_active: !group.is_active
      };
      await groupsAPI.updateGroup(group.id, updatedData);
      loadGroups();
    } catch (err) {
      const apiError = handleAPIError(err);
      setError(apiError.message);
    }
  };

  // ----- Selection Helpers -----
  const handleToggleSelectGroup = (id) => {
    setSelectedGroupIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (paginatedItems) => {
    const paginatedIds = paginatedItems.map(g => g.id);
    const allSelected = paginatedIds.every(id => selectedGroupIds.includes(id));
    if (allSelected) {
      setSelectedGroupIds(prev => prev.filter(id => !paginatedIds.includes(id)));
    } else {
      setSelectedGroupIds(prev => [...new Set([...prev, ...paginatedIds])]);
    }
  };

  const handleBulkStatusChange = async (is_active) => {
    if (selectedGroupIds.length === 0) return;
    try {
      setError('');
      setLoading(true);
      await Promise.all(selectedGroupIds.map(async (id) => {
        const group = groups.find(g => g.id === id);
        if (group) {
          const updatedData = {
            name: group.name,
            description: group.description || '',
            color: group.color || '#64748B',
            icon: group.icon || '',
            is_active
          };
          await groupsAPI.updateGroup(id, updatedData);
        }
      }));
      setSelectedGroupIds([]);
      loadGroups();
    } catch (err) {
      const apiError = handleAPIError(err);
      setError(apiError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedGroupIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete the ${selectedGroupIds.length} selected groups?`)) return;
    try {
      setError('');
      setLoading(true);
      await Promise.all(selectedGroupIds.map(id => groupsAPI.deleteGroup(id, 'remove', '')));
      setSelectedGroupIds([]);
      loadGroups();
      setSelectedGroup(null);
    } catch (err) {
      const apiError = handleAPIError(err);
      setError(apiError.message);
    } finally {
      setLoading(false);
    }
  };

  // ----- Category Operations -----
  const selectGroup = async (group) => {
    setSelectedGroup(group);
    setIsShowingAllCategories(false);
    setCategorySearchTerm('');
    setShowAddCategoryForm(false);
    setEditingCategory(null);
    await loadCategories(group.id);
  };

  const deselectGroup = () => {
    setSelectedGroup(null);
    setIsShowingAllCategories(false);
    setCategories([]);
  };

  const handleShowAllCategories = async () => {
    setSelectedGroup(null);
    setIsShowingAllCategories(true);
    setCategorySearchTerm('');
    setShowAddCategoryForm(false);
    setEditingCategory(null);
    await loadAllCategories();
  };

  const loadAllCategories = async () => {
    try {
      setLoadingCategories(true);
      const response = await categoriesAPI.getAllCategories(true);
      setCategories(response.data.categories || []);
    } catch (err) {
      const apiError = handleAPIError(err);
      setError(apiError.message);
    } finally {
      setLoadingCategories(false);
    }
  };

  const loadCategories = async (groupId) => {
    try {
      setLoadingCategories(true);
      const response = await groupsAPI.getGroupCategories(groupId);
      setCategories(response.data.categories || []);
    } catch (err) {
      const apiError = handleAPIError(err);
      setError(apiError.message);
    } finally {
      setLoadingCategories(false);
    }
  };

  const handleCategoryInputChange = (field, value) => {
    setCategoryFormData(prev => ({ ...prev, [field]: value }));
  };

  const resetCategoryForm = () => {
    setEditingCategory(null);
    setShowAddCategoryForm(false);
    setCategoryFormData({ name: '', description: '', active: true, group_id: '' });
  };

  const handleCategorySubmit = async (e) => {
    e.preventDefault();
    const gId = selectedGroup ? selectedGroup.id : categoryFormData.group_id;
    if (!gId) {
      setError('Please select a group to assign this category.');
      return;
    }
    try {
      setError('');
      const payload = {
        name: categoryFormData.name,
        description: categoryFormData.description,
        active: categoryFormData.active,
        group_id: gId
      };
      if (editingCategory) {
        await categoriesAPI.updateCategory(editingCategory.id, payload);
      } else {
        await categoriesAPI.createCategory(payload);
      }
      resetCategoryForm();
      if (isShowingAllCategories) {
        await loadAllCategories();
      } else {
        await loadCategories(selectedGroup.id);
      }
      loadGroups();
    } catch (err) {
      const apiError = handleAPIError(err);
      setError(apiError.message);
    }
  };

  const handleCategoryEdit = (cat) => {
    setEditingCategory(cat);
    setCategoryFormData({
      name: cat.name,
      description: cat.description || '',
      active: cat.active,
      group_id: cat.group_id || '',
    });
    setShowAddCategoryForm(true);
  };

  const handleCategoryDelete = async (cat) => {
    if (!window.confirm(`Are you sure you want to delete category "${cat.name}"?`)) return;
    try {
      setError('');
      await categoriesAPI.deleteCategory(cat.id);
      if (isShowingAllCategories) {
        await loadAllCategories();
      } else {
        await loadCategories(selectedGroup.id);
      }
      loadGroups();
    } catch (err) {
      const apiError = handleAPIError(err);
      setError(apiError.message);
    }
  };

  // ----- Filtering / Pagination -----
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const filteredGroups = groups.filter(group => 
    group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (group.description && group.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const pageCount = Math.ceil(filteredGroups.length / itemsPerPage);
  const paginatedGroups = filteredGroups.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const filteredCategories = categories.filter(cat => 
    cat.name.toLowerCase().includes(categorySearchTerm.toLowerCase()) ||
    (cat.description && cat.description.toLowerCase().includes(categorySearchTerm.toLowerCase()))
  );

  const otherGroups = groups.filter(g => pendingDelete && g.id !== pendingDelete.id);

  return (
    <PageContainer>
      {/* Header Section */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        style={{ marginBottom: '32px' }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: '24px',
          paddingBottom: '20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div>
            <h1 style={{
              fontSize: '36px',
              fontWeight: 800,
              color: 'var(--text-primary)',
              margin: '0 0 6px 0',
              letterSpacing: '-0.02em'
            }}>
              Group Management
            </h1>
            <p style={{
              fontSize: '16px',
              color: 'var(--text-secondary)',
              margin: 0,
              opacity: 0.8
            }}>
              Organize menu categories into groups
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div className="gm-search-container">
              <IoSearchOutline className="gm-search-icon" size={18} />
              <input
                className="gm-search-input"
                placeholder="Search groups..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              />
            </div>
            <Button
              variant="secondary"
              onClick={handleShowAllCategories}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                height: '42px',
                padding: '0 20px',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 600,
              }}
            >
              Show All Categories
            </Button>
            <Button
              variant="primary"
              onClick={() => setShowAddForm(true)}
              disabled={showAddForm}
              icon={<IoAddOutline size={18} />}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                height: '42px',
                padding: '0 20px',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 600,
                boxShadow: '0 4px 12px rgba(249, 115, 22, 0.15)'
              }}
            >
              Add Group
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Selection Action Bar */}
      <AnimatePresence>
        {selectedGroupIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-card"
            style={{ 
              display: 'flex', 
              padding: '12px 24px', 
              gap: '16px', 
              alignItems: 'center', 
              marginBottom: '24px', 
              background: 'rgba(249, 115, 22, 0.05)', 
              border: '1px solid rgba(249, 115, 22, 0.2)',
              borderRadius: '12px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: 'auto' }}>
              <IoCheckmarkCircle size={20} color="#F97316" />
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Selection Mode: {selectedGroupIds.length} Selected
              </span>
            </div>
            <button 
              className="pmSecondaryBtn" 
              style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', height: '36px' }} 
              onClick={() => handleBulkStatusChange(true)}
            >
              Activate
            </button>
            <button 
              className="pmSecondaryBtn" 
              style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', height: '36px' }} 
              onClick={() => handleBulkStatusChange(false)}
            >
              Deactivate
            </button>
            <button 
              className="pmSecondaryBtn pmActionDanger" 
              style={{ 
                padding: '8px 16px', 
                fontSize: '13px', 
                color: '#ef4444', 
                borderColor: 'rgba(239, 68, 68, 0.3)', 
                background: 'rgba(239, 68, 68, 0.05)',
                borderRadius: '8px',
                height: '36px' 
              }} 
              onClick={handleBulkDelete}
            >
              Delete
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add/Edit Group Form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass-card"
            style={{ 
              marginBottom: '32px',
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
                  cursor: 'pointer'
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
      {error && <div className="pmError" style={{ marginBottom: '24px' }}>{error}</div>}

      {/* Groups Section */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'baseline',
          marginBottom: '20px',
          paddingBottom: '12px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Groups
            </h2>
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)', opacity: 0.7 }}>
              ({loading ? 'Loading...' : `${filteredGroups.length} Groups`})
            </span>
          </div>
          {filteredGroups.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="checkbox"
                id="select_page_toggle"
                checked={selectedGroupIds.length === paginatedGroups.length && paginatedGroups.length > 0}
                onChange={() => handleSelectAll(paginatedGroups)}
                style={{ cursor: 'pointer', width: '15px', height: '15px' }}
              />
              <label htmlFor="select_page_toggle" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                Select All
              </label>
            </div>
          )}
        </div>

        {loading ? (
          <div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading groups...</div>
        ) : filteredGroups.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '48px 32px',
            border: '2px dashed var(--glass-border)',
            borderRadius: '16px',
            background: 'rgba(255, 255, 255, 0.01)'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🗂</div>
            <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>No Groups Yet</div>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>Create your first group to start organizing categories.</div>
            <Button variant="primary" onClick={() => setShowAddForm(true)} icon={<IoAddOutline size={18} />}>Create Group</Button>
          </div>
        ) : (
          <motion.div 
            style={{ 
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '20px'
            }}
            variants={staggerContainer} 
            initial="initial" 
            animate="animate"
          >
            {paginatedGroups.map((group) => {
              const isSelected = selectedGroup?.id === group.id;
              return (
                <motion.div key={group.id} variants={staggerItem}>
                  <div
                    className={`glass-card ${!group.is_active ? 'opacity-60' : ''}`}
                    style={{
                      padding: '24px',
                      position: 'relative',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      minHeight: '220px',
                      border: isSelected ? '2px solid rgba(249, 115, 22, 0.7)' : '1px solid var(--glass-border)',
                      background: isSelected ? 'rgba(249, 115, 22, 0.03)' : 'var(--glass-card)',
                      boxShadow: isSelected ? '0 4px 16px rgba(249, 115, 22, 0.08)' : 'var(--shadow-card)',
                      cursor: 'pointer',
                      transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                      borderRadius: '16px'
                    }}
                    onClick={() => selectGroup(group)}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.12)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'var(--shadow-card)';
                        e.currentTarget.style.borderColor = 'var(--glass-border)';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                        {group.name}
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedGroupIds.includes(group.id)}
                          onChange={() => handleToggleSelectGroup(group.id)}
                          style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '14px' }}>
                      <span 
                        style={{
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: group.is_active ? 'rgba(34, 197, 94, 0.08)' : 'rgba(115, 115, 115, 0.08)',
                          color: group.is_active ? '#22c55e' : 'var(--text-muted)',
                          border: group.is_active ? '1px solid rgba(34, 197, 94, 0.2)' : '1px solid rgba(115, 115, 115, 0.2)',
                          borderRadius: '6px',
                        }}
                        onClick={(e) => { e.stopPropagation(); toggleGroupActive(group); }}
                      >
                        {group.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '20px', opacity: 0.8, flex: 1 }}>
                      {group.description || 'No description available.'}
                    </div>

                    <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.06)', width: '100%', marginBottom: '14px' }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '13px', color: '#F97316', fontWeight: 700 }}>
                        {group.categories_count || 0} Categories
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
                        <button 
                          onClick={() => handleEdit(group)} 
                          style={{ 
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: '1px solid var(--glass-border)',
                            background: 'transparent',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '12px',
                            fontWeight: 600,
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                            e.currentTarget.style.color = 'var(--text-primary)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--glass-border)';
                            e.currentTarget.style.color = 'var(--text-secondary)';
                          }}
                        >
                          <IoCreateOutline size={13} /> Edit
                        </button>
                        <button 
                          onClick={() => onRequestDelete(group)} 
                          style={{ 
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            background: 'rgba(239, 68, 68, 0.05)',
                            color: '#ef4444',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '12px',
                            fontWeight: 600,
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.05)';
                          }}
                        >
                          <IoTrashOutline size={13} /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Pagination Controls */}
        {pageCount > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '32px', alignItems: 'center' }}>
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

      {/* Category Management Section */}
      <AnimatePresence>
        {(selectedGroup || isShowingAllCategories) && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            style={{ marginTop: '48px' }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              marginBottom: '20px',
              paddingBottom: '16px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  onClick={deselectGroup}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--glass-border)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '13px',
                    fontWeight: 600,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
                >
                  <IoChevronBackOutline size={16} /> Back
                </button>
                <div>
                  <h2 style={{
                    fontSize: '28px',
                    fontWeight: 800,
                    margin: '0 0 4px 0',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    letterSpacing: '-0.01em'
                  }}>
                    <IoFolderOpenOutline size={24} color="#F97316" />
                    {isShowingAllCategories ? 'All Categories' : `Categories in "${selectedGroup?.name}"`}
                  </h2>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)', opacity: 0.7 }}>
                    ({loadingCategories ? 'Loading...' : `${categories.length} Categories`})
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div className="gm-search-container" style={{ minWidth: '280px' }}>
                  <IoSearchOutline className="gm-search-icon" size={18} />
                  <input
                    className="gm-search-input"
                    placeholder="Search categories..."
                    value={categorySearchTerm}
                    onChange={(e) => setCategorySearchTerm(e.target.value)}
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
                    height: '42px',
                    padding: '0 20px',
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: 600,
                    background: '#F97316',
                    borderColor: '#F97316',
                    boxShadow: '0 4px 12px rgba(249, 115, 22, 0.15)'
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
                    background: 'rgba(249, 115, 22, 0.02)'
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
                      {isShowingAllCategories && (
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>Assign to Group *</div>
                          <select
                            value={categoryFormData.group_id || ''}
                            onChange={(e) => handleCategoryInputChange('group_id', e.target.value ? parseInt(e.target.value) : '')}
                            required
                            style={{
                              padding: '12px 16px',
                              borderRadius: '12px',
                              border: '1px solid var(--glass-border)',
                              background: 'var(--bg-secondary)',
                              color: 'var(--text-primary)',
                              fontSize: '14px',
                              width: '100%',
                              outline: 'none'
                            }}
                          >
                            <option value="" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>-- Select Group --</option>
                            {groups.map(g => (
                              <option key={g.id} value={g.id} style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>{g.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
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
              <div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading categories...</div>
            ) : filteredCategories.length === 0 ? (
              <div style={{
                padding: '48px 32px',
                textAlign: 'center',
                border: '2px dashed var(--glass-border)',
                background: 'rgba(255, 255, 255, 0.01)',
                borderRadius: '16px'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📂</div>
                <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>No Categories Yet</div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                  {categorySearchTerm ? 'No categories match your search.' : 'Create your first category inside this group.'}
                </div>
                {!categorySearchTerm && (
                  <Button variant="primary" onClick={() => setShowAddCategoryForm(true)} icon={<IoAddOutline size={18} />}>Create Category</Button>
                )}
              </div>
            ) : (
              <motion.div 
                style={{ 
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '20px'
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
                        padding: '24px',
                        position: 'relative',
                        overflow: 'hidden',
                        border: '1px solid var(--glass-border)',
                        opacity: cat.active ? 1 : 0.6,
                        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                        borderRadius: '16px',
                        minHeight: '200px',
                        display: 'flex',
                        flexDirection: 'column'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.12)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'var(--shadow-card)';
                        e.currentTarget.style.borderColor = 'var(--glass-border)';
                      }}
                    >
                      <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                            {cat.name}
                          </div>
                          <span
                            style={{
                              padding: '4px 10px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: cat.active ? 'rgba(16, 185, 129, 0.08)' : 'rgba(148, 163, 184, 0.08)',
                              color: cat.active ? '#10b981' : '#94a3b8',
                              border: cat.active ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(148, 163, 184, 0.2)',
                              borderRadius: '6px'
                            }}
                          >
                            {cat.active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        {isShowingAllCategories && (
                          <div style={{ fontSize: '12px', fontWeight: 700, color: '#F97316', marginBottom: '12px', background: 'rgba(249, 115, 22, 0.08)', padding: '4px 8px', borderRadius: '6px', alignSelf: 'flex-start' }}>
                            Group: {cat.group_name || 'Unassigned'}
                          </div>
                        )}
                        <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '20px', opacity: 0.8, flex: 1 }}>
                          {cat.description || 'No description available.'}
                        </div>

                        <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.06)', width: '100%', marginBottom: '14px' }} />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontSize: '13px', color: '#10b981', fontWeight: 700 }}>
                            {cat.product_count || 0} Products
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                              onClick={() => handleCategoryEdit(cat)} 
                              style={{ 
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: '1px solid var(--glass-border)',
                                background: 'transparent',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '12px',
                                fontWeight: 600,
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                                e.currentTarget.style.color = 'var(--text-primary)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'var(--glass-border)';
                                e.currentTarget.style.color = 'var(--text-secondary)';
                              }}
                            >
                              <IoCreateOutline size={13} /> Edit
                            </button>
                            <button 
                              onClick={() => handleCategoryDelete(cat)}
                              style={{ 
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                background: 'rgba(239, 68, 68, 0.05)',
                                color: '#ef4444',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '12px',
                                fontWeight: 600,
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.05)';
                              }}
                            >
                              <IoTrashOutline size={13} /> Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

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
