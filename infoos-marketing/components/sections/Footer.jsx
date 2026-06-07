'use client';

import styles from './Footer.module.css';
import { Layout } from 'lucide-react';
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className="section-container">
        <div className={styles.ctaSection}>
          <h2 className={styles.ctaTitle}>Start Managing Your <br /><span className="text-gradient">Business Smarter Today</span></h2>
          <Link href="#" className={styles.ctaButton}>
            Download InfoOS for Windows
          </Link>
        </div>
        
        <div className={styles.main}>
          <div className={styles.brand}>
            <Link href="/" className={styles.logo}>
              <Layout size={28} className={styles.logoIcon} />
              <span>InfoOS</span>
            </Link>
            <p className={styles.tagline}>The modern operating system for retail excellence.</p>
          </div>
          
          <div className={styles.links}>
            <div className={styles.group}>
              <h4>Product</h4>
              <Link href="#features">Features</Link>
              <Link href="#showcase">Showcase</Link>
              <Link href="#pricing">Pricing</Link>
            </div>
            <div className={styles.group}>
              <h4>Resources</h4>
              <Link href="#">Documentation</Link>
              <Link href="#">Installation Guide</Link>
            </div>
            <div className={styles.group}>
              <h4>Company</h4>
              <Link href="#">About</Link>
              <Link href="#">Contact</Link>
              <Link href="#">Privacy</Link>
            </div>
          </div>
        </div>
        
        <div className={styles.bottom}>
          <p>© 2026 InfoOS POS. Built by engineers for real businesses.</p>
        </div>

        <div className={styles.designCredits}>
          <p>
            Designed with inspiration from the engineering aesthetics of{' '}
            <a href="https://stripe.com" target="_blank" rel="noopener noreferrer" className={styles.creditLink}>Stripe</a> (fluid UI & transitions),{' '}
            <a href="https://linear.app" target="_blank" rel="noopener noreferrer" className={styles.creditLink}>Linear</a> (dark control-center layouts),{' '}
            <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className={styles.creditLink}>Vercel</a> (crisp typography), and{' '}
            <a href="https://apple.com" target="_blank" rel="noopener noreferrer" className={styles.creditLink}>Apple</a> (liquid glassmorphism).
          </p>
        </div>
      </div>
    </footer>
  );
}
