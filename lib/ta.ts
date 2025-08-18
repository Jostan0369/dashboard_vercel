// lib/ta.ts
function sma(arr: number[], start: number, len: number): number {
  let s = 0;
  for (let i = 0; i < len; i++) s += arr[start + i];
  return s / len;
}

export function lastEMA(closes: number[], period: number): number {
  if (!Array.isArray(closes) || closes.length < period) return NaN;
  const k = 2 / (period + 1);
  // seed with SMA
  let ema = sma(closes, 0, period);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

export function lastRSI(closes: number[], period = 14): number {
  if (!Array.isArray(closes) || closes.length < period + 1) return NaN;

  // Wilder RSI
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) gain += ch; else loss -= ch;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;

  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = ch > 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
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

  const emaSeries = (src: number[], period: number): number[] => {
    if (src.length < period) return [];
    const k = 2 / (period + 1);
    const out = new Array<number>(src.length).fill(NaN);
    let ema = sma(src, 0, period);
    out[period - 1] = ema;
    for (let i = period; i < src.length; i++) {
      ema = src[i] * k + ema * (1 - k);
      out[i] = ema;
    }
    return out;
  };

  const emaF = emaSeries(closes, fast);
  const emaS = emaSeries(closes, slow);
  const start = Math.max(fast, slow) - 1;
  const macdLine: number[] = [];
  for (let i = start; i < closes.length; i++) macdLine.push(emaF[i] - emaS[i]);

  const emaOn = (vals: number[], period: number) => {
    if (vals.length < period) return [];
    const k = 2 / (period + 1);
    const out = new Array<number>(vals.length).fill(NaN);
    let seed = sma(vals, 0, period);
    out[period - 1] = seed;
    for (let i = period; i < vals.length; i++) {
      seed = vals[i] * k + seed * (1 - k);
      out[i] = seed;
    }
    return out;
  };
  const sig = emaOn(macdLine, signal);

  const macd = macdLine[macdLine.length - 1];
  const signalV = sig[sig.length - 1];
  return { macd, signal: signalV, hist: macd - signalV };
}
