import { useEffect, useState } from "react";
import { EMA, RSI, MACD } from "technicalindicators";

export function useIndicators(symbol: string, interval: string = "15m") {
  const [indicators, setIndicators] = useState<any>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/klines?symbol=${symbol}&interval=${interval}`);
        const klines = await res.json();

        const closes = klines.map((k: any) => parseFloat(k[4])); // close prices

        // RSI
        const rsi = RSI.calculate({ values: closes, period: 14 });
        const lastRsi = rsi[rsi.length - 1];

        // EMA
        const ema12 = EMA.calculate({ values: closes, period: 12 });
        const ema26 = EMA.calculate({ values: closes, period: 26 });
        const ema200 = EMA.calculate({ values: closes, period: 200 });

        // MACD
        const macd = MACD.calculate({
          values: closes,
          fastPeriod: 12,
          slowPeriod: 26,
          signalPeriod: 9,
          SimpleMAOscillator: false,
          SimpleMASignal: false
        });

        setIndicators({
          rsi: lastRsi?.toFixed(2),
          ema12: ema12[ema12.length - 1]?.toFixed(2),
          ema26: ema26[ema26.length - 1]?.toFixed(2),
          ema200: ema200[ema200.length - 1]?.toFixed(2),
          macd: macd[macd.length - 1]
        });
      } catch (err) {
        console.error("Indicator fetch error", err);
      }
    }

    fetchData();
  }, [symbol, interval]);

  return indicators;
}
