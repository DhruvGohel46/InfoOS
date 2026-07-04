import React, { createContext, useContext, useState, useEffect } from 'react';
import { lightTheme, darkTheme } from '../styles/theme';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const getInitialTheme = () => {
    const savedTheme = localStorage.getItem('pos_theme');
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;

    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    return 'light';
  };

  const [theme, setTheme] = useState(getInitialTheme);
  const [currentTheme, setCurrentTheme] = useState(theme === 'dark' ? darkTheme : lightTheme);

  const applyThemeTokensToCSS = (themeObject) => {
    const root = document.documentElement;

    // Background colors
    root.style.setProperty('--bg-primary', themeObject.colors.background);
    root.style.setProperty('--bg-secondary', themeObject.colors.surface);
    root.style.setProperty('--bg-tertiary', themeObject.colors.card || themeObject.colors.surface);

    // Text colors
    root.style.setProperty('--text-primary', themeObject.colors.text.primary);
    root.style.setProperty('--text-secondary', themeObject.colors.text.secondary);
    root.style.setProperty('--text-muted', themeObject.colors.text.muted);
    root.style.setProperty('--text-inverse', themeObject.colors.text.inverse);

    // Border colors
    root.style.setProperty('--border-primary', themeObject.colors.border);
    root.style.setProperty('--border-secondary', themeObject.colors.border.secondary || themeObject.colors.border);
    root.style.setProperty('--border-tertiary', themeObject.colors.border.tertiary || themeObject.colors.border);

    // Surface colors
    root.style.setProperty('--surface-primary', themeObject.colors.surface);
    root.style.setProperty('--surface-secondary', themeObject.colors.surface.secondary);
    root.style.setProperty('--surface-tertiary', themeObject.colors.surface.tertiary);

    // Brand colors
    root.style.setProperty('--primary', themeObject.colors.primary[500]);
    root.style.setProperty('--primary-50', themeObject.colors.primary[50]);
    root.style.setProperty('--primary-100', themeObject.colors.primary[100]);
    root.style.setProperty('--primary-500', themeObject.colors.primary[500]);
    root.style.setProperty('--primary-600', themeObject.colors.primary[600]);
    root.style.setProperty('--primary-700', themeObject.colors.primary[700]);

    // Semantic colors
    root.style.setProperty('--success-50', themeObject.colors.success[50]);
    root.style.setProperty('--success-500', themeObject.colors.success[500]);
    root.style.setProperty('--success-600', themeObject.colors.success[600]);

    root.style.setProperty('--warning-50', themeObject.colors.warning[50]);
    root.style.setProperty('--warning-500', themeObject.colors.warning[500]);
    root.style.setProperty('--warning-600', themeObject.colors.warning[600]);

    root.style.setProperty('--error-50', themeObject.colors.error[50]);
    root.style.setProperty('--error-500', themeObject.colors.error[500]);
    root.style.setProperty('--error-600', themeObject.colors.error[600]);

    root.style.setProperty('--info-50', themeObject.colors.info[50]);
    root.style.setProperty('--info-500', themeObject.colors.info[500]);
    root.style.setProperty('--info-600', themeObject.colors.info[600]);

    // Category colors
    root.style.setProperty('--category-cold', themeObject.colors.category.COLD);
    root.style.setProperty('--category-paan', themeObject.colors.category.PAAN);
    root.style.setProperty('--category-snack', themeObject.colors.category.SNACK || themeObject.colors.category.OTHER);
    root.style.setProperty('--category-food', themeObject.colors.category.FOOD || themeObject.colors.category.OTHER);
    root.style.setProperty('--category-other', themeObject.colors.category.OTHER);

    // Focus and accent
    root.style.setProperty('--focus', themeObject.colors.focus);
    root.style.setProperty('--accent', themeObject.colors.primary[500]);

    // Border Radius
    root.style.setProperty('--radius-sharp', themeObject.borderRadius.sharp);
    root.style.setProperty('--radius-sm', themeObject.borderRadius.sm);
    root.style.setProperty('--radius-base', themeObject.borderRadius.base);
    root.style.setProperty('--radius-md', themeObject.borderRadius.md);
    root.style.setProperty('--radius-lg', themeObject.borderRadius.lg);
    root.style.setProperty('--radius-xl', themeObject.borderRadius.xl);
    root.style.setProperty('--radius-2xl', themeObject.borderRadius['2xl']);
    root.style.setProperty('--radius-3xl', themeObject.borderRadius['3xl']);
    root.style.setProperty('--radius-full', themeObject.borderRadius.full);

    // New Gradient & Design System Tokens
    root.style.setProperty('--bg-gradient', themeObject.gradients?.background || themeObject.colors.background);
    root.style.setProperty('--primary-gradient', themeObject.gradients?.primary || themeObject.colors.primary[500]);

    // Shadow tokens
    root.style.setProperty('--shadow-card', themeObject.shadows.card);
    root.style.setProperty('--shadow-card-hover', themeObject.shadows.cardHover);
    
    // 3D Elevation
    if (themeObject.elevation) {
      root.style.setProperty('--elevation-low', themeObject.elevation.low);
      root.style.setProperty('--elevation-mid', themeObject.elevation.mid);
      root.style.setProperty('--elevation-high', themeObject.elevation.high);
    }

    // Glow tokens
    root.style.setProperty('--glow-primary', themeObject.shadows.glow?.primary || 'none');
    root.style.setProperty('--glow-success', themeObject.shadows.glow?.success || 'none');

    // Glassmorphism tokens
    if (themeObject.glass) {
      root.style.setProperty('--glass-sidebar', themeObject.glass.sidebar);
      root.style.setProperty('--glass-card', themeObject.glass.card);
      root.style.setProperty('--glass-modal', themeObject.glass.modal);
      root.style.setProperty('--glass-input', themeObject.glass.input);
      root.style.setProperty('--glass-dropdown', themeObject.glass.dropdown);
      root.style.setProperty('--glass-header', themeObject.glass.header);
      root.style.setProperty('--glass-border', themeObject.glass.border);
      root.style.setProperty('--glass-specular', themeObject.glass.specular);
      root.style.setProperty('--glass-blur', themeObject.glass.blur);
    }

    // Advanced Gradients
    root.style.setProperty('--gradient-glow', themeObject.gradients?.glow || 'none');
  };

  useEffect(() => {
    const nextTheme = theme === 'dark' ? darkTheme : lightTheme;
    document.documentElement.setAttribute('data-theme', theme);
    setCurrentTheme(nextTheme);
    localStorage.setItem('pos_theme', theme);
    applyThemeTokensToCSS(nextTheme);
    if (window.electronAPI && window.electronAPI.changeTheme) {
      window.electronAPI.changeTheme(theme).catch(err => console.error('Failed to notify theme change:', err));
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };

  const value = {
    theme,
    currentTheme,
    toggleTheme,
    setTheme, // Expose direct setter
    isDark: theme === 'dark',
    isLight: theme === 'light',
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
