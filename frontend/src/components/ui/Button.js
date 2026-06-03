import React from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';


const Button = React.forwardRef(({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon = null,
  iconPosition = 'left',
  fullWidth = false,
  onClick,
  className = '',
  style: styleProp,
  ...props
}, ref) => {
  const { currentTheme, isDark } = useTheme();


  const baseStyles = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontWeight: 600, // Slightly bolder
    borderRadius: '12px', // Standard ReBill Radius
    border: 'none',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    position: 'relative',
    overflow: 'hidden',
    fontFamily: currentTheme.typography.fontFamily.primary,
    letterSpacing: '0',
    whiteSpace: 'nowrap',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  };

  const sizeStyles = {
    sm: {
      padding: '0 12px',
      fontSize: '13px',
      height: '32px',
    },
    md: {
      padding: '0 16px',
      fontSize: '14px',
      height: '40px',
    },
    lg: {
      padding: '0 24px',
      fontSize: '16px',
      height: '48px', // Critical Fix Size
    },
    xl: {
      padding: '0 32px',
      fontSize: '18px',
      height: '56px',
    }
  };

  const variantStyles = {
    primary: {
      backgroundColor: '#FF6A00', // Signature orange
      color: '#FFFFFF',
      boxShadow: '0 6px 18px rgba(255,106,0,0.35)', // Signature Shadow
      border: 'none',
      // Hover handled by motion
    },
    secondary: {
      backgroundColor: isDark ? '#23262D' : '#E9EDF2',
      color: currentTheme.colors.text.primary,
      border: 'none', // No border for secondary
      boxShadow: 'none',
    },
    success: {
      backgroundColor: currentTheme.colors.success[600],
      color: currentTheme.colors.white,
      boxShadow: currentTheme.shadows.sm,
      border: 'none',
    },
    warning: {
      backgroundColor: currentTheme.colors.warning[500],
      color: '#1a1a1a',
      boxShadow: currentTheme.shadows.sm,
      border: 'none',
    },
    error: {
      backgroundColor: currentTheme.colors.error[600],
      color: currentTheme.colors.white,
      boxShadow: currentTheme.shadows.sm,
      border: 'none',
    },
    ghost: {
      backgroundColor: 'transparent',
      color: currentTheme.colors.text.secondary,
      border: 'none',
    },
  };

  const disabledStyles = {
    opacity: 0.5,
    cursor: 'not-allowed',
    transform: 'none !important',
    boxShadow: 'none !important',
  };

  const loadingStyles = {
    opacity: 0.8,
    cursor: 'wait',
  };

  const widthStyles = fullWidth ? { width: '100%' } : {};

  const styles = {
    ...baseStyles,
    ...sizeStyles[size],
    ...variantStyles[variant],
    ...(disabled && disabledStyles),
    ...(loading && loadingStyles),
    ...widthStyles,
  };

  const mergedStyles = {
    ...styles,
    ...(styleProp || {}),
  };

  const renderIcon = () => {
    if (!icon) return null;

    const iconStyles = {
      display: 'flex',
      alignItems: 'center',
      fontSize: '1.2em', // Slightly larger icons
      flexShrink: 0,
    };

    return <span style={iconStyles}>{icon}</span>;
  };

  const renderContent = () => {
    if (loading) {
      return (
        <>
          <motion.div
            style={{
              width: '1em',
              height: '1em',
              border: '2px solid currentColor',
              borderTop: '2px solid transparent',
              borderRadius: '50%',
            }}
            animate={{ rotate: 360 }}
            transition={{
              duration: 1,
              ease: 'linear',
              repeat: Infinity,
            }}
          />
          {children}
        </>
      );
    }

    return (
      <>
        {iconPosition === 'left' && renderIcon()}
        {children}
        {iconPosition === 'right' && renderIcon()}
      </>
    );
  };

  // Signature Animations
  const getMotionProps = () => {
    if (disabled || loading) return {};

    if (variant === 'primary') {
      return {
        whileHover: { scale: 1.08 }, // Signature hover
        whileTap: { scale: 0.92 },  // Signature tap
        transition: { type: "spring", stiffness: 320, damping: 20 }
      };
    }

    if (variant === 'secondary') {
      return {
        whileHover: { y: -1, backgroundColor: isDark ? '#2A2D35' : '#E2E6EC' }, // Lift
        whileTap: { scale: 0.96 },
        transition: { duration: 0.2 }
      };
    }

    if (variant === 'ghost') {
      return {
        whileHover: { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
        whileTap: { scale: 0.95 }
      };
    }

    return {
      whileHover: { scale: 1.02, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' },
      whileTap: { scale: 0.96 }
    };
  };

  return (
    <motion.button
      ref={ref}
      style={mergedStyles}
      className={className}
      disabled={disabled || loading}
      onClick={onClick}
      {...getMotionProps()}
      {...props}
    >
      {renderContent()}
    </motion.button>
  );
});

Button.displayName = 'Button';

export default Button;
