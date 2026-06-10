import React from 'react';
import { motion } from 'framer-motion';

const MotionIcon = React.forwardRef(({
    icon: IconComponent,
    children,
    animateType = 'scale', // 'scale' | 'spin' | 'wiggle' | 'bounce' | 'pulse'
    style,
    size,
    ...props
}, ref) => {
    
    const getVariants = () => {
        switch (animateType) {
            case 'spin':
                return {
                    hover: { rotate: 360, transition: { duration: 0.6, ease: "easeInOut" } }
                };
            case 'wiggle':
                return {
                    hover: {
                        rotate: [0, -12, 12, -12, 12, 0],
                        transition: { duration: 0.45, ease: "easeInOut" }
                    }
                };
            case 'bounce':
                return {
                    hover: {
                        y: [0, -6, 0],
                        transition: { duration: 0.4, ease: "easeInOut" }
                    }
                };
            case 'pulse':
                return {
                    hover: {
                        scale: 1.18,
                        transition: { duration: 0.35, ease: "easeInOut" }
                    }
                };
            case 'scale':
            default:
                return {
                    hover: {
                        scale: 1.15,
                        transition: { type: "spring", stiffness: 350, damping: 14 }
                    }
                };
        }
    };

    const renderIcon = () => {
        if (IconComponent) {
            return <IconComponent size={size} />;
        }
        if (size && React.isValidElement(children)) {
            return React.cloneElement(children, { size, ...children.props });
        }
        return children;
    };

    return (
        <motion.div
            ref={ref}
            whileHover="hover"
            whileTap={{ scale: 0.92 }}
            variants={getVariants()}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                ...style
            }}
            {...props}
        >
            {renderIcon()}
        </motion.div>
    );
});

MotionIcon.displayName = 'MotionIcon';

export default MotionIcon;
