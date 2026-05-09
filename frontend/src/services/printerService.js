import { billingAPI } from '../utils/api';

/**
 * PRINTER SERVICE (FRONTEND)
 * Orchestrates the sequence of printing operations (Bill, KOT, or both)
 * Supports both Electron (Queue-based) and Web (Direct API) modes.
 */

export const printerService = {
  /**
   * Prints the Customer Bill
   */
  async printBill(billNo) {
    try {
      if (window.electronAPI) {
        return await window.electronAPI.printBill(billNo);
      }
      // Fallback for Web/Browser mode
      console.log('Web Mode: Printing Bill via API...');
      const response = await billingAPI.printBill(billNo);
      return response.data;
    } catch (error) {
      console.error('Failed to print bill:', error);
      throw error;
    }
  },

  /**
   * Prints the Kitchen Order Ticket (KOT)
   */
  async printKOT(billNo) {
    try {
      if (window.electronAPI) {
        return await window.electronAPI.printKOT(billNo);
      }
      // Fallback for Web/Browser mode
      console.log('Web Mode: Printing KOT via API...');
      // We need to add printKOT to billingAPI or call axios directly
      const response = await billingAPI.printKOT(billNo);
      return response.data;
    } catch (error) {
      console.error('Failed to print KOT:', error);
      throw error;
    }
  },

  /**
   * Sequential workflow: Bill -> Wait -> KOT
   */
  async printBillAndKOT(billNo) {
    try {
      if (window.electronAPI) {
        return await window.electronAPI.printBillAndKOT(billNo);
      }
      
      // Fallback for Web/Browser mode: Manual Sequence
      await this.printBill(billNo);
      await new Promise(r => setTimeout(r, 2000)); // Buffer wait for web mode
      await this.printKOT(billNo);
      
      return { success: true };
    } catch (error) {
      console.error('Failed to print Bill and KOT sequence:', error);
      throw error;
    }
  },

  /**
   * Checks if a print job is currently active
   */
  async isPrinting() {
    if (window.electronAPI) return await window.electronAPI.isPrinting();
    return false; // Web mode handles it via local state in component
  }
};
