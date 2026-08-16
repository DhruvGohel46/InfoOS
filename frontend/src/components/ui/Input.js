import React from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';

const Input = React.forwardRef(({
  type = 'text',
  placeholder = '',
  value = '',
  onChange,
  onBlur,
  onFocus,
  error = '',
  disabled = false,
  required = false,
  label = '',
  helperText = '',
  size = 'md',
  variant = 'default',
  className = '',
  leftIcon,
  ...props
}, ref) => {
  const { currentTheme } = useTheme();

  const containerStyles = {
    display: 'flex',
    flexDirection: 'column',
    gap: currentTheme.spacing[2],
    fontFamily: currentTheme.typography.fontFamily.primary,
  };

  const labelStyles = {
    fontSize: currentTheme.typography.fontSize.sm,
    fontWeight: currentTheme.typography.fontWeight.medium,
    color: currentTheme.colors.text.primary,
    display: 'flex',
    alignItems: 'center',
    gap: currentTheme.spacing[1],
  };

  const inputBaseStyles = {
    fontSize: currentTheme.typography.fontSize.base,
    fontFamily: currentTheme.typography.fontFamily.primary,
    border: `1px solid ${error ? currentTheme.colors.error[500] : (currentTheme.glass?.border || currentTheme.colors.border)}`,
    borderRadius: currentTheme.borderRadius.md,
    backgroundColor: currentTheme.glass?.input || currentTheme.colors.card,
    backdropFilter: currentTheme.glass?.blur,
    color: currentTheme.colors.text.primary,
    transition: 'all 0.2s ease',
    outline: 'none',
    colorScheme: currentTheme.name === 'dark' ? 'dark' : 'light', // Force native picker theme
  };

  const sizeStyles = {
    sm: {
      padding: `${currentTheme.spacing[2]} ${currentTheme.spacing[3]}`,
      fontSize: currentTheme.typography.fontSize.sm,
    },
    md: {
      padding: `${currentTheme.spacing[3]} ${currentTheme.spacing[4]}`,
      fontSize: currentTheme.typography.fontSize.base,
    },
    lg: {
      padding: `${currentTheme.spacing[4]} ${currentTheme.spacing[5]}`,
      fontSize: currentTheme.typography.fontSize.lg,
    },
  };

  const variantStyles = {
    default: {},
    outlined: {
      border: `2px solid ${currentTheme.colors.primary[200]}`,
      '&:focus': {
        borderColor: currentTheme.colors.primary[500],
        boxShadow: `0 0 0 3px ${currentTheme.colors.primary[100]}`,
      },
    },
    filled: {
      backgroundColor: currentTheme.colors.gray[100],
      border: 'none',
      '&:focus': {
        backgroundColor: currentTheme.colors.gray[50],
        boxShadow: `0 0 0 3px ${currentTheme.colors.primary[100]}`,
      },
    },
  };

  const focusStyles = {
    '&:focus': {
      borderColor: error ? currentTheme.colors.error[500] : currentTheme.colors.primary[500],
      boxShadow: error
        ? `0 0 0 3px ${currentTheme.colors.error[100]}`
        : `0 0 0 3px ${currentTheme.colors.primary[100]}`,
    },
  };

  const disabledStyles = {
    opacity: 0.5,
    cursor: 'not-allowed',
    backgroundColor: currentTheme.colors.gray[100],
  };

  const inputStyles = {
    ...inputBaseStyles,
    ...sizeStyles[size],
    ...variantStyles[variant],
    ...focusStyles,
    ...(disabled && disabledStyles),
  };

  const helperTextStyles = {
    fontSize: currentTheme.typography.fontSize.xs,
    color: error ? currentTheme.colors.error[600] : currentTheme.colors.text.secondary,
  };

  const errorStyles = {
    fontSize: currentTheme.typography.fontSize.sm,
    color: currentTheme.colors.error[600],
    marginTop: currentTheme.spacing[1],
  };

  const handleFocus = (e) => {
    if (onFocus) onFocus(e);
  };

  const handleBlur = (e) => {
    if (onBlur) onBlur(e);
  };

  const handleChange = (e) => {
    if (onChange) onChange(e);
  };

  return (
    <div style={containerStyles} className={className}>
      {label && (
        <label style={labelStyles}>
          {label}
          {required && (
            <span style={{ color: currentTheme.colors.error[500] }}>*</span>
          )}
        </label>
      )}

      <div style={{ position: 'relative', width: '100%' }}>
        {leftIcon && (
          <div style={{
            position: 'absolute',
            left: currentTheme.spacing[3],
            top: '50%',
            transform: 'translateY(-50%)',
            color: currentTheme.colors.text.secondary,
            display: 'flex',
            alignItems: 'center',
            pointerEvents: 'none',
            zIndex: 1,
          }}>
            {leftIcon}
          </div>
        )}
        <motion.input
          ref={ref}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          disabled={disabled}
          required={required}
          style={{
            ...inputStyles,
            paddingLeft: leftIcon ? `calc(${currentTheme.spacing[3]} + 24px)` : inputStyles.paddingLeft,
          }}
          whileFocus={{
            scale: 1.01,
            transition: { duration: 0.2 }
          }}
          {...props}
        />
      </div>

      {helperText && (
        <span style={helperTextStyles}>
          {helperText}
        </span>
      )}

      {error && (
        <motion.span
          style={errorStyles}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
        >
          {error}
        </motion.span>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;
