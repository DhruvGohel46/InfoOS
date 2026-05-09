import { printerService } from './printerService';

export const billPrinter = {
  async print(billNo) {
    return await printerService.printBill(billNo);
  }
};
