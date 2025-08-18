// lib/ta.ts

export function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return NaN;
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return parseFloat(ema.toFixed(2));
}

export function calculateRSI(prices: number[], period: number): number {
  if (prices.length < period + 1) return NaN;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}

export function calculateMACD(prices: number[]) {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  if (isNaN(ema12) || isNaN(ema26)) return NaN;
  return parseFloat((ema12 - ema26).toFixed(2));
}
