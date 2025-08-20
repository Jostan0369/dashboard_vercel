// lib/indicator.ts

// Simple Moving Average / EMA
export function calculateEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  let emaArray: number[] = [];
  let prevEma = data[0];

  data.forEach((price, i) => {
    if (i === 0) {
      emaArray.push(price);
    } else {
      const ema = price * k + prevEma * (1 - k);
      emaArray.push(ema);
      prevEma = ema;
    }
  });

  return emaArray;
}

// RSI
export function calculateRSI(data: number[], period: number = 14): number[] {
  let gains: number[] = [];
  let losses: number[] = [];
  let rsiArray: number[] = [];

  for (let i = 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? Math.abs(diff) : 0);

    if (i >= period) {
      const avgGain = gains.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(i - period, i).reduce((a, b) => a + b, 0) / period;

      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      const rsi = 100 - 100 / (1 + rs);

      rsiArray.push(rsi);
    } else {
      rsiArray.push(50); // neutral default
    }
  }

  return rsiArray;
}

// MACD
export function calculateMACD(data: number[], shortPeriod = 12, longPeriod = 26, signalPeriod = 9) {
  const shortEMA = calculateEMA(data, shortPeriod);
  const longEMA = calculateEMA(data, longPeriod);

  const macdLine = shortEMA.map((val, i) => val - longEMA[i]);
  const signalLine = calculateEMA(macdLine, signalPeriod);
  const histogram = macdLine.map((val, i) => val - signalLine[i]);

  return { macdLine, signalLine, histogram };
}
