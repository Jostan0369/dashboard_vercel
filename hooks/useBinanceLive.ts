// hooks/useBinanceLive.ts
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { lastEMA, lastMACD, lastRSI } from '@/lib/ta';

export type TF = '15m' | '1h' | '4h' | '1d';

export type Row = {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  rsi14: number | null;
  macd: number | null;
  ema12: number | null;
  ema26: number | null;
  ema50: number | null;
  ema100: number | null;
  ema200: number | null;
  ts: number;
};

type PerSymbol = { closes: number[] };

const FAPI = 'https://fapi.binance.com';
const BATCH_WS_SIZE = 40;   // symbols per ws
const KLIMIT = 600;         // enough for EMA200
const MAX_SYMBOLS = 80;     // keep lean for UI

const TF_TO_STREAM: Record<TF, string> = {
  '15m': 'kline_15m',
  '1h': 'kline_1h',
  '4h': 'kline_4h',
  '1d': 'kline_1d',
};

type ExchangeInfo = {
  symbols: Array<{
    symbol: string;
    contractType: string;
    quoteAsset: string;
    status: string;
  }>;
};

type ApiKline = [
  number, string, string, string, string, string,
  number, string, string, string, string, string, string, string
];

type Kline = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
};

async function fetchExchangeSymbols(limit: number): Promise<string[]> {
  const r = await fetch(`${FAPI}/fapi/v1/exchangeInfo`);
  if (!r.ok) return [];
  const ex: ExchangeInfo = await r.json();
  const all = (ex.symbols ?? [])
    .filter(s => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING')
    .map(s => s.symbol.toUpperCase());

  // try to sort by 24h volume to pick top markets
  try {
    const t = await (await fetch(`${FAPI}/fapi/v1/ticker/24hr`)).json();
    const vol = new Map<string, number>();
    (t ?? []).forEach((x: any) => {
      if (typeof x?.symbol === 'string' && x.symbol.endsWith('USDT')) {
        vol.set(x.symbol.toUpperCase(), parseFloat(x.volume) || 0);
      }
    });
    return [...all].sort((a, b) => (vol.get(b) || 0) - (vol.get(a) || 0)).slice(0, limit);
  } catch {
    return all.slice(0, limit);
  }
}

// If your region blocks direct REST from browser, you can proxy via Next route:
// set USE_INTERNAL_ROUTE = true and add /app/api/klines/route.ts (optional).
const USE_INTERNAL_ROUTE = false;

async function fetchKlines(symbol: string, tf: TF, limit = KLIMIT): Promise<Kline[]> {
  const urlDirect = `${FAPI}/fapi/v1/klines?symbol=${symbol}&interval=${tf}&limit=${limit}`;
  const urlProxy = `/api/klines?symbol=${symbol}&interval=${tf}&limit=${limit}`;
  const url = USE_INTERNAL_ROUTE ? urlProxy : urlDirect;

  const r = await fetch(url);
  if (!r.ok) throw new Error(`seed ${symbol} ${tf} http ${r.status}`);
  const arr: ApiKline[] = await r.json();
  return arr.map((k: ApiKline) => ({
    openTime: k[0],
    open: +k[1],
    high: +k[2],
    low: +k[3],
    close: +k[4],
    volume: +k[5],
    closeTime: k[6],
  }));
}

export function useBinanceLive(timeframe: TF, opts?: { maxSymbols?: number; klimit?: number }) {
  const maxSymbols = opts?.maxSymbols ?? MAX_SYMBOLS;
  const klimit = opts?.klimit ?? KLIMIT;

  const [rows, setRows] = useState<Row[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [errors, setErrors] = useState<string[]>([]);

  const statesRef = useRef<Map<string, PerSymbol>>(new Map());
  const wsRefs = useRef<WebSocket[]>([]);
  const batchRef = useRef<Record<string, Partial<Row>>>({});
  const flushingRef = useRef(false);
  const cancelledRef = useRef(false);

  const flush = () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: any) => setTimeout(cb, 16))(() => {
      const updates = batchRef.current;
      batchRef.current = {};
      flushingRef.current = false;
      setRows(prev => {
        if (!prev.length) return prev;
        const map = new Map(prev.map((r, i) => [r.symbol, i]));
        const next = [...prev];
        for (const [sym, u] of Object.entries(updates)) {
          const idx = map.get(sym);
          if (idx == null) continue;
          const base = next[idx];
          next[idx] = {
            ...base,
            open: u.open ?? base.open,
            high: u.high ?? base.high,
            low: u.low ?? base.low,
            close: u.close ?? base.close,
            volume: u.volume ?? base.volume,
            rsi14: u.rsi14 ?? base.rsi14,
            macd: u.macd ?? base.macd,
            ema12: u.ema12 ?? base.ema12,
            ema26: u.ema26 ?? base.ema26,
            ema50: u.ema50 ?? base.ema50,
            ema100: u.ema100 ?? base.ema100,
            ema200: u.ema200 ?? base.ema200,
            ts: u.ts ?? base.ts,
          };
        }
        return next;
      });
    });
  };

  useEffect(() => {
    cancelledRef.current = false;
    setSeeded(false);
    setProgress({ done: 0, total: 0 });
    setErrors([]);
    setRows([]);

    (async () => {
      try {
        const syms = await fetchExchangeSymbols(maxSymbols);
        if (cancelledRef.current) return;
        setProgress({ done: 0, total: syms.length });
        console.info(`Fetched symbols for table: ${syms.length}`);

        // seed klines in batches
        const CONCURRENCY = 8;
        const seededArr: { symbol: string; ks: Kline[] }[] = [];
        for (let i = 0; i < syms.length; i += CONCURRENCY) {
          const chunk = syms.slice(i, i + CONCURRENCY);
          const part = await Promise.all(
            chunk.map(async (s) => {
              const up = s.toUpperCase();
              try {
                const ks = await fetchKlines(up, timeframe, klimit);
                return { symbol: up, ks };
              } catch (e) {
                setErrors(prev => [...prev, String(e)].slice(-50));
                return { symbol: up, ks: [] as Kline[] };
              }
            })
          );
          seededArr.push(...part);
          setProgress(p => ({ done: Math.min(p.total, p.done + part.length), total: p.total || syms.length }));
        }
        if (cancelledRef.current) return;

        const states = new Map<string, PerSymbol>();
        const initial: Row[] = [];

        for (const { symbol, ks } of seededArr) {
          if (!ks.length) continue;
          const closes = ks.map(k => k.close);
          states.set(symbol, { closes: [...closes] });
          const last = ks[ks.length - 1];

          let rsi14: number | null = null;
          let ema12: number | null = null;
          let ema26: number | null = null;
          let ema50: number | null = null;
          let ema100: number | null = null;
          let ema200: number | null = null;
          let macdVal: number | null = null;

          if (closes.length >= 200) {
            rsi14 = lastRSI(closes, 14);
            ema12 = lastEMA(closes, 12);
            ema26 = lastEMA(closes, 26);
            ema50 = lastEMA(closes, 50);
            ema100 = lastEMA(closes, 100);
            ema200 = lastEMA(closes, 200);
            macdVal = lastMACD(closes, 12, 26, 9).macd;
          }

          initial.push({
            symbol,
            open: last.open,
            high: last.high,
            low: last.low,
            close: last.close,
            volume: last.volume,
            rsi14, macd: macdVal,
            ema12, ema26, ema50, ema100, ema200,
            ts: Date.now(),
          });
        }

        statesRef.current = states;
        initial.sort((a, b) => a.symbol.localeCompare(b.symbol));
        setRows(initial);
        setSeeded(true);

        // open WebSockets in batches
        const stream = TF_TO_STREAM[timeframe];
        const streamSyms = Array.from(states.keys()).map(s => s.toLowerCase());
        const batches: string[][] = [];
        for (let i = 0; i < streamSyms.length; i += BATCH_WS_SIZE) {
          batches.push(streamSyms.slice(i, i + BATCH_WS_SIZE));
        }

        // cleanup old
        wsRefs.current.forEach(w => { try { w.close(); } catch {} });
        wsRefs.current = [];

        const openBatchWs = (symbols: string[]) => {
          const url = `wss://fstream.binance.com/stream?streams=${symbols.map(s => `${s}@${stream}`).join('/')}`;
          let ws: WebSocket;
          try { ws = new WebSocket(url); } catch { return; }

          ws.onopen = () => console.info('WS open batch', symbols.length);
          ws.onmessage = (ev) => {
            try {
              const j = JSON.parse(ev.data as string);
              const k = j?.data?.k;
              if (!k) return;

              const symbol: string = k.s;
              const isFinal: boolean = !!k.x;
              const close = +k.c;
              const open = +k.o;
              const high = +k.h;
              const low  = +k.l;
              const volume = +k.v;

              const st = statesRef.current.get(symbol);
              if (!st) return;

              const partial: Partial<Row> = { symbol, open, high, low, close, volume, ts: Date.now() };

              if (isFinal) {
                st.closes.push(close);
                if (st.closes.length > klimit) st.closes.shift();
                if (st.closes.length >= 200) {
                  partial.rsi14 = lastRSI(st.closes, 14);
                  partial.ema12 = lastEMA(st.closes, 12);
                  partial.ema26 = lastEMA(st.closes, 26);
                  partial.ema50 = lastEMA(st.closes, 50);
                  partial.ema100 = lastEMA(st.closes, 100);
                  partial.ema200 = lastEMA(st.closes, 200);
                  partial.macd = lastMACD(st.closes, 12, 26, 9).macd;
                }
              }

              batchRef.current[symbol] = { ...(batchRef.current[symbol] || {}), ...partial };
              flush();
            } catch {
              // ignore single-frame parse error
            }
          };
          ws.onerror = () => setErrors(p => [...p, 'ws error'].slice(-50));
          ws.onclose = () => {
            if (!cancelledRef.current) {
              setTimeout(() => openBatchWs(symbols), 2000 + Math.random() * 2000);
            }
          };

          wsRefs.current.push(ws);
        };

        for (const b of batches) openBatchWs(b);
        console.info(`Connecting WebSocket for ${streamSyms.length} pairs via ${batches.length} connection(s).`);
      } catch (e) {
        setErrors(p => [...p, String(e)].slice(-50));
      }
    })();

    return () => {
      cancelledRef.current = true;
      wsRefs.current.forEach(w => { try { w.close(); } catch {} });
      wsRefs.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe, maxSymbols, klimit]);

  const sorted = useMemo(() => [...rows].sort((a, b) => a.symbol.localeCompare(b.symbol)), [rows]);

  return { rows: sorted, seeded, progress, errors };
}

// ✅ Export both named and default so either import style works.
const _default = useBinanceLive;
export default _default;
