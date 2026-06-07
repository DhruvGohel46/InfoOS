'use client';

import { useState } from 'react';
import styles from './Showcase.module.css';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { Receipt, BarChart3, Package } from 'lucide-react';

const modules = [
  {
    id: 'billing',
    name: 'Smart Billing',
    icon: Receipt,
    image: '/images/billing.png',
    features: ['Category sidebar filtering', 'Product grid with images', 'Real-time cart management', 'One-click print & save'],
  },
  {
    id: 'analytics',
    name: 'Sales Analytics',
    icon: BarChart3,
    image: '/images/analytics.png',
    features: ['Daily / Weekly / Monthly views', 'Revenue tracking charts', 'Top products breakdown', 'Export to CSV'],
  },
  {
    id: 'inventory',
    name: 'Inventory Control',
    icon: Package,
    image: '/images/inventory.png',
    features: ['Real-time stock levels', 'Low-stock alerts', 'Category management', 'Bulk import/export'],
  },
];

export default function Showcase() {
  const [active, setActive] = useState(0);
  const mod = modules[active];

  return (
    <section id="showcase" className={styles.showcase}>
      <div className="section-container">
        <div className={styles.header}>
          <h2 className={styles.title}>
            See It <span className="title-highlight">In Action</span>
          </h2>
          <p className={styles.subtitle}>
            Every screen is designed for speed and clarity. No clutter, no learning curve.
          </p>
        </div>

        <div className={styles.tabs}>
          {modules.map((m, i) => (
            <button
              key={m.id}
              className={`${styles.tab} ${active === i ? styles.tabActive : ''}`}
              onClick={() => setActive(i)}
            >
              <m.icon size={18} />
              {m.name}
            </button>
          ))}
        </div>

        <div className={styles.display}>
          <AnimatePresence mode="wait">
            <motion.div
              key={mod.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className={styles.displayContent}
            >
              <div className={styles.windowFrame}>
                <div className={styles.windowHeader}>
                  <div className={styles.windowDots}>
                    <span className={`${styles.windowDot} ${styles.dotRed}`} />
                    <span className={`${styles.windowDot} ${styles.dotYellow}`} />
                    <span className={`${styles.windowDot} ${styles.dotGreen}`} />
                  </div>
                  <div className={styles.windowTitle}>InfoOS — {mod.name}</div>
                </div>
                <div className={styles.imageWrap}>
                  <Image
                    src={mod.image}
                    alt={mod.name}
                    width={800}
                    height={500}
                    className={styles.image}
                  />
                </div>
              </div>

              <div className={styles.featureList}>
                <h3>{mod.name}</h3>
                <ul>
                  {mod.features.map((f, i) => (
                    <li key={i}><span className={styles.listDot} />{f}</li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
