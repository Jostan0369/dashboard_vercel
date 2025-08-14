import { useEffect, useState } from "react";
import { seedRSI, seedEMA, seedMACD, nextRSI, nextEMA, nextMACD } from "@/lib/ta";

type Timeframe = "15m" | "1h" | "4h" | "1d";

export function useBinanceLive(tf: Timeframe) {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    let cache: Record<
      string,
      {
        candles: number[];
        rsi14?: number;
        ema12?: number;
        ema26?: number;
        ema50?: number;
        ema100?: number;
        ema200?: number;
        macd?: number;
        macdSignal?: number;
        macdHist?: number;
      }
    > = {};

    async function seedSymbols() {
      const res = await fetch(`/api/seed?tf=${tf}`);
      const data = await res.json();

      const seeded = data.map((pair: any) => {
        const closes = pair.klines.map((k: any) => k.close);

        const rsi14 = seedRSI(closes, 14);
        const ema12 = seedEMA(closes, 12);
        const ema26 = seedEMA(closes, 26);
        const ema50 = seedEMA(closes, 50);
        const ema100 = seedEMA(closes, 100);
        const ema200 = seedEMA(closes, 200);
        const { macd, signal, hist } = seedMACD(closes, 12, 26, 9);

        cache[pair.symbol] = {
          candles: closes,
          rsi14,
          ema12,
          ema26,
          ema50,
          ema100,
          ema200,
          macd,
          macdSignal: signal,
          macdHist: hist,
        };

        return {
          symbol: pair.symbol,
          open: pair.open,
          high: pair.high,
          low: pair.low,
          close: pair.close,
          volume: pair.volume,
          ...cache[pair.symbol],
        };
      });

      setRows(seeded);
    }

    seedSymbols();

    // WebSocket for live updates
    const ws = new WebSocket(`wss://fstream.binance.com/stream?streams=!miniTicker@arr/${tf}`);

    ws.onmessage = (msg) => {
      const parsed = JSON.parse(msg.data);
      const update = parsed.data;

      // Example: update loop
      update.forEach((u: any) => {
        const c = cache[u.s];
        if (!c) return;

        // push new close
        c.candles.push(Number(u.c));
        if (c.candles.length > 500) c.candles.shift();

        c.rsi14 = nextRSI(c.candles, 14);
        c.ema12 = nextEMA(c.candles, 12, c.ema12);
        c.ema26 = nextEMA(c.candles, 26, c.ema26);
        c.ema50 = nextEMA(c.candles, 50, c.ema50);
        c.ema100 = nextEMA(c.candles, 100, c.ema100);
        c.ema200 = nextEMA(c.candles, 200, c.ema200);
        const macdCalc = nextMACD(c.candles, 12, 26, 9);
        c.macd = macdCalc.macd;
        c.macdSignal = macdCalc.signal;
        c.macdHist = macdCalc.hist;
      });

      setRows((prev) =>
        prev.map((r) => ({
          ...r,
          ...cache[r.symbol],
          close: cache[r.symbol].candles[cache[r.symbol].candles.length - 1],
        }))
      );
    };

    return () => {
      ws.close();
    };
  }, [tf]);

  return { rows };
}
