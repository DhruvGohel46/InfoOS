'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { User, Menu, X, ArrowRight } from 'lucide-react';
import styles from './Navbar.module.css';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

export default function Navbar({ onNavigate }) {
  const { data: session } = useSession();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState(null);

  const handleNav = (e, index) => {
    e.preventDefault();
    if (onNavigate) {
      onNavigate(index);
    }
    setIsMenuOpen(false);
  };

  const navLinks = [
    { name: 'Features', href: '#features', index: 1 },
    { name: 'Showcase', href: '#showcase', index: 2 },
    { name: 'How It Works', href: '#how-it-works', index: 3 },
    { name: 'Pricing', href: '#pricing', index: 4 }
  ];

  return (
    <motion.nav 
      className={styles.navbar}
      initial={{ y: -100, x: '-50%', opacity: 0 }}
      animate={{ y: 0, x: '-50%', opacity: 1 }}
      transition={{ type: 'spring', stiffness: 120, damping: 20 }}
    >
      <div className={styles.island}>
        <div className={styles.mainRow}>
          {/* Logo */}
          <Link href="/" onClick={(e) => handleNav(e, 0)} className={styles.logo}>
            <span className={styles.logoIcon}>✦</span>
            <span className={styles.logoText}>InfoOS</span>
          </Link>

          {/* Navigation Links - Desktop */}
          <div className={styles.desktopLinks}>
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                onClick={(e) => handleNav(e, link.index)}
                className={styles.navLink}
                onMouseEnter={() => setHoveredIndex(link.index)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <span className={styles.linkText}>{link.name}</span>
                {hoveredIndex === link.index && (
                  <motion.span
                    layoutId="navbarHoverHighlight"
                    className={styles.hoverHighlight}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </Link>
            ))}
          </div>

          {/* Action Button - Desktop */}
          <div className={styles.desktopAction}>
            {session ? (
              <Link href="/dashboard" className={styles.actionBtn}>
                <User size={14} />
                <span>Dashboard</span>
              </Link>
            ) : (
              <Link href="/login" className={styles.actionBtn}>
                <span>Sign In</span>
                <ArrowRight size={14} className={styles.actionArrow} />
              </Link>
            )}
          </div>

          {/* Menu Toggle - Mobile */}
          <button 
            className={styles.menuToggle} 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle Navigation Menu"
          >
            {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Mobile Dropdown Menu Inside the Island */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div 
              className={styles.mobileDropdown}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className={styles.mobileLinks}>
                {navLinks.map((link) => (
                  <Link 
                    key={link.name}
                    href={link.href} 
                    onClick={(e) => handleNav(e, link.index)}
                    className={styles.mobileNavLink}
                  >
                    {link.name}
                  </Link>
                ))}
                <div className={styles.mobileDivider} />
                {session ? (
                  <Link href="/dashboard" onClick={() => setIsMenuOpen(false)} className={styles.mobileActionBtn}>
                    <User size={16} />
                    <span>Dashboard</span>
                  </Link>
                ) : (
                  <Link href="/login" onClick={() => setIsMenuOpen(false)} className={styles.mobileActionBtn}>
                    <span>Sign In</span>
                    <ArrowRight size={16} />
                  </Link>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.nav>
  );
}
