// hooks/useBinanceLive.ts
'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { nextEMA, seedEMA, seedMACD, nextMACD, seedRSI, nextRSI, EMAState, MACDState, RSIState } from '@/lib/ta';

type TF = '15m'|'1h'|'4h'|'1d';

export type Row = {
  symbol: string;
  open: number; high: number; low: number; close: number; volume: number;
  rsi14: number | null;
  ema12: number | null; ema26: number | null; ema50: number | null; ema100: number | null; ema200: number | null;
  macd: number | null; macdSignal: number | null; macdHist: number | null;
  ts: number;
};

type PerSymbolState = {
  closes: number[];
  ema50: EMAState; ema100: EMAState; ema200: EMAState;
  macd: MACDState;
  rsi: RSIState;
};

const TF_TO_STREAM: Record<TF,string> = { '15m':'kline_15m','1h':'kline_1h','4h':'kline_4h','1d':'kline_1d' };
const KLIMIT = 500;              // enough for EMA200 accuracy
const MAX_SYMBOLS = 50;          // start small; raise if your browser handles it

async function fetchUsdtFuturesSymbols(): Promise<string[]> {
  const ex = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo').then(r=>r.json());
  const syms: string[] = ex.symbols
    .filter((s: any) => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING')
    .map((s: any) => s.symbol.toLowerCase());
  // Optional: rank by 24h volume to pick top N
  try {
    const tick24 = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr').then(r=>r.json());
    const volMap = new Map<string, number>();
    tick24.forEach((t: any)=> {
      if (t.symbol.endsWith('USDT')) volMap.set(t.symbol.toLowerCase(), parseFloat(t.volume));
    });
    const ranked = [...syms].sort((a,b)=>(volMap.get(b)||0)-(volMap.get(a)||0));
    return ranked.slice(0, MAX_SYMBOLS);
  } catch {
    return syms.slice(0, MAX_SYMBOLS);
  }
}

async function fetchKlines(symbol: string, interval: TF, limit=KLIMIT) {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
  const arr = await fetch(url).then(r=>r.json());
  return arr.map((k: any[])=>({
    openTime: k[0], open:+k[1], high:+k[2], low:+k[3], close:+k[4], volume:+k[5], closeTime:k[6]
  }));
}

export function useBinanceLive(timeframe: TF) {
  const [rows, setRows] = useState<Row[]>([]);
  const statesRef = useRef<Map<string, PerSymbolState>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);

  // init: symbols + seed history
  useEffect(()=> {
    let cancelled = false;

    (async () => {
      const symbols = await fetchUsdtFuturesSymbols();
      const seeds = await Promise.all(symbols.map(async (s) => {
        const k = await fetchKlines(s, timeframe, KLIMIT);
        const closes = k.map((x:any)=>x.close);
        const ema50 = seedEMA(50, closes);
        const ema100 = seedEMA(100, closes);
        const ema200 = seedEMA(200, closes);
        const macd = seedMACD(closes);
        const rsi = seedRSI(14, closes);
        const last = k.at(-1);
        const state: PerSymbolState = { closes, ema50, ema100, ema200, macd, rsi };
        return {
          symbol: s.toUpperCase(),
          state,
          row: {
            symbol: s.toUpperCase(),
            open: last?.open ?? 0, high: last?.high ?? 0, low: last?.low ?? 0, close: last?.close ?? 0, volume: last?.volume ?? 0,
            rsi14: null,
            ema12: macd.ema12.value, ema26: macd.ema26.value,
            ema50: ema50.value, ema100: ema100.value, ema200: ema200.value,
            macd: macd.macd, macdSignal: macd.signal.value, macdHist: null,
            ts: Date.now(),
          } as Row
        };
      }));

      if (cancelled) return;

      // store states and initial rows
      const nextMap = new Map<string, PerSymbolState>();
      const initRows: Row[] = [];
      for (const s of seeds) {
        nextMap.set(s.row.symbol, s.state);
        initRows.push(s.row);
      }
      statesRef.current = nextMap;
      setRows(initRows);

      // open combined WS for timeframe
      const stream = TF_TO_STREAM[timeframe];
      const streams = symbols.map(s=>`${s}@${stream}`).join('/');
      const url = `wss://fstream.binance.com/stream?streams=${streams}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        const k = msg?.data?.k;
        if (!k) return;
        const symbol = k.s; // already upper
        const isFinal = !!k.x;
        const open = +k.o, high=+k.h, low=+k.l, close=+k.c, volume=+k.v;

        const map = statesRef.current;
        const st = map.get(symbol);
        if (!st) return;

        // If candle still forming, we can show live price/volume; compute indicators on close
        if (!isFinal) {
          setRows(prev => {
            const i = prev.findIndex(r=>r.symbol===symbol);
            if (i === -1) return prev;
            const next = [...prev];
            next[i] = { ...next[i], close, volume, high, low, open, ts: Date.now() };
            return next;
          });
          return;
        }

        // On candle close: update states incrementally
        st.closes.push(close);
        if (st.closes.length > KLIMIT) st.closes.shift();

        // EMA50/100/200
        st.ema50 = nextEMA(st.ema50.value == null ? seedEMA(50, st.closes) : st.ema50, close);
        st.ema100 = nextEMA(st.ema100.value == null ? seedEMA(100, st.closes) : st.ema100, close);
        st.ema200 = nextEMA(st.ema200.value == null ? seedEMA(200, st.closes) : st.ema200, close);

        // MACD (ema12/ema26 + signal)
        const m = nextMACD(st.macd, close);
        st.macd = m.state;

        // RSI
        const r = nextRSI(st.rsi, close);
        st.rsi = r.state;

        map.set(symbol, st);

        setRows(prev => {
          const i = prev.findIndex(r=>r.symbol===symbol);
          if (i === -1) return prev;
          const next = [...prev];
          next[i] = {
            ...next[i],
            open, high, low, close, volume,
            ema12: st.macd.ema12.value,
            ema26: st.macd.ema26.value,
            ema50: st.ema50.value,
            ema100: st.ema100.value,
            ema200: st.ema200.value,
            macd: m.macd,
            macdSignal: m.signal,
            macdHist: m.hist,
            rsi14: r.rsi,
            ts: Date.now(),
          };
          return next;
        });
      };

      ws.onclose = () => console.warn('Binance WS closed for', timeframe);
      ws.onerror = (e) => console.warn('Binance WS error for', timeframe, e);
    })();

    return () => {
      cancelled = true;
      wsRef.current?.close();
    };
  }, [timeframe]);

  const sorted = useMemo(()=> {
    // keep a stable order (by symbol)
    return [...rows].sort((a,b)=> a.symbol.localeCompare(b.symbol));
  }, [rows]);

  return { rows: sorted };
}
