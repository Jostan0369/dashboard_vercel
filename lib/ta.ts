export function lastEMA(closes: number[], period: number): number {
  if (closes.length < period) return NaN;
  const k = 2 / (period + 1);
  let ema = closes[0];
  for (let i = 1; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return parseFloat(ema.toFixed(2));
}

export function lastRSI(closes: number[], period: number): number {
  if (closes.length < period + 1) return NaN;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}

export function lastMACD(closes: number[], fast: number, slow: number, signal: number): number {
  if (closes.length < slow + signal) return NaN;
  const emaFast = emaArray(closes, fast);
  const emaSlow = emaArray(closes, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = emaArray(macdLine.slice(slow - 1), signal);
  return parseFloat((macdLine[macdLine.length - 1] - signalLine[signalLine.length - 1]).toFixed(2));
}

function emaArray(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  let ema = values[0];
  const result = [ema];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}
