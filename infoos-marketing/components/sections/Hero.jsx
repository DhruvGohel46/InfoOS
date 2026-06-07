'use client';

import styles from './Hero.module.css';
import Button from '../common/Button';
import { motion, useScroll, useTransform } from 'framer-motion';
import Image from 'next/image';
import { useRef } from 'react';

export default function Hero() {

  return (
    <section className={styles.hero}>
      <div className={styles.glowOrb1} />
      <div className={styles.glowOrb2} />

      <div className={`section-container ${styles.container}`}>
        <div className={styles.content}>
          <div className={styles.badge}>✦ Smart POS for Modern Retail</div>
          <h1 className={styles.headline}>
            The Operating System<br />
            for Your <span className="title-highlight">Retail Business</span>
          </h1>
          <p className={styles.description}>
            InfoOS simplifies billing, automates inventory, and gives you deep sales analytics -
            all from one elegant interface. Built for shop owners who demand speed and precision.
          </p>
          <div className={styles.ctas}>
            <Button variant="primary" size="lg">Get Started Free</Button>
            <Button variant="secondary" size="lg">Watch Demo</Button>
          </div>
        </div>

        <div className={styles.imageSide}>
          <div className={styles.mockupGlow} />
          <div className={styles.mockupContainer}>
            <Image 
              src="/images/billing.png" 
              alt="InfoOS Platform" 
              width={800} 
              height={500} 
              className={styles.mockup}
              priority
            />
          </div>
        </div>
      </div>
    </section>
  );
}
