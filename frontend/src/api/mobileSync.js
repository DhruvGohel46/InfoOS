import api from '../utils/api';

export const mobileSyncAPI = {

  /** Get current sync settings (anon key is masked). */
  getSettings: async () => {
    const res = await api.get('/api/mobile-sync/settings');
    return res.data;
  },

  /** Save settings. Pass only the fields you want to update. */
  saveSettings: async ({ enabled, supabase_url, supabase_anon_key }) => {
    const payload = {};
    if (enabled !== undefined) payload.enabled = enabled;
    if (supabase_url !== undefined) payload.supabase_url = supabase_url;
    if (supabase_anon_key !== undefined) payload.supabase_anon_key = supabase_anon_key;
    const res = await api.put('/api/mobile-sync/settings', payload);
    return res.data;
  },

  /** Current queue depth, last sync time, enabled flag. */
  getStatus: async () => {
    const res = await api.get('/api/mobile-sync/status');
    return res.data;
  },

  /** Push all workers to Supabase right now. */
  syncAll: async () => {
    const res = await api.post('/api/mobile-sync/sync-all');
    return res.data;
  },

  /** Retry all queued items now (called when network returns). */
  flushQueue: async () => {
    const res = await api.post('/api/mobile-sync/flush-queue');
    return res.data;
  },

  /** Last 200 sync log entries. */
  getLog: async (limit = 200) => {
    const res = await api.get(`/api/mobile-sync/log?limit=${limit}`);
    return res.data;
  },
};

