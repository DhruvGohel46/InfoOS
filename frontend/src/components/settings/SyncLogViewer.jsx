import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import { mobileSyncAPI } from '../../api/mobileSync';
import { IoRefreshOutline, IoCheckmarkCircle, IoAlertCircle, IoTimeOutline } from 'react-icons/io5';

const STATUS_COLOR = {
  success: '#10b981',
  error:   '#ef4444',
  queued:  '#f59e0b',
};

const STATUS_ICON = {
  success: <IoCheckmarkCircle size={14} color="#10b981" />,
  error:   <IoAlertCircle    size={14} color="#ef4444" />,
  queued:  <IoTimeOutline    size={14} color="#f59e0b" />,
};

const SyncLogViewer = () => {
  const { isDark } = useTheme();
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await mobileSyncAPI.getLog(200);
      if (res.success) setLog(res.log || []);
    } catch (err) {
      console.error('SyncLogViewer load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const thBorder = `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Sync Log
          {!loading && (
            <span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--text-secondary)', marginLeft: '10px' }}>
              ({log.length} entries)
            </span>
          )}
        </h3>
        <button
          onClick={load}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 14px', borderRadius: '8px',
            background: 'none',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)'}`,
            color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px',
          }}
        >
          <IoRefreshOutline size={14} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading log…
        </div>
      ) : log.length === 0 ? (
        <div style={{
          padding: '48px', textAlign: 'center',
          background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
          borderRadius: '14px',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>📋</div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>No sync activity yet</div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '6px' }}>
            Sync log entries will appear here once workers start syncing.
          </div>
        </div>
      ) : (
        <div style={{
          borderRadius: '14px', overflow: 'hidden',
          border: thBorder,
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{
                background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                borderBottom: thBorder,
              }}>
                {['Time', 'Worker', 'Operation', 'Status', 'Details'].map(h => (
                  <th key={h} style={{
                    padding: '10px 14px', textAlign: 'left',
                    fontWeight: 600, fontSize: '12px',
                    color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {log.map((entry, i) => (
                <tr
                  key={entry.id}
                  style={{
                    borderBottom: i < log.length - 1 ? thBorder : 'none',
                    background: i % 2 === 0
                      ? 'transparent'
                      : (isDark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.015)'),
                  }}
                >
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: '12px' }}>
                    {entry.created_at
                      ? new Date(entry.created_at).toLocaleString(undefined, {
                          month: 'short', day: '2-digit',
                          hour: '2-digit', minute: '2-digit', second: '2-digit',
                        })
                      : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-primary)' }}>
                    <span style={{ fontWeight: 600 }}>{entry.worker_id || '—'}</span>
                    {entry.worker_name && entry.worker_name !== '—' && (
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 400, marginLeft: 6 }}>
                        {entry.worker_name}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: '20px', fontSize: '11px',
                      fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                      background: entry.operation === 'upsert'
                        ? 'rgba(99,102,241,0.12)'
                        : 'rgba(239,68,68,0.10)',
                      color: entry.operation === 'upsert' ? '#818cf8' : '#f87171',
                    }}>
                      {entry.operation}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '5px',
                      padding: '2px 8px', borderRadius: '20px', fontSize: '11px',
                      fontWeight: 600, textTransform: 'uppercase',
                      color: STATUS_COLOR[entry.status] || 'var(--text-secondary)',
                      background: `${STATUS_COLOR[entry.status] || '#94a3b8'}18`,
                    }}>
                      {STATUS_ICON[entry.status]}
                      {entry.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: '12px', maxWidth: '260px' }}>
                    <span style={{
                      display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {entry.message || '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
};

export default SyncLogViewer;

