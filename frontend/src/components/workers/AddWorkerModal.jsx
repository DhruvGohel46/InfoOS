import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IoClose, IoSave, IoPerson, IoCall, IoBriefcase, IoCash, IoCalendarOutline } from 'react-icons/io5';
import Button from '../ui/Button';
import Input from '../ui/Input';
import GlobalSelect from '../ui/GlobalSelect';
import GlobalDatePicker from '../ui/GlobalDatePicker';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { workerService } from '../../services/workerService';
import { getLocalDateString } from '../../utils/api';

// Helper to convert file to base64
const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

// eslint-disable-next-line no-unused-vars
const defaultRoles = [
  { label: 'Owner', value: 'Owner' },
  { label: 'Manager', value: 'Manager' },
  { label: 'Cashier', value: 'Cashier' },
  { label: 'Waiter', value: 'Waiter' },
  { label: 'Chef', value: 'Chef' },
  { label: 'Cleaner', value: 'Cleaner' },
  { label: 'Other', value: 'Other' }
];

const statusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' }
];

const AddWorkerModal = ({ open, onClose, onSaved, initialData = null }) => {
  const { currentTheme, isDark } = useTheme();
  const { showError } = useAlert();
  const { openUnlock } = useAuth();
  const { settings } = useSettings();
  const isWorkerMode = settings?.salary_date_mode === 'WORKER';

  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [workerTypes, setWorkerTypes] = useState([]);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    role: '',
    description: '',
    worker_type_id: '',
    salary: '',
    salary_day: '',
    join_date: getLocalDateString(),
    status: 'active',
    photo: null
  });

  useEffect(() => {
    if (open) {
      if (initialData) {
        setForm({
          name: initialData.name || '',
          phone: initialData.phone || '',
          role: initialData.role || '',
          description: initialData.description || '',
          worker_type_id: initialData.worker_type_id || '',
          salary: initialData.salary !== undefined && initialData.salary !== null ? initialData.salary : '',
          salary_day: initialData.salary_day !== undefined && initialData.salary_day !== null ? initialData.salary_day : '',
          join_date: initialData.join_date ? initialData.join_date.split('T')[0] : (initialData.joinDate ? initialData.joinDate.split('T')[0] : getLocalDateString()),
          status: initialData.status || 'active',
          photo: initialData.photo || null
        });
        setPhotoPreview(initialData.photo);
      } else {
        setForm({
          name: '',
          phone: '',
          role: '',
          description: '',
          worker_type_id: '',
          salary: '',
          salary_day: '',
          join_date: getLocalDateString(),
          status: 'active',
          photo: null
        });
        setPhotoPreview(null);
      }
      setPhotoFile(null);
    }
  }, [initialData, open]);

  useEffect(() => {
    if (open) {
      const fetchTypes = async () => {
        try {
          const res = await workerService.getWorkerTypes();
          const types = res.worker_types || [];
          setWorkerTypes(types);
          
          if (initialData && !initialData.worker_type_id && initialData.role) {
            const matched = types.find(t => t.name.toLowerCase() === initialData.role.toLowerCase());
            if (matched) {
              setForm(f => ({ ...f, worker_type_id: matched.id }));
            }
          }
        } catch (err) {
          console.error('Failed to fetch worker types:', err);
        }
      };
      fetchTypes();
    }
  }, [open, initialData]);

  const handleFileChange = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) {
      setPhotoFile(f);
      const base64 = await fileToBase64(f);
      setPhotoPreview(base64);
    }
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();

    const selectedType = workerTypes.find(t => t.id === form.worker_type_id);
    const targetRole = selectedType ? selectedType.name : form.role;

    const saveWorkerDetails = async () => {
      setSaving(true);
      try {
        const payload = { ...form };
        
        if (selectedType) {
          payload.role = selectedType.name;
        }

        if (photoFile) {
          payload.photo = await fileToBase64(photoFile);
        }

        // Convert salary to float or set to 0 if empty
        if (payload.salary === '') {
          payload.salary = 0.0;
        } else {
          payload.salary = parseFloat(payload.salary);
        }

        if (payload.salary_day !== '' && payload.salary_day !== null && payload.salary_day !== undefined) {
          payload.salary_day = parseInt(payload.salary_day, 10);
        } else {
          payload.salary_day = null;
        }

        if (payload.join_date) {
          payload.join_date = payload.join_date.split('T')[0];
        }

        // Handle null/empty photo to prevent Marshmallow validation issues
        if (payload.photo === null) {
          delete payload.photo;
        }

        if (initialData && initialData.worker_id) {
          await workerService.updateWorker(initialData.worker_id, payload);
        } else {
          await workerService.createWorker(payload);
        }

        if (onSaved) onSaved();
        onClose();
      } catch (err) {
        console.error('Failed to save worker', err);
        showError('Failed to save worker: ' + (err.message || err));
      } finally {
        setSaving(false);
      }
    };

    if (targetRole === 'Owner') {
      openUnlock(() => {
        saveWorkerDetails();
      });
    } else {
      saveWorkerDetails();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            style={{
              width: '100%',
              maxWidth: '540px',
              borderRadius: '24px',
              background: isDark 
                ? 'linear-gradient(135deg, rgba(20, 20, 20, 0.8) 0%, rgba(35, 35, 35, 0.8) 100%)' 
                : 'linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.6) 100%)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: isDark 
                ? '0 25px 60px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255,255,255,0.05)' 
                : '0 25px 60px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255,255,255,0.8)',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
              zIndex: 10,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '90vh'
            }}
          >
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: isDark ? 'rgba(255,255,255,0.01)' : 'rgba(0,0,0,0.01)'
            }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: currentTheme.colors.text.primary }}>
                {initialData ? 'Edit Worker' : 'Add New Worker'}
              </h3>
              <button
                onClick={onClose}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: currentTheme.colors.text.secondary,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px',
                  borderRadius: '4px'
                }}
              >
                <IoClose size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '24px 24px 40px 24px' }}>
              <form id="worker-form" onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Photo Upload */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <div style={{
                    width: '110px',
                    height: '110px',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    background: isDark ? 'rgba(255,255,255,0.03)' : '#F1F5F9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `2px dashed ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`,
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)'
                  }}>
                    {photoPreview ? (
                      <img src={photoPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <IoPerson size={40} color={isDark ? '#475569' : '#94A3B8'} />
                    )}
                  </div>
                  <label style={{
                    cursor: 'pointer',
                    color: '#F97316',
                    fontSize: '13px',
                    fontWeight: 600,
                    padding: '6px 16px',
                    borderRadius: '8px',
                    background: 'rgba(249, 115, 22, 0.08)',
                    border: '1px solid rgba(249, 115, 22, 0.15)',
                    transition: 'all 0.2s ease',
                  }}>
                    Upload Photo
                    <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <Input
                    label="Full Name"
                    leftIcon={<IoPerson />}
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    required
                    placeholder="e.g. Rahul Patel"
                  />

                  <Input
                    label="Phone Number"
                    leftIcon={<IoCall />}
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <GlobalSelect
                      label="Worker Type"
                      icon={<IoBriefcase />}
                      options={workerTypes.filter(t => t.is_active || (initialData && t.id === initialData.worker_type_id)).map(t => ({ label: t.name, value: t.id }))}
                      value={form.worker_type_id}
                      onChange={val => setForm({ ...form, worker_type_id: val })}
                      placeholder="Select Worker Type"
                      direction="top"
                    />
                  </div>

                  <GlobalSelect
                    label="Status"
                    options={statusOptions}
                    value={form.status}
                    onChange={val => setForm({ ...form, status: val })}
                    direction="top"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isWorkerMode ? '1fr 1fr 1fr' : '1fr 1fr', gap: '16px' }}>
                  <Input
                    label="Salary (₹)"
                    leftIcon={<IoCash />}
                    type="number"
                    value={form.salary}
                    onChange={e => setForm({ ...form, salary: e.target.value })}
                  />
                  {isWorkerMode && (
                    <div>
                      <GlobalSelect
                        label="Salary Date"
                        icon={<IoCalendarOutline />}
                        options={[
                          {
                            label: `Auto (Start Date: Day ${form.join_date ? new Date(form.join_date).getDate() : 1})`,
                            value: ''
                          },
                          ...Array.from({ length: 31 }, (_, i) => ({
                            label: `Day ${i + 1}`,
                            value: i + 1
                          }))
                        ]}
                        value={form.salary_day || ''}
                        onChange={val => setForm({ ...form, salary_day: val ? parseInt(val, 10) : '' })}
                        placeholder="Select Day (or Auto)"
                        direction="top"
                      />
                    </div>
                  )}
                  <GlobalDatePicker
                    label="Joining Date (Start Date)"
                    value={form.join_date}
                    onChange={(val) => setForm({ ...form, join_date: val })}
                    placeholder="Select Date"
                    direction="top"
                    align="right"
                  />
                </div>

                <div>
                  <Input
                    label="Description / Notes (Optional)"
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    placeholder="e.g. Head chef, morning shift responsibilities"
                  />
                </div>

              </form>
            </div>

            {/* Footer */}
            <div style={{
              padding: '20px 24px',
              borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              background: isDark ? 'rgba(255,255,255,0.01)' : 'rgba(0,0,0,0.01)'
            }}>
              <Button variant="ghost" onClick={onClose} type="button">Cancel</Button>
              <Button
                variant="primary"
                onClick={handleSave}
                loading={saving}
                style={{
                  background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(249, 115, 22, 0.25)',
                  borderRadius: '10px'
                }}
              >
                <IoSave size={18} />
                Save Worker
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default AddWorkerModal;
