/**
 * =============================================================================
 * LIQUID GLASS CARD COMPONENT - LIQUID-GLASS-CARD.JSX
 * =============================================================================
 * 
 * ROLE: Premium glass morphism card component for the Liquid Glass Design System
 * 
 * RESPONSIBILITIES:
 * - Provide consistent glass morphism styling across all cards
 * - Implement soft rounded shapes with proper border radius
 * - Add subtle hover animations and micro-interactions
 * - Support different card variants (default, elevated, interactive)
 * - Ensure proper backdrop blur and transparency effects
 * 
 * DESIGN FEATURES:
 * - Glass morphism background with blur effects
 * - Soft rounded corners (no sharp edges)
 * - Gentle shadows for depth and floating effect
 * - Smooth hover animations with lift effect
 * - Theme-aware styling (light/dark modes)
 * - Proper spacing and padding system
 * 
 * VARIANTS:
 * - default: Standard glass card
 * - elevated: Higher shadow and more prominent
 * - interactive: Added hover animations
 * - compact: Smaller padding for tight spaces
 * 
 * USAGE:
 * <LiquidGlassCard variant="elevated" hover={true}>
 *   <div>Card content</div>
 * </LiquidGlassCard>
 * =============================================================================
 */

import React from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';

const LiquidGlassCard = ({
  children,
  variant = 'default',
  hover = true,
  className = '',
  style = {},
  onClick,
  ...props
}) => {
  useTheme();

  const cardVariants = {
    default: {
      backgroundImage: 'var(--glass-card)',
      boxShadow: 'var(--shadow-card)',
      border: '1px solid var(--glass-border)',
    },
    elevated: {
      backgroundImage: 'var(--glass-card)',
      boxShadow: 'var(--shadow-hover)',
      border: '1px solid var(--glass-border)',
    },
    interactive: {
      backgroundImage: 'var(--glass-card)',
      boxShadow: 'var(--shadow-card)',
      border: '1px solid var(--glass-border)',
    },
    compact: {
      backgroundImage: 'var(--glass-card)',
      boxShadow: 'var(--shadow-card)',
      border: '1px solid var(--glass-border)',
    }
  };

  const hoverProps = hover ? {
    whileHover: {
      transform: 'var(--hover-lift)',
      boxShadow: 'var(--shadow-hover)',
      transition: { duration: 0.25, ease: 'easeOut' }
    },
    whileTap: {
      transform: 'var(--active-scale)',
      transition: { duration: 0.15, ease: 'easeInOut' }
    }
  } : {};

  const paddingStyles = {
    default: { padding: 'var(--spacing-card-padding)' },
    elevated: { padding: 'var(--spacing-6)' },
    interactive: { padding: 'var(--spacing-card-padding)' },
    compact: { padding: 'var(--spacing-4)' }
  };

  return (
    <motion.div
      className={`glass-card liquid-glass-card rounded-card ${className}`}
      style={{
        ...cardVariants[variant],
        ...paddingStyles[variant],
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all var(--transition-normal) var(--ease-out)',
        ...style
      }}
      onClick={onClick}
      {...hoverProps}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export default LiquidGlassCard;
