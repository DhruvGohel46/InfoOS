import { billingAPI } from './api';

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
  }
};
