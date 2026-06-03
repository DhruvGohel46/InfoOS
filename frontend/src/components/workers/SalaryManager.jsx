import React, { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { useSettings } from '../../context/SettingsContext';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Input from '../ui/Input';
import { IoCalendar, IoSave } from 'react-icons/io5';

const SalaryManager = () => {
    const { currentTheme } = useTheme();
    const { showSuccess, showError } = useAlert();
    const { settings, updateSettings, loading } = useSettings();
    const [salaryDate, setSalaryDate] = useState('1');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (settings?.salary_day) {
            setSalaryDate(settings.salary_day);
        }
    }, [settings]);

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            // Ensure valid day (1-31)
            let day = parseInt(salaryDate);
            if (day < 1) day = 1;
            if (day > 31) day = 31;

            await updateSettings({ salary_day: day.toString() });
            showSuccess('Salary date updated successfully!');
        } catch (error) {
            showError('Failed to update settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div style={{ padding: '24px' }}>Loading...</div>;

    return (
        <div style={{ padding: '24px', maxWidth: '600px', margin: '0 auto', color: currentTheme.colors.text.primary }}>
            <h1 style={{ marginBottom: '24px' }}>Salary Management</h1>

            <Card title="Configuration">
                <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <p style={{ color: currentTheme.colors.text.secondary, fontSize: '0.9rem', margin: 0 }}>
                        Set the day of the month when salaries are typically paid.
                        A notification will appear on this day until all workers are paid.
                    </p>

                    <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
                        <div style={{ flex: 1 }}>
                            <Input
                                label="Monthly Salary Date (1-31)"
                                type="number"
                                min="1"
                                max="31"
                                value={salaryDate}
                                onChange={e => setSalaryDate(e.target.value)}
                                icon={<IoCalendar />}
                            />
                        </div>
                        <Button
                            variant="primary"
                            type="submit"
                            loading={saving}
                            style={{
                                background: '#F97316',
                                border: 'none',
                                marginBottom: '2px', // Align with input
                                height: '42px'
                            }}
                        >
                            <IoSave size={18} style={{ marginRight: '8px' }} />
                            Save Settings
                        </Button>
                    </div>
                </form>
            </Card>

            <div style={{ marginTop: '24px', textAlign: 'center', color: currentTheme.colors.text.secondary }}>
                <p>Manage individual salaries from the Worker List page.</p>
            </div>
        </div>
    );
};

export default SalaryManager;
