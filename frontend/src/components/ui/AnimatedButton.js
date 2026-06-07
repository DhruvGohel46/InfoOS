import React from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import { useAnimation } from '../../hooks/useAnimation';

const AnimatedButton = React.forwardRef(({
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
  ripple = true,
  ...props
}, ref) => {
  const { currentTheme } = useTheme();
  const { buttonTap } = useAnimation();

  const baseStyles = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    fontWeight: '500',
    borderRadius: currentTheme.borderRadius.md,
    border: 'none',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    position: 'relative',
    overflow: 'hidden',
    fontFamily: currentTheme.typography.fontFamily.primary,
  };

  const sizeStyles = {
    sm: {
      padding: '0.5rem 1rem',
      fontSize: currentTheme.typography.fontSize.sm,
      minHeight: '2rem',
    },
    md: {
      padding: '0.75rem 1.5rem',
      fontSize: currentTheme.typography.fontSize.base,
      minHeight: '2.5rem',
    },
    lg: {
      padding: '1rem 2rem',
      fontSize: currentTheme.typography.fontSize.lg,
      minHeight: '3rem',
    },
    xl: {
      padding: '1.25rem 2.5rem',
      fontSize: currentTheme.typography.fontSize.xl,
      minHeight: '3.5rem',
    }
  };

  const variantStyles = {
    primary: {
      backgroundColor: currentTheme.colors.primary[600],
      color: currentTheme.colors.white,
      boxShadow: currentTheme.shadows.sm,
      '&:hover:not(:disabled)': {
        backgroundColor: currentTheme.colors.primary[700],
        boxShadow: currentTheme.shadows.md,
        transform: 'translateY(-1px)',
      },
      '&:active:not(:disabled)': {
        backgroundColor: currentTheme.colors.primary[800],
        transform: 'translateY(0)',
      },
    },
    secondary: {
      backgroundColor: currentTheme.colors.gray[100],
      color: currentTheme.colors.gray[900],
      border: `1px solid ${currentTheme.colors.gray[300]}`,
      '&:hover:not(:disabled)': {
        backgroundColor: currentTheme.colors.gray[200],
        borderColor: currentTheme.colors.gray[400],
        transform: 'translateY(-1px)',
      },
      '&:active:not(:disabled)': {
        backgroundColor: currentTheme.colors.gray[300],
        transform: 'translateY(0)',
      },
    },
    success: {
      backgroundColor: currentTheme.colors.success[600],
      color: currentTheme.colors.white,
      '&:hover:not(:disabled)': {
        backgroundColor: currentTheme.colors.success[700],
        transform: 'translateY(-1px)',
      },
      '&:active:not(:disabled)': {
        backgroundColor: currentTheme.colors.success[800],
        transform: 'translateY(0)',
      },
    },
    warning: {
      backgroundColor: currentTheme.colors.warning[600],
      color: currentTheme.colors.white,
      '&:hover:not(:disabled)': {
        backgroundColor: currentTheme.colors.warning[700],
        transform: 'translateY(-1px)',
      },
      '&:active:not(:disabled)': {
        backgroundColor: currentTheme.colors.warning[800],
        transform: 'translateY(0)',
      },
    },
    error: {
      backgroundColor: currentTheme.colors.error[600],
      color: currentTheme.colors.white,
      '&:hover:not(:disabled)': {
        backgroundColor: currentTheme.colors.error[700],
        transform: 'translateY(-1px)',
      },
      '&:active:not(:disabled)': {
        backgroundColor: currentTheme.colors.error[800],
        transform: 'translateY(0)',
      },
    },
    ghost: {
      backgroundColor: 'transparent',
      color: currentTheme.colors.text.primary,
      '&:hover:not(:disabled)': {
        backgroundColor: currentTheme.colors.gray[100],
        transform: 'translateY(-1px)',
      },
      '&:active:not(:disabled)': {
        backgroundColor: currentTheme.colors.gray[200],
        transform: 'translateY(0)',
      },
    },
  };

  const disabledStyles = {
    opacity: 0.5,
    cursor: 'not-allowed',
    transform: 'none !important',
  };

  const loadingStyles = {
    opacity: 0.7,
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

  const renderIcon = () => {
    if (!icon) return null;
    
    const iconStyles = {
      display: 'flex',
      alignItems: 'center',
      fontSize: '1em',
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
              animation: 'spin 1s linear infinite',
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

  return (
    <motion.button
      ref={ref}
      style={styles}
      className={className}
      disabled={disabled || loading}
      onClick={onClick}
      whileTap={!disabled && !loading ? buttonTap.tap : undefined}
      whileHover={!disabled && !loading ? buttonTap.hover : undefined}
      whileFocus={!disabled && !loading ? { scale: 1.02 } : undefined}
      {...props}
    >
      {/* Ripple effect */}
      {ripple && !disabled && !loading && (
        <motion.div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '0',
            height: '0',
            borderRadius: '50%',
            backgroundColor: 'rgba(255, 255, 255, 0.3)',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }}
          initial={{ scale: 0, opacity: 1 }}
          animate={{ scale: 0, opacity: 0 }}
          whileTap={{
            scale: [0, 4],
            opacity: [1, 0],
            transition: { duration: 0.6 }
          }}
        />
      )}
      
      {renderContent()}
      
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </motion.button>
  );
});

AnimatedButton.displayName = 'AnimatedButton';

export default AnimatedButton;
