export const ExportService = {
  exportMenu: (categories, products, settings = {}) => {
    const variants = [];
    const addons = [];
    
    products.forEach(p => {
      const pId = p.id || p.product_id || '';
      const pVariants = p.variants || p.variations || [];
      const pAddons = p.addons || [];

      if (Array.isArray(pVariants)) {
        pVariants.forEach(v => {
          variants.push({
            id: v.id || `${pId}_var_${v.name}`,
            product_id: pId,
            name: v.name,
            price: v.price
          });
        });
      }

      if (Array.isArray(pAddons)) {
        pAddons.forEach(a => {
          addons.push({
            id: a.id || `${pId}_add_${a.name}`,
            product_id: pId,
            name: a.name,
            price: a.price
          });
        });
      }
    });

    const menuPackage = {
      categories: categories.map(c => ({ 
        id: c.id, 
        name: c.name 
      })),
      subcategories: [],
      products: products.map(p => ({
        id: p.id || p.product_id || '',
        product_code: p.product_code || p.sku || '',
        name: p.name || '',
        category: p.category || p.category_name || '',
        description: p.description || '',
        price: typeof p.price === 'number' ? p.price : parseFloat(p.price || 0),
        image: p.image || p.image_filename || p.image_url || '',
        variants: p.variants || p.variations || [],
        addons: p.addons || [],
        available: p.available !== undefined ? !!p.available : (p.active !== undefined ? !!p.active : true)
      })),
      variants,
      addons,
      settings: {
        exported_at: new Date().toISOString(),
        version: new Date().toISOString().split('T')[0].replace(/-/g, '.'),
        ...settings
      }
    };

    // Download file
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(menuPackage, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `menu_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    return menuPackage;
  }
};
