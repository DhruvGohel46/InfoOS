import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IoInformationCircleOutline } from 'react-icons/io5';
import { useTheme } from '../../context/ThemeContext';

const InfoTooltip = ({
    title,
    content,
    icon,
    size = 17,
    color,
    hoverColor,
    width = '300px',
    placement = 'bottom',
    style = {},
    zIndex = 1000
}) => {
    const [isHovered, setIsHovered] = useState(false);
    const { isDark } = useTheme();

    const defaultColor = color || (isDark ? '#94A3B8' : '#64748B');
    const activeColor = hoverColor || 'var(--primary, #f97316)';

    // Positioning styles based on placement
    const getPlacementStyles = () => {
        switch (placement) {
            case 'top':
                return {
                    bottom: 'calc(100% + 8px)',
                    left: '50%',
                    transform: 'translateX(-50%)'
                };
            case 'left':
                return {
                    right: 'calc(100% + 8px)',
                    top: '50%',
                    transform: 'translateY(-50%)'
                };
            case 'right':
                return {
                    left: 'calc(100% + 8px)',
                    top: '50%',
                    transform: 'translateY(-50%)'
                };
            case 'bottom':
            default:
                return {
                    top: 'calc(100% + 8px)',
                    left: '0'
                };
        }
    };

    return (
        <div
            style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                cursor: 'pointer',
                verticalAlign: 'middle',
                ...style
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {icon ? (
                React.cloneElement(icon, {
                    size: icon.props.size || size,
                    style: {
                        color: isHovered ? activeColor : (icon.props.style?.color || defaultColor),
                        transition: 'color 0.15s ease',
                        ...icon.props.style
                    }
                })
            ) : (
                <IoInformationCircleOutline
                    size={size}
                    style={{
                        color: isHovered ? activeColor : defaultColor,
                        transition: 'color 0.15s ease'
                    }}
                />
            )}

            <AnimatePresence>
                {isHovered && content && (
                    <motion.div
                        initial={{ opacity: 0, y: placement === 'top' ? 4 : -4, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: placement === 'top' ? 4 : -4, scale: 0.96 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        style={{
                            position: 'absolute',
                            ...getPlacementStyles(),
                            width,
                            maxWidth: '90vw',
                            padding: '12px 14px',
                            borderRadius: '10px',
                            fontSize: '12px',
                            lineHeight: '1.5',
                            zIndex,
                            background: isDark ? '#1F2228' : '#FFFFFF',
                            color: isDark ? '#F1F5F9' : '#0F172A',
                            border: isDark ? '1px solid #3A3E48' : '1px solid #CBD5E1',
                            boxShadow: isDark
                                ? '0 10px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.5)'
                                : '0 10px 25px -5px rgba(15,23,42,0.15), 0 8px 10px -6px rgba(15,23,42,0.1)',
                            pointerEvents: 'none',
                            fontWeight: 400,
                            textAlign: 'left'
                        }}
                    >
                        {title && (
                            <div
                                style={{
                                    fontWeight: 700,
                                    marginBottom: '4px',
                                    color: 'var(--primary, #f97316)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <IoInformationCircleOutline size={15} />
                                {title}
                            </div>
                        )}
                        <div>{content}</div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default InfoTooltip;
