import { printerService } from './printerService';

export const kotPrinter = {
  async print(billNo) {
    return await printerService.printKOT(billNo);
  }
};
