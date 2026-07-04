import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { settingsAPI } from '../api/settings';
import { useTheme } from './ThemeContext';
import { setCurrencySymbol } from '../utils/api';

const SettingsContext = createContext();

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};

// ===========================================================================
// DISPLAY PREFERENCES — UNIVERSAL SCALE
//
// SCREEN_SCALE_MAP: Multiplier for layout sizes (padding, gaps, sidebar, header)
// FONT_SCALE_MAP: Multiplier for ALL text sizes across the site.
// ===========================================================================

const SCREEN_SCALE_MAP = {
    small: 0.60,   // very compact
    medium: 0.90,   // compact
    large: 1.05,   // original-ish
};

const FONT_SCALE_MAP = {
    small: 0.60,   // very compact
    medium: 0.90,   // compact
    large: 1.05,   // standard
};

export const applyDisplayPrefs = (config = {}) => {
    const root = document.documentElement;

    // Clear any legacy zoom/frame styling
    document.body.style.zoom = '';
    const appRoot = document.getElementById('root');
    if (appRoot) {
        appRoot.style.zoom = '';
        appRoot.style.width = '';
        appRoot.style.height = '';
        appRoot.style.overflow = '';
    }

    // Apply Screen Scale (Layout)
    const screenSize = config.screen_size || 'medium';
    const scale = SCREEN_SCALE_MAP[screenSize] ?? 0.90;
    root.style.setProperty('--ui-scale', scale);

    // Apply Font Scale (Text) - "Link every text with this"
    const fontSize = config.font_size || 'medium';
    const fontScale = FONT_SCALE_MAP[fontSize] ?? 0.90;
    root.style.setProperty('--ui-font-scale', fontScale);

    // Fallback scaling for rem-based units not using the direct variable
    root.style.fontSize = (fontScale * 100) + '%';

    // Synchronize Display Zoom & Text Scale
    try {
        const zoom = localStorage.getItem('display_zoom');
        const textScale = localStorage.getItem('text_scale');
        if (zoom) {
            if (window.electronAPI && window.electronAPI.setZoomFactor) {
                window.electronAPI.setZoomFactor(parseFloat(zoom));
                root.style.setProperty('--display-zoom', 1);
            } else {
                root.style.setProperty('--display-zoom', zoom);
            }
        }
        if (textScale) {
            root.style.setProperty('--text-scale', textScale);
        }
    } catch (_) {}
};

export const SettingsProvider = ({ children }) => {
    const { setTheme } = useTheme();

    const [settings, setSettings] = useState(() => {
        try {
            const saved = localStorage.getItem('pos_settings');
            const parsed = saved ? JSON.parse(saved) : {};
            applyDisplayPrefs(parsed);
            return parsed;
        } catch (e) {
            console.error("Failed to parse local settings", e);
            return {};
        }
    });

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const applyGlobalConfig = useCallback((config) => {
        if (config.currency_symbol) setCurrencySymbol(config.currency_symbol);
        if (config.dark_mode === 'true') setTheme('dark');
        else if (config.dark_mode === 'false') setTheme('light');
        applyDisplayPrefs(config);
    }, [setTheme]);

    const loadSettings = useCallback(async () => {
        try {
            setLoading(true);
            const data = await settingsAPI.getAllSettings();
            setSettings(data);
            localStorage.setItem('pos_settings', JSON.stringify(data));
            applyGlobalConfig(data);
        } catch (err) {
            console.error("Failed to load settings:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [applyGlobalConfig]);

    const updateSettings = async (newSettings) => {
        try {
            const updatedState = { ...settings };
            let apiPayload;
            if (Array.isArray(newSettings)) {
                apiPayload = newSettings;
                newSettings.forEach(s => (updatedState[s.key] = s.value));
            } else {
                apiPayload = newSettings;
                Object.assign(updatedState, newSettings);
            }
            setSettings(updatedState);
            localStorage.setItem('pos_settings', JSON.stringify(updatedState));
            applyGlobalConfig(updatedState);
            await settingsAPI.updateSettings(apiPayload);
            return true;
        } catch (err) {
            console.error("Failed to update settings:", err);
            loadSettings();
            throw err;
        }
    };

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    return (
        <SettingsContext.Provider value={{ settings, loading, error, updateSettings, refreshSettings: loadSettings }}>
            {children}
        </SettingsContext.Provider>
    );
};
