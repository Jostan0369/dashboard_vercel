// lib/indicator.ts

// ✅ Exponential Moving Average
export function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return NaN;

  const k = 2 / (period + 1);
  let ema = prices[0];

  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return parseFloat(ema.toFixed(2));
}

// ✅ Relative Strength Index
export function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return NaN;

  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) {
      gains += diff;
    } else {
      losses -= diff;
    }
  }

  if (losses === 0) return 100;

  const rs = gains / losses;
  const rsi = 100 - 100 / (1 + rs);

  return parseFloat(rsi.toFixed(2));
}

// ✅ MACD (Moving Average Convergence Divergence)
export function calculateMACD(
  prices: number[],
  shortPeriod: number = 12,
  longPeriod: number = 26,
  signalPeriod: number = 9
): { macd: number; signal: number; histogram: number } {
  if (prices.length < longPeriod + signalPeriod) {
    return { macd: NaN, signal: NaN, histogram: NaN };
  }

  const shortEMA = calculateEMA(prices, shortPeriod);
  const longEMA = calculateEMA(prices, longPeriod);

  const macd = shortEMA - longEMA;

  // Signal line = EMA of MACD values
  const macdSeries: number[] = [];
  for (let i = longPeriod; i < prices.length; i++) {
    const short = calculateEMA(prices.slice(0, i), shortPeriod);
    const long = calculateEMA(prices.slice(0, i), longPeriod);
    macdSeries.push(short - long);
  }

  const signal = calculateEMA(macdSeries, signalPeriod);
  const histogram = macd - signal;

  return {
    macd: parseFloat(macd.toFixed(2)),
    signal: parseFloat(signal.toFixed(2)),
    histogram: parseFloat(histogram.toFixed(2)),
  };
}
