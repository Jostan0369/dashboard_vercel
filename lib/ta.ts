// lib/ta.ts
// Lightweight, incremental TA helpers for RSI/EMA/MACD.
// Designed for accuracy on seed (from full history) and O(1) per-tick updates.

export type EMAState = { period: number; k: number; value: number | null };
export type MACDState = {
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
  emaFast: EMAState;
  emaSlow: EMAState;
  macd: number | null;
  signal: EMAState; // EMA over MACD
};
export type RSIState = {
  period: number;
  avgGain: number | null;
  avgLoss: number | null;
  prevClose: number | null;
};

// ---------- EMA ----------
export function seedEMA(period: number, closes: number[]): EMAState {
  const k = 2 / (period + 1);
  if (!closes || closes.length < period) return { period, k, value: null };

  // First EMA = SMA(first 'period' closes)
  let ema = 0;
  for (let i = 0; i < period; i++) ema += closes[i];
  ema /= period;

  // Run through the rest of the history for accurate tail
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return { period, k, value: ema };
}

export function nextEMA(state: EMAState, price: number): EMAState {
  if (state.value == null) {
    return { ...state, value: price };
  }
  const value = price * state.k + state.value * (1 - state.k);
  return { ...state, value };
}

// ---------- RSI (Wilder’s) ----------
export function seedRSI(closes: number[], period = 14): RSIState {
  if (!closes || closes.length < period + 1) {
    return { period, avgGain: null, avgLoss: null, prevClose: closes?.at(-1) ?? null };
  }

  // Initial averages on first 'period' diffs
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff;
    else loss += -diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;

  // Smooth through the rest of the history
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const g = Math.max(change, 0);
    const l = Math.max(-change, 0);
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }

  return { period, avgGain, avgLoss, prevClose: closes.at(-1) ?? null };
}

export function nextRSI(state: RSIState, close: number): { state: RSIState; rsi: number | null } {
  const { period, prevClose, avgGain, avgLoss } = state;
  if (prevClose == null) return { state: { ...state, prevClose: close }, rsi: null };

  const change = close - prevClose;
  const g = Math.max(change, 0);
  const l = Math.max(-change, 0);

  const newAvgGain = avgGain == null ? g : (avgGain * (period - 1) + g) / period;
  const newAvgLoss = avgLoss == null ? l : (avgLoss * (period - 1) + l) / period;

  let rsi: number;
  if (newAvgLoss === 0) rsi = 100;
  else {
    const rs = newAvgGain / newAvgLoss;
    rsi = 100 - 100 / (1 + rs);
  }

  return {
    state: { period, avgGain: newAvgGain, avgLoss: newAvgLoss, prevClose: close },
    rsi,
  };
}

// ---------- MACD ----------
export function seedMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MACDState {
  const emaFast = seedEMA(fastPeriod, closes);
  const emaSlow = seedEMA(slowPeriod, closes);

  let macdVal: number | null = null;
  if (emaFast.value != null && emaSlow.value != null) {
    macdVal = emaFast.value - emaSlow.value;
  }

  // Seed signal EMA by building MACD series from history (accurate)
  const kFast = 2 / (fastPeriod + 1);
  const kSlow = 2 / (slowPeriod + 1);

  let emaF: number | null = null;
  let emaS: number | null = null;
  let macdSeries: number[] = [];

  if (closes.length >= slowPeriod) {
    // Build EMA series from scratch for accuracy
    // Fast
    let f = 0;
    for (let i = 0; i < fastPeriod; i++) f += closes[i];
    emaF = f / fastPeriod;
    for (let i = fastPeriod; i < closes.length; i++) {
      emaF = closes[i] * kFast + emaF * (1 - kFast);
      if (i >= slowPeriod - 1) {
        // will compute macd once slow EMA exists
      }
    }

    // Slow
    let s = 0;
    for (let i = 0; i < slowPeriod; i++) s += closes[i];
    emaS = s / slowPeriod;
    macdSeries = [];
    let emaFF = emaF;
    let emaSS = emaS;

    // Rebuild both series together to align (from the point both exist)
    // Start from index = slowPeriod (first next after SMA)
    emaFF = 0;
    for (let i = 0; i < fastPeriod; i++) emaFF += closes[i];
    emaFF /= fastPeriod;
    for (let i = fastPeriod; i < slowPeriod; i++) {
      emaFF = closes[i] * kFast + emaFF * (1 - kFast);
    }

    // Now both EMA series are defined from slowPeriod-1
    for (let i = slowPeriod; i < closes.length; i++) {
      emaFF = closes[i] * kFast + emaFF * (1 - kFast);
      emaSS = closes[i] * kSlow + emaSS * (1 - kSlow);
      macdSeries.push(emaFF - emaSS);
    }
  }

  let signal: EMAState;
  if (macdSeries.length >= signalPeriod) {
    // Build signal EMA from macdSeries
    let sig = 0;
    for (let i = 0; i < signalPeriod; i++) sig += macdSeries[i];
    sig /= signalPeriod;
    const kSig = 2 / (signalPeriod + 1);
    for (let i = signalPeriod; i < macdSeries.length; i++) {
      sig = macdSeries[i] * kSig + sig * (1 - kSig);
    }
    signal = { period: signalPeriod, k: 2 / (signalPeriod + 1), value: sig };
  } else {
    signal = { period: signalPeriod, k: 2 / (signalPeriod + 1), value: null };
  }

  return {
    fastPeriod,
    slowPeriod,
    signalPeriod,
    emaFast,
    emaSlow,
    macd: macdVal,
    signal,
  };
}

export function nextMACD(
  state: MACDState,
  close: number
): { state: MACDState; macd: number | null; signal: number | null; hist: number | null } {
  const emaFast = nextEMA(state.emaFast, close);
  const emaSlow = nextEMA(state.emaSlow, close);
  const macdVal = emaFast.value != null && emaSlow.value != null ? emaFast.value - emaSlow.value : null;
  const signal = macdVal == null ? state.signal : nextEMA(state.signal, macdVal);
  const hist = macdVal != null && signal.value != null ? macdVal - signal.value : null;

  return {
    state: { ...state, emaFast, emaSlow, macd: macdVal, signal },
    macd: macdVal,
    signal: signal.value,
    hist,
  };
}
