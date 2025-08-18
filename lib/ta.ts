// lib/ta.ts
// Pure, lightweight TA utils (Wilder RSI, standard EMA/MACD)

function sma(values: number[], start: number, len: number): number {
  let s = 0;
  for (let i = 0; i < len; i++) s += values[start + i];
  return s / len;
}

export function lastEMA(closes: number[], period: number): number {
  if (!Array.isArray(closes) || closes.length < period) return NaN;
  const k = 2 / (period + 1);
  // init with SMA
  let ema = sma(closes, 0, period);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

export function lastRSI(closes: number[], period = 14): number {
  if (!Array.isArray(closes) || closes.length < period + 1) return NaN;

  // Wilder’s RSI
  let gain = 0, loss = 0;
  // initial averages
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gain += change; else loss -= change;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const g = change > 0 ? change : 0;
    const l = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function lastMACD(
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9
): { macd: number; signal: number; hist: number } {
  if (!Array.isArray(closes) || closes.length < slow + signal) {
    return { macd: NaN, signal: NaN, hist: NaN };
  }

  // Helper to compute rolling EMA series starting from SMA seed
  function emaSeries(src: number[], period: number): number[] {
    if (src.length < period) return [];
    const k = 2 / (period + 1);
    const out: number[] = new Array(src.length).fill(NaN);
    let ema = sma(src, 0, period);
    out[period - 1] = ema;
    for (let i = period; i < src.length; i++) {
      ema = src[i] * k + ema * (1 - k);
      out[i] = ema;
    }
    return out;
  }

  const emaF = emaSeries(closes, fast);
  const emaS = emaSeries(closes, slow);

  // macd line where both EMAs exist
  const macdLine: number[] = [];
  const start = Math.max(fast, slow) - 1;
  for (let i = start; i < closes.length; i++) {
    macdLine.push(emaF[i] - emaS[i]);
  }

  // signal on macdLine
  const sigSeries = (function emaOnMacd(vals: number[], period: number): number[] {
    if (vals.length < period) return [];
    const k = 2 / (period + 1);
    const out: number[] = new Array(vals.length).fill(NaN);
    let seed = sma(vals, 0, period);
    out[period - 1] = seed;
    for (let i = period; i < vals.length; i++) {
      seed = vals[i] * k + seed * (1 - k);
      out[i] = seed;
    }
    return out;
  })(macdLine, signal);

  const macd = macdLine[macdLine.length - 1];
  const sig  = sigSeries[sigSeries.length - 1];
  const hist = macd - sig;
  return { macd, signal: sig, hist };
}
