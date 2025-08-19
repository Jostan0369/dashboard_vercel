// utils/indicators.ts
// Pure TypeScript indicator helpers: EMA, RSI, MACD

function sma(values: number[], start: number, len: number): number {
  let s = 0;
  for (let i = start; i < start + len; i++) s += values[i];
  return s / len;
}

export function calculateEMA(values: number[], period: number): number {
  if (!Array.isArray(values) || values.length < period) return NaN;
  const k = 2 / (period + 1);
  let ema = sma(values, 0, period);
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

export function calculateRSI(values: number[], period = 14): number {
  if (!Array.isArray(values) || values.length < period + 1) return NaN;

  // Wilder's RSI
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d > 0) gain += d;
    else loss += -d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;

  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function emaSeries(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (!Array.isArray(values) || values.length < period) return out;
  let ema = sma(values, 0, period);
  out[period - 1] = ema;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

export function calculateMACD(values: number[], fast = 12, slow = 26, signal = 9) {
  if (!Array.isArray(values) || values.length < slow + signal) return { macd: NaN, signal: NaN, hist: NaN };

  const emaF = emaSeries(values, fast);
  const emaS = emaSeries(values, slow);
  const macdLine: number[] = [];
  const start = Math.max(fast, slow) - 1;
  for (let i = start; i < values.length; i++) {
    macdLine.push(emaF[i] - emaS[i]);
  }

  if (macdLine.length < signal) return { macd: NaN, signal: NaN, hist: NaN };
  const sigSeries = emaSeries(macdLine, signal);
  const macd = macdLine[macdLine.length - 1];
  const sig = sigSeries[sigSeries.length - 1];
  const hist = macd - sig;
  return { macd, signal: sig, hist };
}
