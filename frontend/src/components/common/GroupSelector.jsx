import React, { useState, useEffect, useMemo } from 'react';
import GlobalSelect from '../ui/GlobalSelect';
import { useSettings } from '../../context/SettingsContext';
import { groupsAPI } from '../../utils/api';

/**
 * Shared GroupSelector component used across Bill Screen and Analytics/Sales Screen.
 * 
 * Features:
 * - Displays active/non-disabled item groups (with optional "All Groups" option).
 * - Keyboard shortcut (Ctrl key) to cycle through active groups (skipping 'All').
 * - Lock/Unlock functionality linked to `settings.lock_group_select`.
 * - Custom direction ('top' for bottom sidebar placement, 'bottom' for topbars).
 */
const GroupSelector = ({
  value,
  onChange,
  groups: propGroups = null,
  direction = 'bottom',
  showAllOption = true,
  placeholder = 'Select Group',
  locked: propLocked = null,
  lockedTooltip = 'Group selector locked. Press Ctrl key to change group.',
  enableKeyboardShortcut = true,
  className = '',
  style = {},
}) => {
  const { settings } = useSettings();
  const [internalGroups, setInternalGroups] = useState([]);

  const isLocked = propLocked !== null ? propLocked : (settings?.lock_group_select === 'true');

  // Load groups from API if not provided via props
  useEffect(() => {
    if (propGroups !== null) return;

    let isMounted = true;
    const fetchActiveGroups = async () => {
      try {
        const res = await groupsAPI.getAllGroups(false); // Active only
        if (isMounted) {
          setInternalGroups(res.data?.groups || []);
        }
      } catch (err) {
        console.error('GroupSelector: Failed to load active groups:', err);
      }
    };

    fetchActiveGroups();

    // Listen for catalog updates so group changes in Management/Settings reflect instantly
    const handleCatalogUpdate = () => {
      fetchActiveGroups();
    };

    window.addEventListener('pos-catalog-updated', handleCatalogUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener('pos-catalog-updated', handleCatalogUpdate);
    };
  }, [propGroups]);

  const activeGroups = useMemo(() => {
    const raw = propGroups !== null ? propGroups : internalGroups;
    return (raw || []).filter(g => g.is_active !== false && g.is_active !== 0 && !g.deleted_at);
  }, [propGroups, internalGroups]);

  // Options formatted for GlobalSelect
  const options = useMemo(() => {
    const opts = [];
    if (showAllOption) {
      opts.push({ label: 'All Groups', value: 'all' });
    }
    activeGroups.forEach(g => {
      opts.push({
        label: g.name,
        value: g.id.toString(),
      });
    });
    return opts;
  }, [activeGroups, showAllOption]);

  // Keyboard shortcut listener (Ctrl key) to cycle groups (skipping 'all')
  useEffect(() => {
    if (!enableKeyboardShortcut) return;

    const handleKeyDown = (e) => {
      // Ignore keypress if user is currently typing in an input, textarea, or contenteditable
      const activeElem = document.activeElement;
      const isTyping =
        activeElem &&
        (activeElem.tagName === 'INPUT' ||
          activeElem.tagName === 'TEXTAREA' ||
          activeElem.isContentEditable);

      if (isTyping) return;

      if (e.key === 'Control') {
        if (!activeGroups || activeGroups.length === 0) return;

        const currentValStr = (value || 'all').toString();
        const currentIndex = activeGroups.findIndex(
          (g) => g.id.toString() === currentValStr
        );

        if (currentIndex === -1) {
          // If on 'all' or not found, switch to first real group
          onChange(activeGroups[0].id.toString());
        } else {
          // Cycle to next group, wrapping around to activeGroups[0]
          const nextIndex = (currentIndex + 1) % activeGroups.length;
          onChange(activeGroups[nextIndex].id.toString());
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enableKeyboardShortcut, activeGroups, value, onChange]);

  return (
    <div className={`group-selector-container ${className}`} style={{ ...style }}>
      <GlobalSelect
        options={options}
        value={value ? value.toString() : (showAllOption ? 'all' : '')}
        onChange={(val) => onChange && onChange(val)}
        placeholder={placeholder}
        direction={direction}
        locked={isLocked}
        lockedTooltip={lockedTooltip}
        arrowIcon={
          isLocked ? (
            <span
              style={{
                fontSize: '11px',
                opacity: 0.45,
                color: 'var(--text-tertiary)',
                userSelect: 'none',
              }}
            />
          ) : (
            <span
              style={{
                fontSize: '10px',
                opacity: 0.25,
                color: 'var(--text-tertiary)',
                userSelect: 'none',
              }}
            >
              •
            </span>
          )
        }
        rotateArrow={false}
      />
    </div>
  );
};

export default GroupSelector;
