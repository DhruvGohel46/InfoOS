import { billingAPI } from '../utils/api';

/**
 * PRINTER SERVICE (FRONTEND)
 * Orchestrates the sequence of printing operations (Bill, KOT, or both)
 * Supports both Electron (Queue-based) and Web (Direct API) modes.
 */

/**
 * Extracts a clean, user-friendly error message from various error shapes.
 * Handles Electron's "Error invoking remote method" wrapper and raw Error objects.
 */
function extractPrintError(error, fallback = 'Printer error. Please check connections.') {
  if (!error) return fallback;

  const msg = typeof error === 'string' ? error : error.message || '';

  // Strip Electron's IPC wrapper: "Error invoking remote method 'print:kot': Error: <actual>"
  const ipcMatch = msg.match(/Error invoking remote method\s+'[^']+'\s*:\s*Error:\s*(.*)/i);
  if (ipcMatch) return ipcMatch[1].trim() || fallback;

  return msg || fallback;
}

/**
 * Validates the result returned by an Electron IPC print handler.
 * IPC handlers now return {success, error} instead of throwing.
 */
function validatePrintResult(result, label = 'Print') {
  if (!result || result.success === false) {
    const errorMsg = result?.error || `${label} failed. Please check printer settings.`;
    throw new Error(errorMsg);
  }
  return result;
}

export const printerService = {
  /**
   * Prints the Customer Bill
   */
  async printBill(billNo) {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.printBill(billNo);
        return validatePrintResult(result, 'Bill printing');
      }
      // Fallback for Web/Browser mode
      console.log('Web Mode: Printing Bill via API...');
      const response = await billingAPI.printBill(billNo);
      return response.data;
    } catch (error) {
      console.error('Failed to print bill:', error);
      throw new Error(extractPrintError(error, 'Failed to print bill. Please check printer.'));
    }
  },

  /**
   * Prints the Kitchen Order Ticket (KOT)
   */
  async printKOT(billNo) {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.printKOT(billNo);
        return validatePrintResult(result, 'KOT printing');
      }
      // Fallback for Web/Browser mode
      console.log('Web Mode: Printing KOT via API...');
      const response = await billingAPI.printKOT(billNo);
      return response.data;
    } catch (error) {
      console.error('Failed to print KOT:', error);
      throw new Error(extractPrintError(error, 'Failed to print KOT. Please check printer.'));
    }
  },

  /**
   * Sequential workflow: Bill -> Wait -> KOT
   */
  async printBillAndKOT(billNo) {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.printBillAndKOT(billNo);
        return validatePrintResult(result, 'Bill & KOT printing');
      }
      
      // Fallback for Web/Browser mode: Manual Sequence
      await this.printBill(billNo);
      await this.printKOT(billNo);
      
      return { success: true };
    } catch (error) {
      console.error('Failed to print Bill and KOT sequence:', error);
      throw new Error(extractPrintError(error, 'Failed to print Bill & KOT. Please check printer.'));
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
