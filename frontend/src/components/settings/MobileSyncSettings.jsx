import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { mobileSyncAPI } from '../../api/mobileSync';
import { useNetwork } from '../../context/NetworkContext';
import SyncLogViewer from './SyncLogViewer';
import {
  IoPhonePortraitOutline,
  IoCloudUploadOutline,
  IoRefreshOutline,
  IoCheckmarkCircleOutline,
  IoAlertCircleOutline,
  IoInformationCircleOutline,
  IoEyeOutline,
  IoEyeOffOutline,
  IoListOutline,
} from 'react-icons/io5';

const MobileSyncSettings = () => {
  const { isDark } = useTheme();
  const { showSuccess, showError } = useAlert();
  const { isOnline } = useNetwork();

  // ── State ──────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [keySet, setKeySet] = useState(false);
  const [keyPreview, setKeyPreview] = useState('');
  const [showKey, setShowKey] = useState(false);

  const [status, setStatus] = useState({ queue_depth: 0, last_sync: null });
  const [showLog, setShowLog] = useState(false);

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [settingsRes, statusRes] = await Promise.all([
        mobileSyncAPI.getSettings(),
        mobileSyncAPI.getStatus(),
      ]);
      if (settingsRes.success) {
        setEnabled(settingsRes.enabled);
        setSupabaseUrl(settingsRes.supabase_url || '');
        setKeySet(settingsRes.supabase_anon_key_set);
        setKeyPreview(settingsRes.supabase_anon_key_preview || '');
      }
      if (statusRes.success) {
        setStatus(statusRes);
      }
    } catch (err) {
      console.error('MobileSyncSettings load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (enabled && !supabaseUrl) {
      showError('Please enter your Supabase Project URL before enabling sync.');
      return;
    }
    if (enabled && !keySet && !supabaseKey) {
      showError('Please enter your Supabase Anon Key before enabling sync.');
      return;
    }
    try {
      setSaving(true);
      const payload = { enabled, supabase_url: supabaseUrl };
      if (supabaseKey) payload.supabase_anon_key = supabaseKey;
      await mobileSyncAPI.saveSettings(payload);
      showSuccess('Mobile sync settings saved');
      setSupabaseKey(''); // clear the input — key is now stored
      await load();
    } catch (err) {
      showError(err?.response?.data?.error || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // ── Sync All ───────────────────────────────────────────────────────────────
  const handleSyncAll = async () => {
    try {
      setSyncing(true);
      const res = await mobileSyncAPI.syncAll();
      if (res.success) {
        showSuccess(
          `Sync complete — ${res.pushed} pushed, ${res.queued} queued, ${res.error} errors (of ${res.total} workers)`
        );
        await load();
      } else {
        showError(res.error || 'Sync failed');
      }
    } catch (err) {
      showError(err?.response?.data?.error || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  // ── Styles ─────────────────────────────────────────────────────────────────
  const card = {
    background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '20px',
  };

  const label = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    marginBottom: '8px',
  };

  const input = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '10px',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)'}`,
    background: isDark ? 'rgba(255,255,255,0.05)' : '#fff',
    color: 'var(--text-primary)',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const toggleWrap = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0',
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Loading mobile sync settings…
      </div>
    );
  }

  if (showLog) {
    return (
      <div>
        <button
          onClick={() => setShowLog(false)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px',
            padding: 0,
          }}
        >
          ← Back to Settings
        </button>
        <SyncLogViewer />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
        <div style={{
          width: 44, height: 44, borderRadius: '12px',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IoPhonePortraitOutline size={22} color="#fff" />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Mobile App Sync
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
            Sync workers to Supabase so your future mobile app can read them
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div style={{
        ...card,
        background: isDark ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.06)',
        border: '1px solid rgba(99,102,241,0.25)',
        display: 'flex', gap: '12px', alignItems: 'flex-start',
      }}>
        <IoInformationCircleOutline size={20} color="#6366f1" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Offline-first & safe.</strong>{' '}
          Sync runs in the background and never slows down billing. If the internet is down,
          changes are queued and sent automatically when connection returns.
          Payroll data (salary &amp; advances) is <em>prepared but not synced yet</em> — you decide when to enable it.
        </div>
      </div>

      {/* Enable / Disable toggle */}
      <div style={card}>
        <div style={toggleWrap}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Enable Mobile Sync
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {enabled ? 'Workers are synced to Supabase on every change' : 'Currently OFF — no data is sent to Supabase'}
            </div>
          </div>
          {/* Toggle switch */}
          <div
            onClick={() => setEnabled(e => !e)}
            style={{
              width: 48, height: 26, borderRadius: 13, cursor: 'pointer',
              background: enabled ? '#6366f1' : (isDark ? '#374151' : '#d1d5db'),
              position: 'relative', transition: 'background 0.2s',
              flexShrink: 0,
            }}
          >
            <div style={{
              position: 'absolute', top: 3,
              left: enabled ? 25 : 3,
              width: 20, height: 20, borderRadius: '50%',
              background: '#fff', transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </div>
        </div>
      </div>

      {/* Supabase credentials */}
      <div style={card}>
        <h3 style={{ margin: '0 0 20px', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Supabase Connection
        </h3>

        <div style={{ marginBottom: '18px' }}>
          <label style={label}>Supabase Project URL</label>
          <input
            style={input}
            type="url"
            placeholder="https://xxxxxxxxxxxx.supabase.co"
            value={supabaseUrl}
            onChange={e => setSupabaseUrl(e.target.value)}
          />
        </div>

        <div>
          <label style={label}>
            Supabase Anon Key{' '}
            <span style={{ fontWeight: 400, fontSize: '11px', color: 'var(--text-tertiary)' }}>
              (public — safe to store here)
            </span>
          </label>
          <div style={{ position: 'relative' }}>
            <input
              style={{ ...input, paddingRight: '42px' }}
              type={showKey ? 'text' : 'password'}
              placeholder={keySet ? keyPreview || '••••••••••••••••' : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…'}
              value={supabaseKey}
              onChange={e => setSupabaseKey(e.target.value)}
            />
            <button
              onClick={() => setShowKey(s => !s)}
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-secondary)', padding: 0,
              }}
            >
              {showKey ? <IoEyeOffOutline size={16} /> : <IoEyeOutline size={16} />}
            </button>
          </div>
          {keySet && !supabaseKey && (
            <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <IoCheckmarkCircleOutline size={13} /> Key is already saved. Leave blank to keep the existing key.
            </p>
          )}
        </div>

        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '10px 22px', borderRadius: '10px',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
              fontWeight: 600, fontSize: '14px', opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Sync actions */}
      {enabled && (
        <div style={card}>
          <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Sync Actions
          </h3>

          {/* Status row */}
          <div style={{
            display: 'flex', gap: '16px', marginBottom: '20px',
            flexWrap: 'wrap',
          }}>
            <div style={{
              flex: 1, minWidth: 140, padding: '14px', borderRadius: '12px',
              background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}`,
            }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Queue</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: status.queue_depth > 0 ? '#f59e0b' : '#10b981' }}>
                {status.queue_depth}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>pending item{status.queue_depth !== 1 ? 's' : ''}</div>
            </div>

            <div style={{
              flex: 1, minWidth: 140, padding: '14px', borderRadius: '12px',
              background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}`,
            }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Last Sync</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {status.last_sync
                  ? new Date(status.last_sync).toLocaleString()
                  : '—'}
              </div>
            </div>

            <div style={{
              flex: 1, minWidth: 140, padding: '14px', borderRadius: '12px',
              background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}`,
            }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Network</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: isOnline ? '#10b981' : '#ef4444',
                }} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>
          </div>

          {!isOnline && (
            <div style={{
              padding: '12px 16px', borderRadius: '10px', marginBottom: '16px',
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              display: 'flex', gap: '10px', alignItems: 'center',
            }}>
              <IoAlertCircleOutline size={18} color="#ef4444" />
              <span style={{ fontSize: '13px', color: '#ef4444' }}>
                You are offline. Changes will be queued and synced when internet returns.
              </span>
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={handleSyncAll}
              disabled={syncing || !isOnline}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 20px', borderRadius: '10px',
                background: syncing ? 'rgba(99,102,241,0.4)' : 'rgba(99,102,241,0.15)',
                border: '1px solid rgba(99,102,241,0.4)',
                color: '#6366f1', cursor: (syncing || !isOnline) ? 'not-allowed' : 'pointer',
                fontWeight: 600, fontSize: '14px',
                opacity: !isOnline ? 0.5 : 1,
              }}
            >
              <IoCloudUploadOutline size={16} />
              {syncing ? 'Syncing…' : 'Sync All Workers Now'}
            </button>

            <button
              onClick={() => setShowLog(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 20px', borderRadius: '10px',
                background: 'none',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)'}`,
                color: 'var(--text-secondary)', cursor: 'pointer',
                fontWeight: 500, fontSize: '14px',
              }}
            >
              <IoListOutline size={16} />
              View Sync Log
            </button>

            <button
              onClick={load}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '10px 16px', borderRadius: '10px',
                background: 'none',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)'}`,
                color: 'var(--text-secondary)', cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              <IoRefreshOutline size={15} />
              Refresh
            </button>
          </div>
        </div>
      )}

      {/* Payroll notice */}
      <div style={{
        ...card,
        background: isDark ? 'rgba(245,158,11,0.06)' : 'rgba(245,158,11,0.05)',
        border: '1px solid rgba(245,158,11,0.2)',
        display: 'flex', gap: '12px', alignItems: 'flex-start',
      }}>
        <IoInformationCircleOutline size={20} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Payroll sync (salary &amp; advances)</strong> is prepared
          in the database but not yet active. When you are ready to let workers view their salary
          history in the mobile app, let us know and we will enable it.
        </div>
      </div>
    </motion.div>
  );
};

export default MobileSyncSettings;

