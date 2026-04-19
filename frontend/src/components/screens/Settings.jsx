import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSettings } from '../../context/SettingsContext';
import { useAlert as useToast } from '../../context/AlertContext';
import { useTheme } from '../../context/ThemeContext';
import '../../styles/Settings.css';
import '../../styles/typography.css'; // Import typography system
import Dropdown from '../ui/Dropdown';
import GlobalTimePicker from '../ui/GlobalTimePicker';
import GlobalDatePicker from '../ui/GlobalDatePicker';
import Card from '../ui/Card'; // Import Shared Card Component
import PageContainer from '../layout/PageContainer';
import Button from '../ui/Button';
import {
    IoStorefrontOutline,
    IoCardOutline,
    IoPrintOutline,
    IoAppsOutline,
    IoPeopleOutline,
    IoChevronForward,
    IoBusinessOutline,
    IoReceiptOutline,
    IoHardwareChipOutline,
    IoColorPaletteOutline,
    IoCalendarOutline,
    IoShieldCheckmarkOutline
} from 'react-icons/io5';
import { getLocalDateString } from '../../utils/api';

const Settings = () => {
    const { showSuccess, showError } = useToast();
    const { isDark } = useTheme();
    const { settings: globalSettings, loading, updateSettings } = useSettings();

    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('shop');
    
    // Text scale state
    const [textScale, setTextScale] = useState(() => {
        const saved = localStorage.getItem('text_scale');
        return saved ? parseFloat(saved) : 1;
    });

    // Apply text scale to CSS variable
    useEffect(() => {
        document.documentElement.style.setProperty('--text-scale', textScale);
        localStorage.setItem('text_scale', textScale);
    }, [textScale]);

    // Display zoom state
    const [displayZoom, setDisplayZoom] = useState(() => {
        const saved = localStorage.getItem('display_zoom');
        return saved ? parseFloat(saved) : 1;
    });

    // Apply display zoom to CSS variable
    useEffect(() => {
        document.documentElement.style.setProperty('--display-zoom', displayZoom);
        localStorage.setItem('display_zoom', displayZoom);
    }, [displayZoom]);

    const [formSettings, setFormSettings] = useState({
        // Shop
        shop_name: '',
        shop_address: '',
        shop_contact: '',
        gst_no: '',
        currency_symbol: '₹',
        shop_open_time: '',
        shop_close_time: '',

        // Billing
        bill_reset_daily: 'true',
        default_tax_rate: '0',
        tax_enabled: 'false',

        // Printer
        printer_enabled: 'false',
        printer_width: '58mm',
        auto_print: 'false',

        // App
        show_product_images: 'true',
        dark_mode: 'false',
        sound_enabled: 'true',
        
        // Security
        require_pin_login: 'false',

        // Workers
        salary_day: '1'
    });

    // Sync form with global settings when they load
    useEffect(() => {
        if (globalSettings && Object.keys(globalSettings).length > 0) {
            setFormSettings(prev => ({
                ...prev,
                ...globalSettings
            }));
        }
    }, [globalSettings]);

    const handleChange = (key, value) => {
        setFormSettings(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            await updateSettings(formSettings);
            showSuccess('Settings saved successfully');
        } catch (error) {
            showError('Failed to save settings');
            console.error(error);
        } finally {
            setSaving(false);
        }
    };

    const handleDiscard = () => {
        if (globalSettings) {
            setFormSettings(prev => ({ ...prev, ...globalSettings }));
        }
        showSuccess('Changes discarded');
    };

    const tabs = [
        { id: 'shop', label: 'Shop Details', icon: IoStorefrontOutline },
        { id: 'billing', label: 'Billing Configuration', icon: IoCardOutline },
        { id: 'printer', label: 'Printer Settings', icon: IoPrintOutline },
        { id: 'app', label: 'App Preferences', icon: IoAppsOutline },
        { id: 'workers', label: 'Worker Configuration', icon: IoPeopleOutline },
        { id: 'security', label: 'Security & Access', icon: IoShieldCheckmarkOutline }
    ];

    if (loading) {
        return <PageContainer><Card>Loading settings...</Card></PageContainer>;
    }

    return (
        <PageContainer>
            <div className="stPage">
                <div className="stStickyHeader">
                    {/* Header */}
                    <div className="stHeader">
                        <div className="stTitle">System Settings</div>
                    </div>

                    <div className="stTabs">
                        <div className="stTabList">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    className={`stTabButton ${activeTab === tab.id ? 'stTabActive' : ''}`}
                                    onClick={() => setActiveTab(tab.id)}
                                >
                                    <tab.icon size={20} className="stTabIcon" />
                                    <span className="stTabLabel">{tab.label}</span>

                                    {activeTab === tab.id && (
                                        <motion.div
                                            layoutId="stTabIndicator"
                                            className="stTabIndicator"
                                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                        />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Using Shared Card Component for Consistency */}
                <Card
                    className="stSection"
                    padding="lg"
                    shadow="card"
                    hover={false} // Disable global hover effect
                    key={activeTab} // Retain key for animation reset on tab switch if needed
                >
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        {activeTab === 'shop' && (
                            <>
                                <div className="stSectionTitle">
                                    <IoBusinessOutline size={22} color="var(--primary)" />
                                    Store Information
                                </div>

                                <div className="stSectionContent">
                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Shop Name</span>
                                            <span className="stLabelDesc">Appears on bills and reports</span>
                                        </div>
                                        <input
                                            className="stInput"
                                            value={formSettings.shop_name || ''}
                                            onChange={(e) => handleChange('shop_name', e.target.value)}
                                            placeholder="e.g. Burger Bhau"
                                        />
                                    </div>

                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Address</span>
                                            <span className="stLabelDesc">Shop location for bill header</span>
                                        </div>
                                        <input
                                            className="stInput"
                                            value={formSettings.shop_address || ''}
                                            onChange={(e) => handleChange('shop_address', e.target.value)}
                                            placeholder="Shop address"
                                        />
                                    </div>

                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Contact Number</span>
                                            <span className="stLabelDesc">Displayed on bills</span>
                                        </div>
                                        <input
                                            className="stInput"
                                            value={formSettings.shop_contact || ''}
                                            onChange={(e) => handleChange('shop_contact', e.target.value)}
                                            placeholder="Phone number"
                                        />
                                    </div>

                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">GST / Tax ID</span>
                                            <span className="stLabelDesc">Optional tax identification number</span>
                                        </div>
                                        <input
                                            className="stInput"
                                            value={formSettings.gst_no || ''}
                                            onChange={(e) => handleChange('gst_no', e.target.value)}
                                            placeholder="GSTIN (Optional)"
                                        />
                                    </div>

                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Currency Symbol</span>
                                            <span className="stLabelDesc">Default currency for prices</span>
                                        </div>
                                        <Dropdown
                                            options={[
                                                { label: 'India (INR) - ₹', value: '₹' },
                                                { label: 'USA (USD) - $', value: '$' },
                                                { label: 'Europe (EUR) - €', value: '€' },
                                                { label: 'UK (GBP) - £', value: '£' },
                                                { label: 'Japan (JPY) - ¥', value: '¥' }
                                            ]}
                                            value={formSettings.currency_symbol || '₹'}
                                            onChange={(val) => handleChange('currency_symbol', val)}
                                            placeholder="Select Currency"
                                            className="stDropdown"
                                            zIndex={60}
                                        />
                                    </div>

                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Shop Timings</span>
                                            <span className="stLabelDesc">For automated stock alerts</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '10px', maxWidth: '440px' }}>
                                            <div style={{ flex: 1 }}>
                                                <GlobalTimePicker
                                                    value={formSettings.shop_open_time || ''}
                                                    onChange={(val) => handleChange('shop_open_time', val)}
                                                    placeholder="Open Time"
                                                />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <GlobalTimePicker
                                                    value={formSettings.shop_close_time || ''}
                                                    onChange={(val) => handleChange('shop_close_time', val)}
                                                    placeholder="Close Time"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {activeTab === 'billing' && (
                            <>
                                <div className="stSectionTitle">
                                    <IoReceiptOutline size={22} color="var(--primary)" />
                                    Billing Rules
                                </div>

                                <div className="stSectionContent">
                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Daily Bill Reset</span>
                                            <span className="stLabelDesc">Reset bill number to 1 every day</span>
                                        </div>
                                        <label className="stToggle">
                                            <input
                                                type="checkbox"
                                                checked={formSettings.bill_reset_daily === 'true'}
                                                onChange={(e) => handleChange('bill_reset_daily', e.target.checked ? 'true' : 'false')}
                                            />
                                            <span className="stSlider"></span>
                                        </label>
                                    </div>

                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Enable Tax</span>
                                            <span className="stLabelDesc">Calculate tax on bills</span>
                                        </div>
                                        <label className="stToggle">
                                            <input
                                                type="checkbox"
                                                checked={formSettings.tax_enabled === 'true'}
                                                onChange={(e) => handleChange('tax_enabled', e.target.checked ? 'true' : 'false')}
                                            />
                                            <span className="stSlider"></span>
                                        </label>
                                    </div>

                                    {formSettings.tax_enabled === 'true' && (
                                        <div className="stFormGroup">
                                            <div className="stLabel">
                                                <span className="stLabelTitle">Default Tax Rate (%)</span>
                                                <span className="stLabelDesc">Percentage added to total</span>
                                            </div>
                                            <input
                                                type="number"
                                                className="stInput"
                                                style={{ width: '100px' }}
                                                value={formSettings.default_tax_rate || ''}
                                                onChange={(e) => handleChange('default_tax_rate', e.target.value)}
                                            />
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {activeTab === 'printer' && (
                            <>
                                <div className="stSectionTitle">
                                    <IoHardwareChipOutline size={22} color="var(--primary)" />
                                    Printer Configuration
                                </div>

                                <div className="stSectionContent">
                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Enable Thermal Printer</span>
                                            <span className="stLabelDesc">Send print commands to connected printer</span>
                                        </div>
                                        <label className="stToggle">
                                            <input
                                                type="checkbox"
                                                checked={formSettings.printer_enabled === 'true'}
                                                onChange={(e) => handleChange('printer_enabled', e.target.checked ? 'true' : 'false')}
                                            />
                                            <span className="stSlider"></span>
                                        </label>
                                    </div>

                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Auto Print</span>
                                            <span className="stLabelDesc">Print automatically after saving bill</span>
                                        </div>
                                        <label className="stToggle">
                                            <input
                                                type="checkbox"
                                                checked={formSettings.auto_print === 'true'}
                                                onChange={(e) => handleChange('auto_print', e.target.checked ? 'true' : 'false')}
                                            />
                                            <span className="stSlider"></span>
                                        </label>
                                    </div>

                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Page Width</span>
                                            <span className="stLabelDesc">Paper roll width</span>
                                        </div>
                                        <Dropdown
                                            options={[
                                                { label: '58mm', value: '58mm' },
                                                { label: '80mm', value: '80mm' }
                                            ]}
                                            value={formSettings.printer_width || '58mm'}
                                            onChange={(val) => handleChange('printer_width', val)}
                                            placeholder="Select Width"
                                            className="stDropdown"
                                            zIndex={50}
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        {activeTab === 'app' && (
                            <>
                                <div className="stSectionTitle">
                                    <IoColorPaletteOutline size={22} color="var(--primary)" />
                                    Application Preferences
                                </div>

                                <div className="stSectionContent">
                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Show Product Images</span>
                                            <span className="stLabelDesc">Disable to improve performance on low-end devices</span>
                                        </div>
                                        <label className="stToggle">
                                            <input
                                                type="checkbox"
                                                checked={formSettings.show_product_images !== 'false'}
                                                onChange={(e) => handleChange('show_product_images', e.target.checked ? 'true' : 'false')}
                                            />
                                            <span className="stSlider"></span>
                                        </label>
                                    </div>

                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Dark Mode (Default)</span>
                                            <span className="stLabelDesc">Set dark mode as default on startup</span>
                                        </div>
                                        <label className="stToggle">
                                            <input
                                                type="checkbox"
                                                checked={formSettings.dark_mode === 'true'}
                                                onChange={(e) => handleChange('dark_mode', e.target.checked ? 'true' : 'false')}
                                            />
                                            <span className="stSlider"></span>
                                        </label>
                                    </div>

                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Sound Effects</span>
                                            <span className="stLabelDesc">Play sound on successful bill</span>
                                        </div>
                                        <label className="stToggle">
                                            <input
                                                type="checkbox"
                                                checked={formSettings.sound_enabled === 'true'}
                                                onChange={(e) => handleChange('sound_enabled', e.target.checked ? 'true' : 'false')}
                                            />
                                            <span className="stSlider"></span>
                                        </label>
                                    </div>

                                    {/* Text Size Control */}
                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Text Size</span>
                                            <span className="stLabelDesc">Adjust text scaling across the app</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
                                            <Dropdown
                                                options={[
                                                    { label: 'Small', value: '0.8' },
                                                    { label: 'Normal', value: '1' },
                                                    { label: 'Large', value: '1.1' },
                                                    { label: 'Extra Large', value: '1.2' }
                                                ]}
                                                value={textScale.toString()}
                                                onChange={(val) => setTextScale(parseFloat(val))}
                                                placeholder="Select text size"
                                                className="stDropdown"
                                                zIndex={40}
                                            />
                                            <div style={{ 
                                                fontSize: 'var(--font-sm)', 
                                                color: isDark ? '#94a3b8' : '#64748b',
                                                marginLeft: '8px',
                                                padding: '4px 8px',
                                                borderRadius: '6px',
                                                background: isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(100, 116, 139, 0.1)'
                                            }}>
                                                Scale: {(textScale * 100).toFixed(0)}%
                                            </div>
                                        </div>
                                    </div>

                                    {/* Display Zoom Control */}
                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Display Zoom</span>
                                            <span className="stLabelDesc">Scale sections, cards and UI elements</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
                                            <Dropdown
                                                options={[
                                                    { label: 'Small', value: '0.8' },
                                                    { label: 'Normal', value: '1' },
                                                    { label: 'Large', value: '1.1' },
                                                    { label: 'Extra Large', value: '1.2' }
                                                ]}
                                                value={displayZoom.toString()}
                                                onChange={(val) => setDisplayZoom(parseFloat(val))}
                                                placeholder="Select display zoom"
                                                className="stDropdown"
                                                zIndex={39}
                                            />
                                            <div style={{ 
                                                fontSize: 'var(--font-sm)', 
                                                color: isDark ? '#94a3b8' : '#64748b',
                                                marginLeft: '8px',
                                                padding: '4px 8px',
                                                borderRadius: '6px',
                                                background: isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(100, 116, 139, 0.1)'
                                            }}>
                                                Zoom: {(displayZoom * 100).toFixed(0)}%
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {activeTab === 'workers' && (
                            <>
                                <div className="stSectionTitle">
                                    <IoCalendarOutline size={22} color="var(--primary)" />
                                    Worker Management
                                </div>

                                <div className="stSectionContent">
                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Monthly Salary Date</span>
                                            <span className="stLabelDesc">Day of the month to generate salary notifications (1-31)</span>
                                        </div>
                                        <div style={{ width: '100%' }}>
                                            <GlobalDatePicker
                                                value={(() => {
                                                    const day = parseInt(formSettings.salary_day) || 1;
                                                    const now = new Date();
                                                    return getLocalDateString(new Date(now.getFullYear(), now.getMonth(), day));
                                                })()}
                                                onChange={(dateStr) => {
                                                    // Extract just the day number from the selected date
                                                    if (dateStr) {
                                                        // dateStr is YYYY-MM-DD from the picker
                                                        const parts = dateStr.split('-');
                                                        if (parts.length === 3) {
                                                            const day = parseInt(parts[2]);
                                                            handleChange('salary_day', day.toString());
                                                        }
                                                    }
                                                }}
                                                placeholder="Select Salary Day"
                                            />
                                            <div style={{ marginTop: '8px', fontSize: '0.85rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                                                Selected: <strong style={{ color: isDark ? '#fff' : '#0f172a' }}>Day {formSettings.salary_day || 1}</strong> of every month
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                        
                        {activeTab === 'security' && (
                            <>
                                <div className="stSectionTitle">
                                    <IoShieldCheckmarkOutline size={22} color="var(--primary)" />
                                    Access Control
                                </div>

                                <div className="stSectionContent">
                                    <div className="stFormGroup">
                                        <div className="stLabel">
                                            <span className="stLabelTitle">Require PIN Login</span>
                                            <span className="stLabelDesc">Prompt for owner PIN on application launch</span>
                                        </div>
                                        <label className="stToggle">
                                            <input
                                                type="checkbox"
                                                checked={formSettings.require_pin_login === 'true'}
                                                onChange={(e) => handleChange('require_pin_login', e.target.checked ? 'true' : 'false')}
                                            />
                                            <span className="stSlider"></span>
                                        </label>
                                    </div>
                                    <div style={{ marginTop: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                        Note: Disabling PIN Login leaves the system unlocked. Enabling it will require setting up a PIN if not done already.
                                    </div>
                                </div>
                            </>
                        )}

                        <div className="stActions">
                            <Button variant="secondary" onClick={handleDiscard}>Discard Changes</Button>
                            <Button
                                variant="primary"
                                onClick={handleSave}
                                loading={saving}
                            >
                                {saving ? 'Saving...' : 'Save Settings'}
                            </Button>
                        </div>
                    </motion.div>
                </Card>
            </div>
        </PageContainer >
    );
};

export default Settings;
