const { ipcMain } = require('electron');
const http = require('http');

class PrinterManager {
  constructor() {
    this.queue = [];
    this.isPrinting = false;
    this.apiBaseUrl = 'http://localhost:5050';
  }

  async addJob(type, billNo, payload = {}) {
    return new Promise((resolve, reject) => {
      this.queue.push({ type, billNo, payload, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isPrinting || this.queue.length === 0) return;

    this.isPrinting = true;
    const job = this.queue.shift();

    try {
      const path = job.type === 'bill' 
        ? `/api/bill/print/${job.billNo}` 
        : `/api/bill/print-kot/${job.billNo}`;

      console.log(`[PrinterManager] Printing ${job.type} for bill #${job.billNo}...`);
      
      const response = await this._makeRequest(path, job.payload);
      
      if (response.success) {
        console.log(`[PrinterManager] ${job.type} printed successfully.`);
        job.resolve(response);
      } else {
        throw new Error(response.error || response.message || 'Printing failed');
      }
    } catch (error) {
      console.error(`[PrinterManager] Error printing ${job.type}:`, error.message);
      job.reject(error);
    } finally {
      this.isPrinting = false;
      this.processQueue();
    }
  }

  _makeRequest(path, payload = {}) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(payload || {});
      const options = {
        hostname: '127.0.0.1',
        port: 5050,
        path: path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 20000 // 20 second timeout for HTML-to-PNG rendering
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Invalid response from print server'));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Print server is not responding. Please check if the backend is running.'));
      });

      req.on('error', (e) => {
        if (e.code === 'ECONNREFUSED') {
          reject(new Error('Cannot connect to print server. Please restart the application.'));
        } else {
          reject(new Error(`Printer connection error: ${e.message}`));
        }
      });

      req.write(postData);
      req.end();
    });
  }

  setupHandlers() {
    // All handlers return {success, error} instead of throwing,
    // which prevents Electron's "Error invoking remote method" wrapper.
    ipcMain.handle('print:bill', async (event, billNo, options) => {
      try {
        return await this.addJob('bill', billNo, options);
      } catch (error) {
        console.error('[PrinterManager] IPC print:bill error:', error.message);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('print:kot', async (event, billNo, options) => {
      try {
        return await this.addJob('kot', billNo, options);
      } catch (error) {
        console.error('[PrinterManager] IPC print:kot error:', error.message);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('print:billAndKOT', async (event, billNo, options) => {
      try {
        const billResult = await this.addJob('bill', billNo, options);
        const kotResult = await this.addJob('kot', billNo, options);
        return { success: true, billResult, kotResult };
      } catch (error) {
        console.error('[PrinterManager] IPC print:billAndKOT error:', error.message);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('print:isPrinting', () => this.isPrinting);
  }
}

module.exports = new PrinterManager();
