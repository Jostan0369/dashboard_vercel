// lib/ta.ts
// Pure-TS implementations of EMA, RSI and MACD series & helpers.
// No external dependencies.

export function emaSeries(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (!closes || closes.length < period) return out;

  // seed with SMA of first 'period' closes
  let sum = 0;
  for (let i = 0; i < period; i++) sum += closes[i];
  let prev = sum / period;
  out[period - 1] = prev;
  const k = 2 / (period + 1);

  for (let i = period; i < closes.length; i++) {
    prev = closes[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function lastEMA(closes: number[], period: number): number | null {
  const s = emaSeries(closes, period);
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] != null) return s[i] as number;
  }
  return null;
}

export function rsiSeries(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (!closes || closes.length < period + 1) return out;

  // initial avg gain/loss
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gain += diff;
    else loss += -diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return out;
}

export function lastRSI(closes: number[], period = 14): number | null {
  const s = rsiSeries(closes, period);
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] != null) return s[i] as number;
  }
  return null;
}

/**
 * Compute MACD series and signal; returns arrays aligned to closes[].
 * macdLine[i] is valid only where both fastEMA and slowEMA are valid.
 */
export function macdSeries(closes: number[], fast = 12, slow = 26, signal = 9) {
  const fastE = emaSeries(closes, fast);
  const slowE = emaSeries(closes, slow);
  const macdLine: (number | null)[] = new Array(closes.length).fill(null);

  for (let i = 0; i < closes.length; i++) {
    if (fastE[i] != null && slowE[i] != null) {
      macdLine[i] = (fastE[i] as number) - (slowE[i] as number);
    }
  }

  // Build compact numeric array for macd values (skip nulls)
  const macdNums: number[] = [];
  const macdIdx: number[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] != null) {
      macdIdx.push(i);
      macdNums.push(macdLine[i] as number);
    }
  }

  // Compute EMA on macdNums for the signal line (aligned to macdNums array)
  const signalCompact = emaSeries(macdNums, signal); // note: emaSeries expects number[]; works here
  // Map back to full length
  const signalLine: (number | null)[] = new Array(closes.length).fill(null);
  for (let j = 0; j < signalCompact.length; j++) {
    const origIndex = macdIdx[j];
    signalLine[origIndex] = signalCompact[j];
  }

  const histogram: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i++) {
    if (macdLine[i] != null && signalLine[i] != null) {
      histogram[i] = (macdLine[i] as number) - (signalLine[i] as number);
    }
  }

  return { macdLine, signalLine, histogram, fastE, slowE };
}

export function lastMACD(closes: number[], fast = 12, slow = 26, signal = 9) {
  const m = macdSeries(closes, fast, slow, signal);
  let macd: number | null = null;
  let sig: number | null = null;
  let hist: number | null = null;

  for (let i = m.macdLine.length - 1; i >= 0; i--) {
    if (macd == null && m.macdLine[i] != null) macd = m.macdLine[i] as number;
    if (sig == null && m.signalLine[i] != null) sig = m.signalLine[i] as number;
    if (hist == null && m.histogram[i] != null) hist = m.histogram[i] as number;
    if (macd != null && sig != null && hist != null) break;
  }

  return { macd, signal: sig, hist };
}
