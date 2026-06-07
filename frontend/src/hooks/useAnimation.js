import { ANIMATION_DURATIONS, EASINGS } from '../utils/constants';

// Custom hook for consistent animations
export const useAnimation = () => {
  // Page transition variants
  const pageVariants = {
    initial: {
      opacity: 0,
      y: 10
    },
    in: {
      opacity: 1,
      y: 0
    },
    out: {
      opacity: 0,
      y: -10
    }
  };

  const pageTransition = {
    type: 'tween',
    ease: EASINGS.SMOOTH,
    duration: ANIMATION_DURATIONS.PAGE_TRANSITION
  };

  // Card entrance animation
  const cardVariants = {
    initial: {
      opacity: 0,
      y: 12,
      scale: 0.98
    },
    animate: {
      opacity: 1,
      y: 0,
      scale: 1
    },
    exit: {
      opacity: 0,
      y: -12,
      scale: 0.98
    }
  };

  const cardTransition = {
    type: 'tween',
    ease: EASINGS.EASE_OUT,
    duration: ANIMATION_DURATIONS.NORMAL
  };

  // Button press animation - subtle and professional
  const buttonTap = {
    tap: { scale: 0.97 },
    hover: { scale: 1.02 },
    rest: { scale: 1 }
  };

  // Success animation - gentle spring
  const successVariants = {
    initial: {
      scale: 0.8,
      opacity: 0
    },
    animate: {
      scale: 1,
      opacity: 1,
      transition: {
        type: 'spring',
        stiffness: 200,
        damping: 20
      }
    },
    exit: {
      scale: 0.8,
      opacity: 0
    }
  };

  // Slide in from right - smooth
  const slideInRight = {
    initial: { x: 100, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: 100, opacity: 0 }
  };

  // Slide in from left - smooth
  const slideInLeft = {
    initial: { x: -100, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: -100, opacity: 0 }
  };

  // Fade in up - gentle
  const fadeInUp = {
    initial: { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: -20, opacity: 0 }
  };

  // Stagger container for list animations
  const staggerContainer = {
    initial: { opacity: 0 },
    animate: {
      opacity: 1,
      transition: {
        staggerChildren: 0.06
      }
    },
    exit: { opacity: 0 }
  };

  // Stagger item for list children
  const staggerItem = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 }
  };

  // Pulse animation for loading - subtle
  const pulseVariants = {
    initial: { opacity: 1 },
    animate: {
      opacity: [0.6, 1, 0.6],
      transition: {
        duration: 2,
        repeat: Infinity,
        ease: EASINGS.GENTLE
      }
    }
  };

  // Gentle bounce for success states
  const bounceVariants = {
    initial: { scale: 1 },
    animate: {
      scale: [1, 1.05, 1],
      transition: {
        duration: 0.4,
        ease: EASINGS.EASE_OUT_BACK
      }
    }
  };

  // Micro interactions
  const microInteractions = {
    hover: {
      scale: 1.02,
      transition: {
        duration: ANIMATION_DURATIONS.MICRO,
        ease: EASINGS.EASE_OUT
      }
    },
    press: {
      scale: 0.98,
      transition: {
        duration: ANIMATION_DURATIONS.MICRO,
        ease: EASINGS.EASE_IN_OUT
      }
    }
  };

  return {
    // Page animations
    pageVariants,
    pageTransition,

    // Component animations
    cardVariants,
    cardTransition,
    buttonTap,

    // Special animations
    successVariants,
    slideInRight,
    slideInLeft,
    fadeInUp,

    // List animations
    staggerContainer,
    staggerItem,

    // Utility animations
    pulseVariants,
    bounceVariants,
    microInteractions,

    // Animation presets for common use cases
    presets: {
      // For page transitions
      pageTransition: {
        initial: pageVariants.initial,
        animate: pageVariants.in,
        exit: pageVariants.out,
        transition: pageTransition
      },

      // For cards
      cardEntrance: {
        initial: cardVariants.initial,
        animate: cardVariants.animate,
        exit: cardVariants.exit,
        transition: cardTransition
      },

      // For buttons
      buttonPress: buttonTap,

      // For lists
      listContainer: staggerContainer,
      listItem: staggerItem
    }
  };
};
