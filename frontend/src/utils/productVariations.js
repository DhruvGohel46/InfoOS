export function getProductVariations(product) {
  const variations = product?.variations;
  if (!Array.isArray(variations)) return [];
  return variations.filter((v) => v?.name && v.price != null && v.price !== '');
}

export function hasVariations(product) {
  return getProductVariations(product).length > 0;
}

export function getCartLineKey(productId, variationId) {
  return variationId ? `${productId}::${variationId}` : productId;
}

export function buildCartItem(product, variation, orderType = 'dine-in') {
  const isTakeaway = orderType === 'takeaway';
  
  if (!variation) {
    const price = isTakeaway && product.takeaway_price ? Number(product.takeaway_price) : Number(product.price);
    return {
      ...product,
      price,
      quantity: 1,
      line_key: getCartLineKey(product.product_id),
    };
  }

  const price = Number(variation.price);
  return {
    ...product,
    variation_id: variation.id,
    variation_name: variation.name,
    name: `${product.name} (${variation.name})`,
    price,
    quantity: 1,
    line_key: getCartLineKey(product.product_id, variation.id),
  };
}

export function getDisplayPrice(product) {
  const variations = getProductVariations(product);
  if (variations.length === 0) return Number(product.price);
  return Math.min(...variations.map((v) => Number(v.price)));
}

export function formatProductPriceLabel(product, formatCurrency, orderType = 'dine-in') {
  const variations = getProductVariations(product);
  if (variations.length === 0) {
    const price = orderType === 'takeaway' && product.takeaway_price 
      ? Number(product.takeaway_price) 
      : Number(product.price);
    return formatCurrency(price);
  }

  const prices = variations.map((v) => Number(v.price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return formatCurrency(min);
  return `From ${formatCurrency(min)}`;
}

export function createEmptyVariation() {
  return {
    id: crypto.randomUUID(),
    name: '',
    price: '',
  };
}

export function sanitizeVariationsForSave(variations) {
  return (variations || [])
    .map((item, index) => ({
      id: item.id || crypto.randomUUID(),
      name: String(item.name || '').trim(),
      price: parseFloat(item.price),
      order: index,
    }))
    .filter((item) => item.name && !Number.isNaN(item.price) && item.price >= 0);
}

export function mapBillPayloadItems(orderItems) {
  return orderItems.map((item) => ({
    product_id: item.product_id,
    quantity: item.quantity,
    ...(item.variation_id ? { variation_id: item.variation_id } : {}),
  }));
}
