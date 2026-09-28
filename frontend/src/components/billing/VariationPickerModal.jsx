import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import { formatCurrency } from '../../utils/api';

const VariationPickerModal = ({ product, open, onClose, onSelect }) => {
  const { isDark } = useTheme();
  const variations = useMemo(() => product?.variations || [], [product?.variations]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [search, setSearch] = useState('');
  const searchRef = useRef(null);
  const listRef = useRef(null);

  const filteredVariations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return variations;
    return variations.filter((v) => v.name.toLowerCase().includes(query));
  }, [variations, search]);

  useEffect(() => {
    if (!open) return;
    setSelectedIndex(0);
    setSearch('');
    const timer = setTimeout(() => searchRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [open, product?.product_id]);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (filteredVariations.length === 0) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredVariations.length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const selected = filteredVariations[selectedIndex];
        if (selected) {
          onSelect(selected);
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, filteredVariations, selectedIndex, onClose, onSelect]);

  useEffect(() => {
    const active = listRef.current?.querySelector('[data-active="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, filteredVariations.length]);

  if (!open || !product) return null;

  const handleSelect = (variation) => {
    onSelect(variation);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isDark ? 'rgba(0, 0, 0, 0.65)' : 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(440px, 92vw)',
              maxHeight: '82vh',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '24px',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1.5px solid #E2E8F0',
              background: isDark ? '#16181D' : '#FFFFFF',
              boxShadow: isDark
                ? '0 25px 60px -10px rgba(0, 0, 0, 0.75), 0 0 1px 1px rgba(255, 255, 255, 0.08)'
                : '0 20px 50px -10px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(226, 232, 240, 0.8)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '24px 24px 14px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: isDark ? '#94A3B8' : '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Select Variation
              </div>
              <div style={{ marginTop: '6px', fontSize: '20px', fontWeight: 800, color: isDark ? '#FFFFFF' : '#0F172A', letterSpacing: '-0.01em' }}>
                {product.name}
              </div>
              {variations.length > 4 && (
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setSelectedIndex(0);
                  }}
                  placeholder="Search variations..."
                  style={{
                    width: '100%',
                    marginTop: '14px',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1.5px solid #CBD5E1',
                    background: isDark ? '#1E2128' : '#F8FAFC',
                    color: isDark ? '#FFFFFF' : '#0F172A',
                    outline: 'none',
                    fontSize: '14px'
                  }}
                />
              )}
            </div>

            <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '0 16px 14px' }}>
              {filteredVariations.length === 0 ? (
                <div style={{ padding: '24px 12px', textAlign: 'center', color: isDark ? '#94A3B8' : '#64748B', fontSize: '14px' }}>
                  No matching variations
                </div>
              ) : (
                filteredVariations.map((variation, index) => {
                  const active = index === selectedIndex;
                  return (
                    <button
                      key={variation.id}
                      type="button"
                      data-active={active ? 'true' : 'false'}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => handleSelect(variation)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        padding: '12px 16px',
                        marginBottom: '8px',
                        borderRadius: '14px',
                        border: active
                          ? '2px solid var(--primary-500)'
                          : isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1.5px solid #E2E8F0',
                        background: active
                          ? (isDark ? 'rgba(249, 115, 22, 0.14)' : '#FFF7ED')
                          : (isDark ? '#1A1D23' : '#F8FAFC'),
                        color: isDark ? '#FFFFFF' : '#0F172A',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 600, fontSize: '15px' }}>
                        <span
                          style={{
                            width: '16px',
                            height: '16px',
                            borderRadius: '50%',
                            border: active ? '5px solid var(--primary-500)' : `2px solid ${isDark ? '#4B5563' : '#CBD5E1'}`,
                            boxSizing: 'border-box',
                            flexShrink: 0,
                          }}
                        />
                        {variation.name}
                      </span>
                      <span style={{ fontWeight: 800, color: 'var(--primary-500)', fontSize: '15px' }}>
                        {formatCurrency(variation.price)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              padding: '16px 24px 20px',
              borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1.5px solid #E2E8F0',
              background: isDark ? 'rgba(255, 255, 255, 0.01)' : '#F8FAFC'
            }}>
              <button
                type="button"
                className="pmSecondaryBtn"
                onClick={onClose}
                style={{
                  background: isDark ? 'rgba(255, 255, 255, 0.08)' : '#FFFFFF',
                  color: isDark ? '#E2E8F0' : '#334155',
                  border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1.5px solid #CBD5E1',
                  borderRadius: '12px',
                  padding: '10px 20px',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="pmPrimaryCta"
                disabled={filteredVariations.length === 0}
                onClick={() => filteredVariations[selectedIndex] && handleSelect(filteredVariations[selectedIndex])}
                style={{
                  borderRadius: '12px',
                  padding: '10px 22px',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: filteredVariations.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: filteredVariations.length === 0 ? 0.6 : 1
                }}
              >
                Add
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default VariationPickerModal;
