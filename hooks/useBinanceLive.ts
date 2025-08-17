import { useEffect, useState, useRef } from "react";
import { lastRSI, lastEMA, lastMACD } from "@/lib/ta";

export type TF = "15m" | "1h" | "4h" | "1d";

export interface Row {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  rsi14: number;
  macd: number;
  ema12: number;
  ema26: number;
  ema50: number;
  ema100: number;
  ema200: number;
  macdSignal: number;
  macdHist: number;
}

interface Options {
  maxSymbols?: number;
  klimit?: number;
}

export function useBinanceLive(timeframe: TF, opts: Options = {}) {
  const { maxSymbols = 60, klimit = 600 } = opts;
  const [rows, setRows] = useState<Row[]>([]);
  const historyRef = useRef<Map<string, any[]>>(new Map());

  const [seeded, setSeeded] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let cancelled = false;

    async function init() {
      try {
        const symbolsRes = await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo");
        const symbolsJson = await symbolsRes.json();
        const symbols = symbolsJson.symbols
          .filter((s: any) => s.contractType === "PERPETUAL" && s.quoteAsset === "USDT")
          .slice(0, maxSymbols)
          .map((s: any) => s.symbol);

        console.log(`Fetched symbols for table: ${symbols.length}`);
        setProgress({ done: 0, total: symbols.length });

        for (const sym of symbols) {
          if (cancelled) break;
          const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${timeframe}&limit=${klimit}`;
          const kRes = await fetch(url);
          if (!kRes.ok) throw new Error(`Failed to fetch klines for ${sym}`);
          const kData = await kRes.json();

          const candles = kData.map((k: any[]) => ({
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
            time: k[0]
          }));

          historyRef.current.set(sym, candles);
          setProgress(prev => ({ ...prev, done: prev.done + 1 }));
        }

        if (cancelled) return;
        
        updateRows();
        setSeeded(true);

        const streams = symbols.map((s: string) => `${s.toLowerCase()}@kline_${timeframe}`).join("/");
        ws = new WebSocket(`wss://fstream.binance.com/stream?streams=${streams}`);
        console.log(`Connecting WebSocket for ${symbols.length} Futures USDT pairs...`);

        ws.onmessage = (msg) => {
          const data = JSON.parse(msg.data);
          if (!data.data || !data.data.k) return;

          const k = data.data.k;
          const sym = k.s;
          const candle = {
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
            time: k.t
          };

          const arr = historyRef.current.get(sym) || [];
          if (arr.length && arr[arr.length - 1].time === candle.time) {
            arr[arr.length - 1] = candle;
          } else {
            arr.push(candle);
            if (arr.length > klimit) arr.shift();
          }
          historyRef.current.set(sym, arr);
          updateRows();
        };

        ws.onerror = (event) => {
          console.error("WebSocket error:", event);
          setErrors(prev => [...prev, "WebSocket connection error"]);
        };

      } catch (err) {
        console.error("Error initializing Binance Live:", err);
        if (err instanceof Error) {
          setErrors(prev => [...prev, err.message]);
        }
      }
    }

    function updateRows() {
      const newRows: Row[] = [];
      historyRef.current.forEach((candles, symbol) => {
        const closes = candles.map((c) => c.close);
        const last = candles[candles.length - 1];

        // Conditional calculations based on available data with reduced periods
        const rsiVal = closes.length >= 14 ? lastRSI(closes, 14) : NaN;
        const macdValues = closes.length >= 35 ? lastMACD(closes, 12, 26, 9) : { macd: NaN, signal: NaN, hist: NaN };
        const ema12 = closes.length >= 12 ? lastEMA(closes, 12) : NaN;
        const ema26 = closes.length >= 26 ? lastEMA(closes, 26) : NaN;
        const ema50 = closes.length >= 50 ? lastEMA(closes, 50) : NaN;
        const ema100 = closes.length >= 100 ? lastEMA(closes, 100) : NaN;
        const ema200 = closes.length >= 200 ? lastEMA(closes, 200) : NaN;

        newRows.push({
          symbol,
          open: last.open,
          high: last.high,
          low: last.low,
          close: last.close,
          volume: last.volume,
          rsi14: rsiVal,
          macd: macdValues.macd,
          ema12,
          ema26,
          ema50,
          ema100,
          ema200,
          macdSignal: macdValues.signal,
          macdHist: macdValues.hist,
        });
      });
      setRows(newRows);
    }

    init();

    return () => {
      cancelled = true;
      if (ws) ws.close();
    };
  }, [timeframe, maxSymbols, klimit]);

  return { rows, seeded, progress, errors };
}
