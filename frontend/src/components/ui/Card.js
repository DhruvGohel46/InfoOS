import React from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';


const Card = React.forwardRef(({
  children,
  variant = 'default',
  padding = 'md',
  shadow = 'card', // ReBill Default
  hover = false,
  className = '',
  onClick,
  fullHeight = false,
  style,
  ...props
}, ref) => {
  const { currentTheme, isDark } = useTheme();


  const paddingStyles = {
    none: '0',
    sm: '12px',
    md: '14px', // ReBill Standard
    lg: '18px', // Image Container
    xl: '24px',
  };

  const shadowStyles = {
    base: currentTheme.shadows.base,
    sm: currentTheme.shadows.sm,
    md: currentTheme.shadows.md,
    lg: currentTheme.shadows.lg,
    xl: currentTheme.shadows.xl,
    '2xl': currentTheme.shadows['2xl'],
    card: isDark ? currentTheme.shadows.cardDark : currentTheme.shadows.card,
    none: 'none',
  };

  const finalShadow = shadowStyles[shadow] || shadowStyles.card;

  const baseStyles = {
    background: currentTheme.colors.card,
    // ReBill Card Physics
    borderRadius: '16px',
    border: `1px solid ${isDark ? '#2C2F36' : '#E3E6EA'}`, // Specific border colors
    boxShadow: finalShadow,
    padding: paddingStyles[padding],
    fontFamily: currentTheme.typography.fontFamily.primary,
    height: fullHeight ? '100%' : 'auto',
    overflow: 'hidden',
    position: 'relative',
    transition: 'all 160ms cubic-bezier(.4,0,.2,1)', // Fast & Precise
    ...style
  };

  const hoverStyles = hover ? {
    cursor: onClick ? 'pointer' : 'default',
    // Hover styles handled by Framer Motion for hardware acceleration
  } : {};

  // Variant overrides
  const variantStyles = {
    elevated: {
      border: 'none',
    },
    outlined: {
      background: 'transparent',
      border: `2px solid ${currentTheme.colors.primary[200]}`,
    },
  };

  const combinedStyles = {
    ...baseStyles,
    ...(variantStyles[variant] || {}),
    ...hoverStyles,
    willChange: hover ? 'transform, box-shadow' : 'auto',
  };

  const MotionComponent = onClick || hover ? motion.div : 'div';

  // ReBill Signature Interaction
  const motionProps = onClick || hover ? {
    initial: false,
    whileHover: hover ? {
      y: -4,
      scale: 1.02,
      boxShadow: isDark ? currentTheme.shadows.cardDarkHover : currentTheme.shadows.cardHover,
      borderColor: currentTheme.colors.primary[500], // Subtle hint
      transition: { duration: 0.2, ease: "easeOut" }
    } : undefined,
    whileTap: onClick ? { scale: 0.96 } : undefined,
  } : {};

  return (
    <MotionComponent
      ref={ref}
      style={combinedStyles}
      className={className}
      onClick={onClick}
      {...motionProps}
      {...props}
    >
      {children}
    </MotionComponent>
  );
});

Card.displayName = 'Card';

export default Card;
