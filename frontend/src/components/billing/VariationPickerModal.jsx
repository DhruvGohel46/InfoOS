import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency } from '../../utils/api';

const VariationPickerModal = ({ product, open, onClose, onSelect }) => {
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
            backgroundColor: 'rgba(22, 26, 32, 0.72)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(420px, 92vw)',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '18px',
              border: '1px solid var(--glass-border)',
              background: 'var(--glass-panel)',
              boxShadow: 'var(--shadow-xl)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '20px 20px 12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Select Variation
              </div>
              <div style={{ marginTop: '6px', fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>
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
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--glass-border)',
                    background: 'var(--glass-card)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
              )}
            </div>

            <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
              {filteredVariations.length === 0 ? (
                <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
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
                        padding: '12px 14px',
                        marginBottom: '8px',
                        borderRadius: '12px',
                        border: active ? '2px solid var(--primary-500)' : '1px solid var(--glass-border)',
                        background: active ? 'rgba(249, 115, 22, 0.08)' : 'var(--glass-card)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 600 }}>
                        <span
                          style={{
                            width: '16px',
                            height: '16px',
                            borderRadius: '50%',
                            border: active ? '5px solid var(--primary-500)' : '2px solid var(--text-tertiary)',
                            boxSizing: 'border-box',
                            flexShrink: 0,
                          }}
                        />
                        {variation.name}
                      </span>
                      <span style={{ fontWeight: 800, color: 'var(--primary-500)' }}>
                        {formatCurrency(variation.price)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '12px 20px 20px', borderTop: '1px solid var(--glass-border)' }}>
              <button type="button" className="pmSecondaryBtn" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="pmPrimaryCta"
                disabled={filteredVariations.length === 0}
                onClick={() => filteredVariations[selectedIndex] && handleSelect(filteredVariations[selectedIndex])}
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
