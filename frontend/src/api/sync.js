import { billingAPI, summaryAPI } from '../utils/api';
import { expensesAPI } from './expenses';
import { cloudSyncAPI } from './cloudApi';

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
      console.error('Failed to verify subscription during auto sync:', err);
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

    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Weekly Sync
    try {
      const summaryRes = await summaryAPI.getRangeSummary('week', todayStr);
      if (summaryRes.data?.success) {
        const summary = summaryRes.data.summary;
        if (summary) {
          const weekStartStr = summary.start_date;
          // Check if already uploaded
          const exists = await cloudSyncAPI.checkWeeklyReportExists(userId, weekStartStr, token);
          if (!exists) {
            // Aggregate expenses and upload
            const expensesRes = await expensesAPI.getExpenses(200);
            const allExpenses = expensesRes.expenses || [];

            const startOfWeekTime = new Date(summary.start_date).getTime();
            const endOfWeekTime = new Date(summary.end_date).getTime() + (24 * 60 * 60 * 1000) - 1;

            const thisWeekExpenses = allExpenses.filter(e => {
              const eTime = new Date(e.date).getTime();
              return eTime >= startOfWeekTime && eTime <= endOfWeekTime;
            });

            const payload = {
              userId,
              weekStartDate: weekStartStr,
              totalSales: summary.total_sales,
              totalExpenses: summary.total_expenses,
              salesDetails: (summary.products || []).map(p => ({
                name: p.name,
                amount: p.total_amount
              })),
              expenseDetails: thisWeekExpenses.map(e => ({
                name: e.title,
                amount: e.amount
              }))
            };

            await cloudSyncAPI.syncBackup(payload);
            console.log(`Auto-sync: Aggregated backup for week of ${weekStartStr} synced to cloud.`);
          }
        }
      }
    } catch (e) {
      console.error('Auto-sync weekly report failed:', e);
    }

    // 2. Monthly Sync
    try {
      const summaryRes = await summaryAPI.getRangeSummary('month', todayStr);
      if (summaryRes.data?.success) {
        const summary = summaryRes.data.summary;
        if (summary) {
          const monthStartStr = summary.start_date;
          // Check if already uploaded
          const exists = await cloudSyncAPI.checkMonthlyReportExists(userId, monthStartStr, token);
          if (!exists) {
            // Aggregate expenses and upload
            const expensesRes = await expensesAPI.getExpenses(200);
            const allExpenses = expensesRes.expenses || [];

            const startOfMonthTime = new Date(summary.start_date).getTime();
            const endOfMonthTime = new Date(summary.end_date).getTime() + (24 * 60 * 60 * 1000) - 1;

            const thisMonthExpenses = allExpenses.filter(e => {
              const eTime = new Date(e.date).getTime();
              return eTime >= startOfMonthTime && eTime <= endOfMonthTime;
            });

            const payload = {
              userId,
              monthStartDate: monthStartStr,
              totalSales: summary.total_sales,
              totalExpenses: summary.total_expenses,
              salesDetails: (summary.products || []).map(p => ({
                name: p.name,
                amount: p.total_amount
              })),
              expenseDetails: thisMonthExpenses.map(e => ({
                name: e.title,
                amount: e.amount
              }))
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
