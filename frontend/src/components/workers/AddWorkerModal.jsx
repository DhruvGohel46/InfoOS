import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IoClose, IoSave, IoPerson, IoCall, IoBriefcase, IoCash, IoCalendar } from 'react-icons/io5';
import Button from '../ui/Button';
import Input from '../ui/Input';
import GlobalSelect from '../ui/GlobalSelect';
import GlobalDatePicker from '../ui/GlobalDatePicker';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { workerService } from '../../services/workerService';
import { getLocalDateString } from '../../utils/api';

// Helper to convert file to base64
const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const defaultRoles = [
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
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [customRole, setCustomRole] = useState('');

  const [form, setForm] = useState({
    name: '',
    phone: '',
    role: '',
    salary: '',
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
          salary: initialData.salary || '',
          join_date: initialData.join_date || initialData.joinDate || getLocalDateString(),
          status: initialData.status || 'active',
          photo: initialData.photo || null
        });
        setPhotoPreview(initialData.photo);
        setCustomRole(defaultRoles.some(r => r.value === initialData.role) ? '' : initialData.role);
      } else {
        setForm({
          name: '',
          phone: '',
          role: '',
          salary: '',
          join_date: getLocalDateString(),
          status: 'active',
          photo: null
        });
        setPhotoPreview(null);
        setCustomRole('');
      }
      setPhotoFile(null);
    }
  }, [initialData, open]);

  const handleFileChange = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) {
      setPhotoFile(f);
      const base64 = await fileToBase64(f);
      setPhotoPreview(base64);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form };
      if (payload.role === 'Other' && customRole) payload.role = customRole;
      if (photoFile) {
        payload.photo = await fileToBase64(photoFile);
      }

      // Convert salary to float or set to 0 if empty
      if (payload.salary === '') {
        payload.salary = 0.0;
      } else {
        payload.salary = parseFloat(payload.salary);
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
              maxWidth: '500px',
              borderRadius: '16px',
              background: isDark ? currentTheme.colors.surface : '#ffffff',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
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
              borderBottom: `1px solid ${currentTheme.colors.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'
            }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: currentTheme.colors.text.primary }}>
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
            <div style={{ padding: '24px', overflowY: 'auto' }}>
              <form id="worker-form" onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Photo Upload */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <div style={{
                    width: '100px',
                    height: '100px',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    background: isDark ? '#334155' : '#E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `2px solid ${currentTheme.colors.border}`
                  }}>
                    {photoPreview ? (
                      <img src={photoPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <IoPerson size={48} color={isDark ? '#94A3B8' : '#CBD5E1'} />
                    )}
                  </div>
                  <label style={{
                    cursor: 'pointer',
                    color: '#F97316',
                    fontSize: '14px',
                    fontWeight: 500,
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: 'rgba(249, 115, 22, 0.1)'
                  }}>
                    Upload Photo
                    <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
                  </label>
                </div>

                <Input
                  label="Full Name"
                  icon={<IoPerson />}
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="e.g. Rahul Patel"
                />

                <Input
                  label="Phone Number"
                  icon={<IoCall />}
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                />

                <div>
                  <GlobalSelect
                    label="Role"
                    icon={<IoBriefcase />}
                    options={defaultRoles}
                    value={form.role}
                    onChange={val => setForm({ ...form, role: val })}
                    placeholder="Select Role"
                  />
                  {form.role === 'Other' && (
                    <Input
                      placeholder="Specify Role"
                      value={customRole}
                      onChange={e => setCustomRole(e.target.value)}
                      style={{ marginTop: '8px' }}
                    />
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <Input
                    label="Salary (₹)"
                    icon={<IoCash />}
                    type="number"
                    value={form.salary}
                    onChange={e => setForm({ ...form, salary: e.target.value })}
                  />
                  <GlobalDatePicker
                    label="Joining Date"
                    value={form.join_date}
                    onChange={(val) => setForm({ ...form, join_date: val })}
                    placeholder="Select Date"
                  />
                </div>

                <GlobalSelect
                  label="Status"
                  options={statusOptions}
                  value={form.status}
                  onChange={val => setForm({ ...form, status: val })}
                />

              </form>
            </div>

            {/* Footer */}
            <div style={{
              padding: '20px 24px',
              borderTop: `1px solid ${currentTheme.colors.border}`,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'
            }}>
              <Button variant="ghost" onClick={onClose} type="button">Cancel</Button>
              <Button
                variant="primary"
                onClick={handleSave} // Trigger form submit via ref or direct handler
                loading={saving}
                style={{
                  background: '#F97316',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
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
