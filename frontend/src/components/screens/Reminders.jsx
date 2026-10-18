import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  IoAlarmOutline,
  IoTrashOutline,
  IoCalendarOutline,
  IoSyncOutline,
  IoCheckmarkCircleOutline,
  IoTimeOutline,
  IoAddOutline,
  IoRepeatOutline,
  IoNotificationsOutline
} from 'react-icons/io5';
import { useReminders } from '../../context/ReminderContext';
import { useAlert } from '../../context/AlertContext';
import { useTheme } from '../../context/ThemeContext';
import PageContainer from '../layout/PageContainer';
import GlobalDatePicker from '../ui/GlobalDatePicker';
import GlobalTimePicker from '../ui/GlobalTimePicker';
import Dropdown from '../ui/Dropdown';
import '../../styles/Reminder.css';
import '../../styles/Reminders.css';

const staggerContainer = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.04
    }
  }
};

const staggerItem = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22 } }
};

export default function Reminders() {
  const { reminders, createReminder, deleteReminder, fetchReminders, dismissReminder } = useReminders();
  const { showSuccess, showError, showConfirm } = useAlert();
  const { isDark } = useTheme();

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('10:00');
  const [repeat, setRepeat] = useState('none');
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Metrics
  const metrics = useMemo(() => {
    const todayStr = new Date().toDateString();
    const todayCount = reminders.filter((r) => {
      if (!r.reminder_time) return false;
      return new Date(r.reminder_time).toDateString() === todayStr;
    }).length;

    const pendingCount = reminders.filter((r) => r.status === 'pending' && !r.is_dismissed).length;
    const completedCount = reminders.filter((r) => r.status === 'completed' || r.is_dismissed).length;

    return {
      total: reminders.length,
      today: todayCount,
      pending: pendingCount,
      completed: completedCount
    };
  }, [reminders]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!title.trim()) {
      showError('Please enter a reminder title.');
      return;
    }

    if (!date || !time) {
      showError('Please select both date and time.');
      return;
    }

    const selectedDateTime = new Date(`${date}T${time}`);
    if (selectedDateTime <= new Date()) {
      showError('Please select a future date and time.');
      return;
    }

    setIsSubmitting(true);
    try {
      await createReminder({
        title: title.trim(),
        description: description.trim(),
        reminder_time: `${date}T${time}`,
        repeat_type: repeat,
        user_id: 'admin'
      });

      const formattedRepeat = repeat && repeat !== 'none' ? ` (${repeat})` : '';
      showSuccess(`Reminder "${title}" scheduled for ${date} at ${time}${formattedRepeat}`, {
        title: 'Reminder Scheduled',
        category: 'reminders',
        action_route: '/reminders'
      });

      setTitle('');
      setDescription('');
      setDate(new Date().toISOString().split('T')[0]);
      setTime('10:00');
      setRepeat('none');
    } catch (err) {
      showError('Server error. Could not create reminder.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchReminders();
      showSuccess('Reminders synchronized');
    } catch (err) {
      showError('Failed to refresh reminders');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDelete = async (id, reminderTitle) => {
    const confirmed = await showConfirm({
      title: 'Delete Reminder?',
      description: `Permanently remove "${reminderTitle}"?`,
      variant: 'danger'
    });

    if (confirmed) {
      try {
        await deleteReminder(id);
        fetchReminders();
        showSuccess(`Reminder "${reminderTitle}" was removed`, {
          title: 'Reminder Deleted',
          category: 'reminders',
          action_route: '/reminders'
        });
      } catch (err) {
        showError(`Delete failed for "${reminderTitle}"`);
      }
    }
  };

  const handleDismiss = async (id) => {
    try {
      await dismissReminder(id);
      fetchReminders();
      showSuccess('Reminder marked as completed');
    } catch (err) {
      showError('Failed to complete reminder');
    }
  };

  // Filter Logic
  const filteredReminders = useMemo(() => {
    return reminders
      .filter((r) => {
        const matchesSearch =
          r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (r.description && r.description.toLowerCase().includes(searchQuery.toLowerCase()));

        if (!matchesSearch) return false;

        if (filter === 'all') return true;
        if (filter === 'today') {
          const today = new Date().toDateString();
          return new Date(r.reminder_time).toDateString() === today;
        }
        if (filter === 'upcoming') return r.status === 'pending' && !r.is_dismissed;
        if (filter === 'completed') return r.status === 'completed' || r.is_dismissed;
        return true;
      })
      .sort((a, b) => new Date(a.reminder_time) - new Date(b.reminder_time));
  }, [reminders, filter, searchQuery]);

  const filterTabs = [
    { key: 'all', label: 'All Tasks', count: metrics.total },
    { key: 'today', label: 'Due Today', count: metrics.today },
    { key: 'upcoming', label: 'Upcoming', count: metrics.pending },
    { key: 'completed', label: 'Completed', count: metrics.completed }
  ];

  return (
    <PageContainer>
      <div className="reminders-page-wrap">
        {/* ─── Unified Header Card (24px Curve, Black-Grey) ─── */}
        <div
          style={{
            padding: '18px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: isDark ? 'linear-gradient(165deg, #18191D 0%, #111215 100%)' : '#FFFFFF',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0',
            borderRadius: '24px',
            boxShadow: isDark
              ? '0 10px 30px -8px rgba(0, 0, 0, 0.5)'
              : '0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 0 1px 1px rgba(0, 0, 0, 0.02)',
            flexWrap: 'wrap',
            gap: '16px'
          }}
        >
          <div>
            <h1
              style={{
                fontSize: '1.65rem',
                fontWeight: '900',
                margin: 0,
                color: isDark ? '#FFFFFF' : '#0F172A',
                letterSpacing: '-0.02em',
                lineHeight: 1.2
              }}
            >
              Reminder Hub
            </h1>
            <p
              style={{
                margin: '4px 0 0 0',
                color: isDark ? '#94A3B8' : '#64748B',
                fontSize: '0.88rem',
                fontWeight: 500
              }}
            >
              Schedule operational alerts, staff task reminders, and periodic check-ins
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh and sync reminders"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                height: '40px',
                padding: '0 16px',
                borderRadius: '12px',
                fontSize: '0.84rem',
                fontWeight: '700',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1',
                background: isDark ? '#16171B' : '#FFFFFF',
                color: isDark ? '#FFFFFF' : '#0F172A',
                cursor: isRefreshing ? 'not-allowed' : 'pointer',
                transition: 'all 0.18s ease',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            >
              <IoSyncOutline className={isRefreshing ? 'spinner' : ''} size={16} /> Sync
            </button>
          </div>
        </div>



        {/* ─── Schedule Action Card (24px Curve, Modern Horizontal Form) ─── */}
        <div
          style={{
            padding: '20px 24px',
            background: isDark ? 'linear-gradient(165deg, #18191D 0%, #111215 100%)' : '#FFFFFF',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0',
            borderRadius: '24px',
            boxShadow: isDark
              ? '0 10px 30px -8px rgba(0, 0, 0, 0.5)'
              : '0 4px 20px -2px rgba(15, 23, 42, 0.05)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <IoAlarmOutline size={18} style={{ color: '#FF6B1A' }} />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: isDark ? '#FFFFFF' : '#0F172A' }}>
              Schedule New Reminder
            </h3>
          </div>

          <form onSubmit={handleSubmit}>
            <div
              className="schedule-form-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)',
                gap: '14px',
                alignItems: 'stretch'
              }}
            >
              {/* Left Side: Text Fields */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'space-between' }}>
                <input
                  placeholder="What's the reminder or task? (e.g. Check Inventory, Pay Supplier, Restock Buns)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    height: '44px',
                    padding: '0 14px',
                    borderRadius: '12px',
                    background: isDark ? '#16171B' : '#F8FAFC',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1',
                    color: isDark ? '#FFFFFF' : '#0F172A',
                    fontSize: '0.90rem',
                    fontWeight: 600,
                    outline: 'none',
                    transition: 'all 0.18s ease'
                  }}
                />

                <input
                  placeholder="Optional details or note..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{
                    width: '100%',
                    height: '44px',
                    padding: '0 14px',
                    borderRadius: '12px',
                    background: isDark ? '#16171B' : '#F8FAFC',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1',
                    color: isDark ? '#FFFFFF' : '#0F172A',
                    fontSize: '0.86rem',
                    outline: 'none',
                    transition: 'all 0.18s ease'
                  }}
                />
              </div>

              {/* Right Side: 2x2 Metrics Grid (Date, Time, Repeat, Submit) */}
              <div
                className="schedule-form-2x2"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  alignItems: 'center'
                }}
              >
                {/* Row 1, Col 1: Date */}
                <div>
                  <GlobalDatePicker
                    value={date}
                    onChange={(val) => setDate(val)}
                    placeholder="Select Date"
                  />
                </div>

                {/* Row 1, Col 2: Time */}
                <div>
                  <GlobalTimePicker
                    value={time}
                    onChange={(val) => setTime(val)}
                    placeholder="Select Time"
                  />
                </div>

                {/* Row 2, Col 1: Repeat Dropdown */}
                <div>
                  <Dropdown
                    options={[
                      { label: 'Once (No repeat)', value: 'none' },
                      { label: 'Daily', value: 'daily' },
                      { label: 'Weekly', value: 'weekly' },
                      { label: 'Monthly', value: 'monthly' }
                    ]}
                    value={repeat}
                    onChange={(val) => setRepeat(val)}
                    placeholder="Repeat"
                    zIndex={100}
                  />
                </div>

                {/* Row 2, Col 2: Submit Button */}
                <div>
                  <button
                    type="submit"
                    disabled={isSubmitting || !title.trim()}
                    style={{
                      width: '100%',
                      height: '44px',
                      borderRadius: '12px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #FF6B1A 0%, #EA580C 100%)',
                      color: '#FFFFFF',
                      fontWeight: 800,
                      fontSize: '0.88rem',
                      boxShadow: '0 4px 14px rgba(255, 107, 26, 0.3)',
                      cursor: isSubmitting || !title.trim() ? 'not-allowed' : 'pointer',
                      opacity: isSubmitting || !title.trim() ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.18s ease'
                    }}
                  >
                    <IoAddOutline size={18} />
                    {isSubmitting ? 'Scheduling...' : 'Schedule Reminder'}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* ─── Controls: Search & Queue Filter Tabs ─── */}
        <div
          style={{
            display: 'flex',
            gap: '14px',
            alignItems: 'center',
            flexWrap: 'wrap',
            zIndex: 10
          }}
        >
          {/* Search Bar */}
          <div className="reminders-search" style={{ flex: '1 1 280px' }}>
            <IoAlarmOutline className="reminders-search-icon" size={18} />
            <input
              className="reminders-search-input"
              type="text"
              placeholder="Search reminders by title or note..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                height: '42px',
                borderRadius: '14px',
                background: isDark ? '#16171B' : '#FFFFFF',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1',
                color: isDark ? '#FFFFFF' : '#0F172A',
                fontSize: '0.90rem',
                fontWeight: 600
              }}
            />
          </div>

          {/* Filter Pills */}
          <div
            style={{
              display: 'inline-flex',
              background: isDark ? '#16171B' : '#F1F5F9',
              borderRadius: '14px',
              padding: '3px',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #CBD5E1',
              gap: '3px',
              overflowX: 'auto',
              maxWidth: '100%'
            }}
          >
            {filterTabs.map((tab) => {
              const isActive = filter === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  style={{
                    position: 'relative',
                    padding: '7px 16px',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '0.84rem',
                    fontWeight: '700',
                    background: 'transparent',
                    color: isActive ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B',
                    cursor: 'pointer',
                    transition: 'color 0.18s ease',
                    whiteSpace: 'nowrap',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    flexShrink: 0
                  }}
                >
                  {isActive && (
                    <motion.div
                      layoutId="reminders-filter-active-pill"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #FF6B1A 0%, #EA580C 100%)',
                        boxShadow: '0 2px 8px rgba(255, 107, 26, 0.3)',
                        zIndex: 1
                      }}
                    />
                  )}
                  <span style={{ position: 'relative', zIndex: 2 }}>{tab.label}</span>
                  <span
                    style={{
                      position: 'relative',
                      zIndex: 2,
                      fontSize: '0.72rem',
                      padding: '1px 6px',
                      borderRadius: '999px',
                      background: isActive ? 'rgba(0, 0, 0, 0.25)' : isDark ? '#1F2026' : '#E2E8F0',
                      color: isActive ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B',
                      fontWeight: 800
                    }}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── Active Queue List ─── */}
        <div style={{ flex: 1, paddingBottom: '24px' }}>
          {filteredReminders.length === 0 ? (
            <div
              style={{
                padding: '50px 30px',
                textAlign: 'center',
                background: isDark ? '#16171B' : '#FFFFFF',
                border: isDark ? '2px dashed rgba(255, 255, 255, 0.08)' : '2px dashed #CBD5E1',
                borderRadius: '24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '18px',
                  background: 'rgba(255, 107, 26, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FF6B1A'
                }}
              >
                <IoNotificationsOutline size={26} />
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: isDark ? '#FFFFFF' : '#0F172A' }}>
                No Reminders Found
              </div>
              <p style={{ fontSize: '0.88rem', color: isDark ? '#94A3B8' : '#64748B', margin: 0, maxWidth: '420px' }}>
                {searchQuery || filter !== 'all'
                  ? 'No task reminders matched your search or active filter.'
                  : 'You have no scheduled tasks. Use the form above to schedule your first alert.'}
              </p>
            </div>
          ) : (
            <motion.div
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
            >
              {filteredReminders.map((rem) => {
                const isCompleted = rem.status === 'completed' || rem.is_dismissed;
                const remDate = new Date(rem.reminder_time);

                return (
                  <motion.div
                    key={rem.id}
                    variants={staggerItem}
                    whileHover={{ y: -2 }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 200px 140px 100px',
                      gap: '16px',
                      alignItems: 'center',
                      padding: '16px 24px',
                      background: isDark ? 'linear-gradient(165deg, #18191D 0%, #111215 100%)' : '#FFFFFF',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0',
                      borderRadius: '20px',
                      boxShadow: isDark
                        ? '0 6px 20px -6px rgba(0, 0, 0, 0.4)'
                        : '0 2px 10px rgba(15, 23, 42, 0.04)',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      opacity: isCompleted ? 0.65 : 1
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 107, 26, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0';
                    }}
                  >
                    {/* Title & Description */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                      <div
                        style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '12px',
                          background: isCompleted ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 107, 26, 0.12)',
                          border: isCompleted
                            ? '1px solid rgba(16, 185, 129, 0.25)'
                            : '1px solid rgba(255, 107, 26, 0.25)',
                          color: isCompleted ? '#10B981' : '#FF6B1A',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                        {isCompleted ? <IoCheckmarkCircleOutline size={20} /> : <IoAlarmOutline size={20} />}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span
                          style={{
                            fontSize: '0.98rem',
                            fontWeight: 800,
                            color: isDark ? '#FFFFFF' : '#0F172A',
                            letterSpacing: '-0.01em',
                            textDecoration: isCompleted ? 'line-through' : 'none',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {rem.title}
                        </span>
                        {rem.description && (
                          <span
                            style={{
                              fontSize: '0.80rem',
                              color: isDark ? '#64748B' : '#94A3B8',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              marginTop: '2px'
                            }}
                          >
                            {rem.description}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Date & Time Capsule (Single Line) */}
                    <div>
                      <span
                        style={{
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          padding: '5px 12px',
                          borderRadius: '999px',
                          background: isDark ? '#1C1D22' : '#F1F5F9',
                          border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #CBD5E1',
                          color: isDark ? '#FFFFFF' : '#0F172A',
                          whiteSpace: 'nowrap',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          flexShrink: 0
                        }}
                      >
                        <IoCalendarOutline size={14} style={{ opacity: 0.7 }} />
                        <span>{remDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                        <span style={{ opacity: 0.4 }}>•</span>
                        <IoTimeOutline size={14} style={{ opacity: 0.7 }} />
                        <span>{remDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </span>
                    </div>

                    {/* Repeat Type Badge */}
                    <div>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 10px',
                          borderRadius: '8px',
                          background:
                            rem.repeat_type && rem.repeat_type !== 'none'
                              ? 'rgba(59, 130, 246, 0.12)'
                              : isDark
                              ? '#1C1D22'
                              : '#F8FAFC',
                          border:
                            rem.repeat_type && rem.repeat_type !== 'none'
                              ? '1px solid rgba(59, 130, 246, 0.3)'
                              : isDark
                              ? '1px solid rgba(255, 255, 255, 0.06)'
                              : '1px solid #CBD5E1',
                          color:
                            rem.repeat_type && rem.repeat_type !== 'none'
                              ? '#3B82F6'
                              : isDark
                              ? '#94A3B8'
                              : '#64748B',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          textTransform: 'capitalize',
                          whiteSpace: 'nowrap',
                          flexShrink: 0
                        }}
                      >
                        <IoRepeatOutline size={13} />
                        {rem.repeat_type && rem.repeat_type !== 'none' ? rem.repeat_type : 'Once'}
                      </span>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                      {!isCompleted && (
                        <button
                          type="button"
                          onClick={() => handleDismiss(rem.id)}
                          title="Mark Complete"
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            background: 'rgba(16, 185, 129, 0.1)',
                            color: '#10B981',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(16, 185, 129, 0.25)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)')}
                        >
                          <IoCheckmarkCircleOutline size={16} />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDelete(rem.id, rem.title)}
                        title="Delete Reminder"
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          border: '1px solid rgba(239, 68, 68, 0.25)',
                          background: 'rgba(239, 68, 68, 0.08)',
                          color: '#EF4444',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)')}
                      >
                        <IoTrashOutline size={15} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
