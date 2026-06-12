import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IoAlarmOutline, IoTrashOutline, IoCalendarOutline, IoSyncOutline } from 'react-icons/io5';
import { useReminders } from '../../context/ReminderContext';
import { useAlert } from '../../context/AlertContext';
import PageContainer from '../layout/PageContainer';
import GlobalDatePicker from '../ui/GlobalDatePicker';
import GlobalTimePicker from '../ui/GlobalTimePicker';
import Dropdown from '../ui/Dropdown';
import Button from '../ui/Button';
import '../../styles/Reminder.css';

const Reminders = () => {
    const { reminders, createReminder, deleteReminder, fetchReminders, dismissReminder } = useReminders();
    const { showSuccess, showError, showConfirm } = useAlert();
    
    // Form State
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [time, setTime] = useState('10:00');
    const [repeat, setRepeat] = useState('Once');
    const [filter, setFilter] = useState('all');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Stats Calculation
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Combine date and time
        if (!date || !time) {
            showError("Please select both date and time.");
            return;
        }

        const selectedDateTime = new Date(`${date}T${time}`);
        if (selectedDateTime <= new Date()) {
            showError("Please select a future timestamp.");
            return;
        }

        setIsSubmitting(true);
        try {
            await createReminder({
                title,
                description,
                // Send a local-time string so backend stores it as intended, not shifted to UTC.
                reminder_time: `${date}T${time}`,
                repeat_type: repeat,
                user_id: 'admin'
            });
            
            showSuccess("Reminder scheduled successfully!");
            setTitle('');
            setDescription('');
            setDate('');
            setTime('');
            setRepeat('none');
        } catch (err) {
            showError("Server error. Could not create reminder.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id, title) => {
        const confirmed = await showConfirm({
            title: 'Delete Reminder?',
            description: `Permanently remove "${title}"?`,
            variant: 'danger'
        });
        
        if (confirmed) {
            try {
                await deleteReminder(id);
                fetchReminders();
                showSuccess("Reminder removed.");
            } catch (err) {
                showError("Delete failed.");
            }
        }
    };

    // Filter Logic
    const filteredReminders = reminders.filter(r => {
        if (filter === 'all') return true;
        if (filter === 'today') {
            const today = new Date().toDateString();
            return new Date(r.reminder_time).toDateString() === today;
        }
        if (filter === 'upcoming') return r.status === 'pending';
        if (filter === 'completed') return r.status === 'completed' || r.is_dismissed;
        return true;
    });



    return (
        <PageContainer>
            <div className="remindersHeader">
                <div className="headerTitle">
                    <IoAlarmOutline size={40} color="var(--primary-500)" />
                    <div>
                        <h1>Reminder Hub</h1>
                        <p className="headerSubtitle">Manage business alerts and important tasks with ease</p>
                    </div>
                </div>
                <Button 
                    variant="ghost" 
                    onClick={fetchReminders}
                    className="refreshBtn"
                >
                    <IoSyncOutline className={isSubmitting ? 'spinning' : ''} /> Refresh Sync
                </Button>
            </div>

            {/* ─── ZONE 2: Global Action Bar ────────────────────────────── */}
            <div className="actionBar">
                <form onSubmit={handleSubmit} className="barForm">
                    <div className="barFormMain">
                        <div className="barField title">
                            <input
                                placeholder="What's the task?"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                required
                            />
                        </div>
                        <div className="barField date">
                            <GlobalDatePicker
                                value={date}
                                onChange={(val) => setDate(val)}
                                placeholder="Execution Date"
                                className="barDatePicker"
                            />
                        </div>
                        <div className="barField time">
                            <GlobalTimePicker
                                value={time}
                                onChange={(val) => setTime(val)}
                                placeholder="Execution Time"
                                className="barTimePicker"
                            />
                        </div>
                        <div className="barField repeat">
                            <Dropdown
                                options={[
                                    { label: 'Once', value: 'none' },
                                    { label: 'Daily', value: 'daily' },
                                    { label: 'Weekly', value: 'weekly' },
                                    { label: 'Monthly', value: 'monthly' }
                                ]}
                                value={repeat}
                                onChange={(val) => setRepeat(val)}
                                placeholder="daily"
                                className="barRepeatDropdown"
                                zIndex={100}
                            />
                        </div>
                    </div>
                    <Button 
                        variant="primary" 
                        type="submit" 
                        loading={isSubmitting}
                        className="barSubmitBtn"
                    >
                        SCHEDULE
                    </Button>
                </form>
            </div>

            {/* ─── ZONE 3: Management Queue ─────────────────────────────── */}
            <div className="queueZone">
                <div className="queueHeader">
                    <div className="queueTitle">
                        <IoAlarmOutline /> 
                        <h3>Active Queue</h3>
                    </div>
                    <div className="listFilters">
                        {['all', 'today', 'upcoming', 'completed'].map(f => (
                            <button
                                key={f}
                                className={`filterTab ${filter === f ? 'active' : ''}`}
                                onClick={() => setFilter(f)}
                            >
                                {f.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="longBarQueue">
                    <AnimatePresence mode="popLayout">
                        {filteredReminders.map((rem) => (
                            <motion.div 
                                key={rem.id}
                                layout
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className={`longBarItem ${rem.status}`}
                            >
                                <div className="barStatusIndicator" />
                                <div className="barLabel">
                                    <h4>{rem.title}</h4>
                                    {rem.description ? <p>{rem.description}</p> : null}
                                </div>
                                <div className="barTime">
                                    <div className="barTimeRow">
                                        <IoCalendarOutline />
                                        <span>{new Date(rem.reminder_time).toDateString()}</span>
                                    </div>
                                    <span className="barTimeSep">•</span>
                                    <div className="barTimeRow">
                                        <IoAlarmOutline />
                                        <span>{new Date(rem.reminder_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                </div>
                                <div className="barType">
                                    {rem.repeat_type !== 'none' ? <IoSyncOutline className="spinning" /> : null}
                                    {rem.repeat_type !== 'none' ? <span>{rem.repeat_type}</span> : null}
                                </div>
                                <div className="barActions">
                                    {rem.status === 'pending' && (
                                        <button className="iconAction check" onClick={() => dismissReminder(rem.id)}>
                                            <IoSyncOutline />
                                        </button>
                                    )}
                                    <button className="iconAction delete" onClick={() => handleDelete(rem.id, rem.title)}>
                                        <IoTrashOutline />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {filteredReminders.length === 0 && (
                        <div className="emptyQueueBar">
                            <p>No task entries found for the selected filter.</p>
                        </div>
                    )}
                </div>
            </div>

        </PageContainer>
    );
};

export default Reminders;
