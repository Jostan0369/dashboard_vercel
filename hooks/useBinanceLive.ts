"use client";
import { useEffect, useState } from "react";
import { calculateRSI, calculateEMA, calculateMACD } from "@/lib/ta";

export default function useBinanceLive(symbols: string[], interval: string = "1m") {
  const [data, setData] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!symbols.length) return;

    // 1. Fetch historical candles for each symbol
    async function loadHistory() {
      for (const sym of symbols) {
        const res = await fetch(`/api/klines?symbol=${sym}&interval=${interval}&limit=500`);
        const candles = await res.json();

        const closes = candles.map((c: any) => parseFloat(c[4])); // close prices
        const rsi = calculateRSI(closes, 14);
        const ema12 = calculateEMA(closes, 12);
        const ema26 = calculateEMA(closes, 26);
        const ema200 = calculateEMA(closes, 200);
        const macd = calculateMACD(closes);

        setData(prev => ({
          ...prev,
          [sym]: {
            ...prev[sym],
            rsi,
            ema12,
            ema26,
            ema200,
            macd,
          }
        }));
      }
    }

    loadHistory();

    // 2. WebSocket for live ticker updates
    const ws = new WebSocket(
      `wss://fstream.binance.com/stream?streams=${symbols
        .map(s => s.toLowerCase() + "@ticker")
        .join("/")}`
    );

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      const t = msg.data;

      setData(prev => ({
        ...prev,
        [t.s]: {
          ...prev[t.s],
          lastPrice: parseFloat(t.c),
          high: parseFloat(t.h),
          low: parseFloat(t.l),
          volume: parseFloat(t.v),
        }
      }));
    };

    return () => ws.close();
  }, [symbols, interval]);

  return data;
}
