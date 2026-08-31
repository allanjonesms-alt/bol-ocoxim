export interface PixPricingResult {
  unitPrice: number;
  count: number;
  discountPercent: number;
  originalPrice: number;
  finalPrice: number;
}

export function calculatePixTicketPrice(count: number): PixPricingResult {
  const unitPrice = 1.00;
  const safeCount = Math.max(0, count || 0);
  let discountPercent = 0;

  if (safeCount >= 100) {
    discountPercent = 30;
  } else if (safeCount >= 50) {
    discountPercent = 20;
  } else if (safeCount >= 20) {
    discountPercent = 15;
  } else if (safeCount >= 10) {
    discountPercent = 10;
  } else if (safeCount >= 5) {
    discountPercent = 5;
  }

  const originalPrice = safeCount * unitPrice;
  const finalPrice = originalPrice * (1 - discountPercent / 100);

  return {
    unitPrice,
    count: safeCount,
    discountPercent,
    originalPrice,
    finalPrice
  };
}
