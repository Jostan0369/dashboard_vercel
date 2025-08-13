// lib/ta.ts
export type EMAState = { period: number; k: number; value: number | null };
export type MACDState = {
  ema12: EMAState;
  ema26: EMAState;
  macd: number | null;
  signal: EMAState; // EMA(9) of macd
};
export type RSIState = {
  period: number;
  avgGain: number | null;
  avgLoss: number | null;
  prevClose: number | null;
};

export function seedEMA(period: number, closes: number[]): EMAState {
  const k = 2 / (period + 1);
  if (closes.length < period) return { period, k, value: null };
  // SMA seed
  let sum = 0;
  for (let i = closes.length - period; i < closes.length; i++) sum += closes[i];
  const sma = sum / period;
  return { period, k, value: sma };
}

export function nextEMA(state: EMAState, price: number): EMAState {
  if (state.value == null) return { ...state, value: price };
  const v = price * state.k + state.value * (1 - state.k);
  return { ...state, value: v };
}

export function seedRSI(period = 14, closes: number[]): RSIState {
  if (closes.length < period + 1) return { period, avgGain: null, avgLoss: null, prevClose: closes.at(-1) ?? null };
  let gain = 0, loss = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gain += diff; else loss += -diff;
  }
  return {
    period,
    avgGain: gain / period,
    avgLoss: loss / period,
    prevClose: closes.at(-1) ?? null,
  };
}

export function nextRSI(state: RSIState, close: number): { state: RSIState; rsi: number | null } {
  const { period, prevClose, avgGain, avgLoss } = state;
  if (prevClose == null) return { state: { ...state, prevClose: close }, rsi: null };
  const change = close - prevClose;
  const gain = Math.max(change, 0);
  const loss = Math.max(-change, 0);
  const newAvgGain = avgGain == null ? gain : (avgGain * (period - 1) + gain) / period;
  const newAvgLoss = avgLoss == null ? loss : (avgLoss * (period - 1) + loss) / period;
  const rs = newAvgLoss === 0 ? Infinity : newAvgGain / newAvgLoss;
  const rsi = newAvgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
  return {
    state: { period, avgGain: newAvgGain, avgLoss: newAvgLoss, prevClose: close },
    rsi,
  };
}

export function seedMACD(closes: number[]): MACDState {
  const ema12 = seedEMA(12, closes);
  const ema26 = seedEMA(26, closes);
  // build macd series tail if both seeded
  let macdVal: number | null = null;
  if (ema12.value != null && ema26.value != null) {
    macdVal = ema12.value - ema26.value;
  }
  const signal = seedEMA(9, macdVal != null ? [macdVal, macdVal, macdVal, macdVal, macdVal, macdVal, macdVal, macdVal, macdVal] : []);
  return { ema12, ema26, macd: macdVal, signal };
}

export function nextMACD(state: MACDState, close: number): { state: MACDState; macd: number | null; signal: number | null; hist: number | null } {
  const ema12 = nextEMA(state.ema12, close);
  const ema26 = nextEMA(state.ema26, close);
  const macdVal = (ema12.value != null && ema26.value != null) ? (ema12.value - ema26.value) : null;
  const signal = macdVal == null ? state.signal : nextEMA(state.signal, macdVal);
  const hist = macdVal != null && signal.value != null ? macdVal - signal.value : null;
  return { state: { ema12, ema26, macd: macdVal, signal }, macd: macdVal, signal: signal.value, hist };
}
