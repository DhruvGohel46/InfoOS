import { LocalProductService } from './LocalProductService';

export const ImportService = {
  importMenuFromJson: async (jsonData, masterName = "Master Franchise", menuVersion = "1.0.0") => {
    if (!jsonData || typeof jsonData !== 'object') {
      throw new Error("Invalid JSON menu file.");
    }
    
    const products = jsonData.products;
    if (!Array.isArray(products)) {
      throw new Error("Missing 'products' array in menu file.");
    }

    // Call the bulk import
    const result = await LocalProductService.bulkImport(products, 'json');
    return result;
  },

  importMenuFromFranchise: async (onlineMenuPackage) => {
    if (!onlineMenuPackage || !onlineMenuPackage.success) {
      throw new Error(onlineMenuPackage?.message || "Invalid online menu package.");
    }

    const { master_name, menu_version, menu } = onlineMenuPackage;
    if (!menu || !Array.isArray(menu.products)) {
      throw new Error("Master franchise menu is empty or invalid.");
    }

    // Call the bulk import
    const result = await LocalProductService.bulkImport(menu.products, 'json');
    return {
      ...result,
      master_name,
      menu_version
    };
  }
};
