import { billingAPI, summaryAPI, getLocalDateString } from '../utils/api';
import { cloudSyncAPI, cloudAuthAPI } from './cloudApi';

const QUEUE_KEY = 'offline_bills_queue';

export const syncService = {
  /**
   * Add a failed bill creation request to the local queue.
   */
  addToQueue: (billData) => {
    try {
      const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      queue.push({
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        data: billData
      });
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      return true;
    } catch (e) {
      console.error('Failed to add bill to offline queue', e);
      return false;
    }
  },

  /**
   * Get the current offline queue.
   */
  getQueue: () => {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    } catch (e) {
      return [];
    }
  },

  /**
   * Attempt to sync all queued bills to the backend.
   * Modifies the queue in place, removing successful syncs.
   */
  syncOfflineBills: async () => {
    const queue = syncService.getQueue();
    if (queue.length === 0) return 0;

    let successCount = 0;
    const remainingQueue = [];

    for (const item of queue) {
      try {
        // Attempt to create the bill on the backend
        await billingAPI.createBill(item.data);
        successCount++;
      } catch (err) {
        // If it fails again due to network, keep it in the queue
        const status = err.response?.status;
        if (!status || status >= 500) {
          remainingQueue.push(item);
        } else {
          // If it's a 4xx error (validation, auth), discard it so it doesn't block forever
          console.error(`Offline bill ${item.id} rejected by server:`, err.message);
        }
      }
    }

    localStorage.setItem(QUEUE_KEY, JSON.stringify(remainingQueue));
    return successCount;
  },

  /**
   * Automatically sync weekly and monthly reports to Supabase
   * if they do not already exist.
   */
  syncWeeklyAndMonthlyReports: async () => {
    // Return early if client is offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }

    // Proactively refresh cloud session if online before starting report auto sync
    if (localStorage.getItem('cloud_refresh_token')) {
      try {
        await cloudAuthAPI.refreshSession();
      } catch (refreshErr) {
        console.warn('Auto-sync session refresh failed:', refreshErr);
      }
    }

    const token = localStorage.getItem('cloud_auth_token');
    if (!token) return;

    // Check if subscription is active
    let isSubscribed = false;
    try {
      const sub = await cloudSyncAPI.getSubscriptionStatus();
      if (sub && sub.subscriptionStatus === 'active') {
        isSubscribed = true;
      }
    } catch (err) {
      console.warn('Failed to verify subscription during auto sync (cloud server unreachable):', err.message || err);
      return;
    }

    if (!isSubscribed) return;

    // Decode token to get userId
    let userId = null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      userId = payload.sub;
    } catch (e) {
      console.error('Failed to parse token payload for auto sync:', e);
      return;
    }

    if (!userId) return;

    const now = new Date();

    // 1. Weekly Sync (Sync previous completed week + current week)
    try {
      const dayOfWeek = now.getDay();
      const daysSinceMonday = (dayOfWeek + 6) % 7;

      const currentWeekMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
      const currentWeekStartStr = getLocalDateString(currentWeekMonday);

      const prevWeekMonday = new Date(currentWeekMonday.getFullYear(), currentWeekMonday.getMonth(), currentWeekMonday.getDate() - 7);
      const prevWeekStartStr = getLocalDateString(prevWeekMonday);

      const weeksToSync = [prevWeekStartStr, currentWeekStartStr];

      for (const targetWeekStr of weeksToSync) {
        const summaryRes = await summaryAPI.getRangeSummary('week', targetWeekStr);
        if (summaryRes.data?.success && summaryRes.data.summary) {
          const summary = summaryRes.data.summary;
          const weekStartStr = summary.start_date;
          // Check if already uploaded
          const exists = await cloudSyncAPI.checkWeeklyReportExists(userId, weekStartStr, token);
          if (!exists) {
            const expenseDetails = (summary.expenses || []).map(e => ({
              name: e.name,
              amount: e.amount
            }));

            const payload = {
              userId,
              weekStartDate: weekStartStr,
              totalSales: summary.total_sales,
              totalExpenses: summary.total_expenses,
              salesDetails: (summary.products || []).map(p => ({
                name: p.name,
                amount: p.total_amount
              })),
              expenseDetails
            };

            await cloudSyncAPI.syncBackup(payload);
            console.log(`Auto-sync: Aggregated backup for week of ${weekStartStr} synced to cloud.`);
          }
        }
      }
    } catch (e) {
      console.error('Auto-sync weekly report failed:', e);
    }

    // 2. Monthly Sync (Sync previous completed month + current month)
    try {
      // Previous month 1st day (e.g. 2026-07-01 if now is in August 2026)
      const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthStartStr = getLocalDateString(prevMonthDate);

      // Current month 1st day (e.g. 2026-08-01 if now is in August 2026)
      const currentMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const currentMonthStartStr = getLocalDateString(currentMonthDate);

      const monthsToSync = [prevMonthStartStr, currentMonthStartStr];

      for (const targetMonthStr of monthsToSync) {
        const summaryRes = await summaryAPI.getRangeSummary('month', targetMonthStr);
        if (summaryRes.data?.success && summaryRes.data.summary) {
          const summary = summaryRes.data.summary;
          const monthStartStr = summary.start_date;
          // Check if already uploaded
          const exists = await cloudSyncAPI.checkMonthlyReportExists(userId, monthStartStr, token);
          if (!exists) {
            const expenseDetails = (summary.expenses || []).map(e => ({
              name: e.name,
              amount: e.amount
            }));

            const payload = {
              userId,
              monthStartDate: monthStartStr,
              totalSales: summary.total_sales,
              totalExpenses: summary.total_expenses,
              salesDetails: (summary.products || []).map(p => ({
                name: p.name,
                amount: p.total_amount
              })),
              expenseDetails
            };

            await cloudSyncAPI.syncMonthlyBackup(payload);
            console.log(`Auto-sync: Aggregated backup for month starting ${monthStartStr} synced to cloud.`);
          }
        }
      }
    } catch (e) {
      console.error('Auto-sync monthly report failed:', e);
    }
  }
};
