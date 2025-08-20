// lib/indicator.ts

export function calculateEMA(data: number[], period: number): number {
  if (data.length < period) return NaN;
  const k = 2 / (period + 1);
  return data.reduce((prev, curr, i) => {
    if (i === 0) return curr;
    return curr * k + prev * (1 - k);
  }, data[0]);
}

export function calculateRSI(data: number[], period: number): number {
  if (data.length < period) return NaN;
  let gains = 0, losses = 0;
  for (let i = 1; i < period; i++) {
    const diff = data[i] - data[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const rs = gains / (losses || 1);
  return 100 - 100 / (1 + rs);
}

export function calculateMACD(data: number[]): { macd: number; signal: number; histogram: number } {
  if (data.length < 26) return { macd: NaN, signal: NaN, histogram: NaN };
  const ema12 = calculateEMA(data, 12);
  const ema26 = calculateEMA(data, 26);
  const macd = ema12 - ema26;
  const signal = calculateEMA([macd], 9);
  return { macd, signal, histogram: macd - signal };
}
