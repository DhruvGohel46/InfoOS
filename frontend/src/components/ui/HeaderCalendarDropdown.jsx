import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { IoChevronBack, IoChevronForward, IoCalendarOutline } from 'react-icons/io5';

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function HeaderCalendarDropdown({ onClose, isDark = true }) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const monthName = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  // Calculations for month grid
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  const handlePrevMonth = (e) => {
    e.stopPropagation();
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = (e) => {
    e.stopPropagation();
    setViewDate(new Date(year, month + 1, 1));
  };

  const handleJumpToToday = (e) => {
    e.stopPropagation();
    const now = new Date();
    setViewDate(now);
    setSelectedDate(now);
  };

  const handleSelectDay = (day) => {
    setSelectedDate(new Date(year, month, day));
  };

  // Formatted selected string for footer
  const selectedFormatted = selectedDate.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: 'calc(100% + 10px)',
        right: 0,
        zIndex: 9999,
        width: '310px',
        borderRadius: '20px',
        background: isDark ? 'rgba(20, 22, 28, 0.94)' : 'rgba(255, 255, 255, 0.96)',
        border: isDark ? '1.5px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(226, 232, 240, 0.9)',
        boxShadow: isDark
          ? '0 24px 60px -10px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.06)'
          : '0 24px 50px -10px rgba(15, 23, 42, 0.16), 0 0 0 1px rgba(0, 0, 0, 0.04)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        padding: '18px',
        userSelect: 'none',
      }}
    >
      {/* Month Navigation Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h4 style={{
            margin: 0,
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
          }}>
            {monthName}
          </h4>
          {!isCurrentMonth && (
            <button
              onClick={handleJumpToToday}
              style={{
                background: 'var(--primary-500)',
                color: '#FFF',
                border: 'none',
                borderRadius: '999px',
                padding: '2px 8px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Today
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={handlePrevMonth}
            title="Previous Month"
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <IoChevronBack size={15} />
          </button>
          <button
            onClick={handleNextMonth}
            title="Next Month"
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <IoChevronForward size={15} />
          </button>
        </div>
      </div>

      {/* Weekday Names */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: '4px',
        textAlign: 'center',
        marginBottom: '8px',
      }}>
        {DAYS_OF_WEEK.map((d, i) => (
          <span
            key={d}
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: i === 0 || i === 6 ? 'var(--text-tertiary)' : 'var(--text-secondary)',
              opacity: 0.75,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {d}
          </span>
        ))}
      </div>

      {/* Days Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: '4px',
      }}>
        {/* Leading empty slots */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} style={{ height: '34px' }} />
        ))}

        {/* Days of month */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const d = i + 1;
          const isToday = isCurrentMonth && today.getDate() === d;
          const isSelected =
            selectedDate.getFullYear() === year &&
            selectedDate.getMonth() === month &&
            selectedDate.getDate() === d;

          let bg = 'transparent';
          let color = 'var(--text-primary)';
          let border = '1px solid transparent';
          let shadow = 'none';

          if (isToday) {
            bg = 'var(--primary-500)';
            color = '#FFFFFF';
            border = '1px solid var(--primary-400)';
            shadow = '0 0 10px rgba(249, 115, 22, 0.4)';
          } else if (isSelected) {
            bg = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';
            border = '1px solid var(--primary-500)';
            color = 'var(--primary-400)';
          }

          return (
            <button
              key={d}
              onClick={() => handleSelectDay(d)}
              style={{
                height: '34px',
                borderRadius: '8px',
                border,
                background: bg,
                color,
                boxShadow: shadow,
                fontSize: '13px',
                fontWeight: isToday || isSelected ? 700 : 500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.12s ease',
              }}
              onMouseEnter={(e) => {
                if (!isToday && !isSelected) {
                  e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isToday && !isSelected) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {d}
            </button>
          );
        })}
      </div>

      {/* Footer Details */}
      <div style={{
        marginTop: '16px',
        paddingTop: '12px',
        borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(226, 232, 240, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
          <IoCalendarOutline size={14} color="var(--primary-500)" />
          <span style={{ fontWeight: 600 }}>{selectedFormatted}</span>
        </div>

        <button
          onClick={onClose}
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            padding: '3px 10px',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </motion.div>
  );
}
