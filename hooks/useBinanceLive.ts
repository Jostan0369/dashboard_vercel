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
  macdSignal: number | null;
  macdHist: number | null;
  ema12: number | null;
  ema26: number | null;
  ema50: number | null;
  ema100: number | null;
  ema200: number | null;
  ts: number;
};

type PerSymbolState = { closes: number[] };

const FAPI = 'https://fapi.binance.com';
const KLIMIT_DEFAULT = 600;      // enough history for EMA200/RSI
const MAX_SYMBOLS_DEFAULT = 60;  // safe default for browser stability
const BATCH_WS_SIZE = 40;        // symbols per websocket

const TF_TO_STREAM: Record<TF, string> = {
  '15m': 'kline_15m',
  '1h' : 'kline_1h',
  '4h' : 'kline_4h',
  '1d' : 'kline_1d',
};

type Kline = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
};

async function fetchTopUsdtPerpSymbols(limit: number): Promise<string[]> {
  const exResp = await fetch(`${FAPI}/fapi/v1/exchangeInfo`);
  if (!exResp.ok) {
    console.warn('fetchTopUsdtPerpSymbols: exchangeInfo failed');
    return [];
  }
  const ex = await exResp.json();
  const futuresUsdt = (ex.symbols ?? [])
    .filter((s: any) => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING')
    .map((s: any) => s.symbol.toLowerCase());

  try {
    const t24Resp = await fetch(`${FAPI}/fapi/v1/ticker/24hr`);
    const t24 = await t24Resp.json();
    const vol = new Map<string, number>();
    (t24 ?? []).forEach((t: any) => {
      if (t && typeof t.symbol === 'string' && t.symbol.endsWith('USDT')) {
        vol.set(t.symbol.toLowerCase(), parseFloat(t.volume) || 0);
      }
    });
    return [...futuresUsdt].sort((a, b) => (vol.get(b) || 0) - (vol.get(a) || 0)).slice(0, limit);
  } catch (err) {
    console.warn('rank by volume failed, returning first N symbols', err);
    return futuresUsdt.slice(0, limit);
  }
}

async function fetchKlines(symbol: string, tf: TF, limit = KLIMIT_DEFAULT): Promise<Kline[]> {
  const url = `${FAPI}/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${tf}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const arr = await res.json();
  return (arr ?? []).map((k: any[]) => ({
    openTime: k[0],
    open: +k[1],
    high: +k[2],
    low: +k[3],
    close: +k[4],
    volume: +k[5],
    closeTime: k[6],
  })) as Kline[];
}

export function useBinanceLive(timeframe: TF, opts?: { maxSymbols?: number; klimit?: number }) {
  const klimit = opts?.klimit ?? KLIMIT_DEFAULT;
  const maxSymbols = opts?.maxSymbols ?? MAX_SYMBOLS_DEFAULT;

  const [rows, setRows] = useState<Row[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [errors, setErrors] = useState<string[]>([]);

  const statesRef = useRef<Map<string, PerSymbolState>>(new Map());
  const wsRefs = useRef<WebSocket[]>([]);
  const batchRef = useRef<Record<string, Partial<Row>>>({});
  const scheduledRef = useRef(false);
  const cancelledRef = useRef(false);

  // flush batched updates to React state (single RAF)
  const scheduleFlush = () => {
    if (scheduledRef.current) return;
    scheduledRef.current = true;
    (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: any) => setTimeout(cb, 16))(() => {
      const updates = batchRef.current;
      batchRef.current = {};
      scheduledRef.current = false;
      setRows((prev) => {
        if (!prev.length) return prev;
        const idx = new Map(prev.map((r, i) => [r.symbol, i]));
        const next = [...prev];
        for (const [sym, u] of Object.entries(updates)) {
          const i = idx.get(sym);
          if (i == null) continue;
          const base = next[i];
          next[i] = {
            ...base,
            open   : u.open   ?? base.open,
            high   : u.high   ?? base.high,
            low    : u.low    ?? base.low,
            close  : u.close  ?? base.close,
            volume : u.volume ?? base.volume,
            rsi14  : u.rsi14  ?? base.rsi14,
            macd   : u.macd   ?? base.macd,
            macdSignal: u.macdSignal ?? base.macdSignal,
            macdHist  : u.macdHist   ?? base.macdHist,
            ema12  : u.ema12  ?? base.ema12,
            ema26  : u.ema26  ?? base.ema26,
            ema50  : u.ema50  ?? base.ema50,
            ema100 : u.ema100 ?? base.ema100,
            ema200 : u.ema200 ?? base.ema200,
            ts     : u.ts     ?? base.ts,
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

    (async () => {
      try {
        const symbols = await fetchTopUsdtPerpSymbols(maxSymbols);
        if (cancelledRef.current) return;
        console.info(`Fetched symbols for table: ${symbols.length}`);
        setProgress({ done: 0, total: symbols.length });

        // seed klines in controlled parallel batches to avoid rate limit
        const perParallel = 8; // fetch 8 symbols at once
        const seededResults: { symbol: string; ks: Kline[] }[] = [];
        for (let i = 0; i < symbols.length; i += perParallel) {
          const batch = symbols.slice(i, i + perParallel);
          const promises = batch.map(async (s) => {
            try {
              const ks = await fetchKlines(s, timeframe, klimit);
              return { symbol: s.toUpperCase(), ks };
            } catch (err) {
              setErrors((prev) => [...prev, `seed ${s}: ${String(err)}`].slice(-50));
              return { symbol: s.toUpperCase(), ks: [] as Kline[] };
            }
          });
          const res = await Promise.all(promises);
          seededResults.push(...res);
          setProgress((p) => ({ done: Math.min(p.total, p.done + res.length), total: p.total || symbols.length }));
        }

        if (cancelledRef.current) return;

        // build states and initial rows
        const states = new Map<string, PerSymbolState>();
        const initialRows: Row[] = [];

        for (const item of seededResults) {
          const { symbol, ks } = item;
          if (!ks || ks.length === 0) {
            // still include a placeholder row so UI doesn't jump too much
            initialRows.push({
              symbol,
              open: NaN,
              high: NaN,
              low: NaN,
              close: NaN,
              volume: NaN,
              rsi14: null,
              macd: null,
              macdSignal: null,
              macdHist: null,
              ema12: null,
              ema26: null,
              ema50: null,
              ema100: null,
              ema200: null,
              ts: Date.now(),
            });
            continue;
          }

          const closes = ks.map((k) => k.close);
          states.set(symbol, { closes: [...closes] });

          const last = ks[ks.length - 1];

          const rsi = lastRSI(closes, 14);
          const ema12 = lastEMA(closes, 12);
          const ema26 = lastEMA(closes, 26);
          const ema50 = lastEMA(closes, 50);
          const ema100 = lastEMA(closes, 100);
          const ema200 = lastEMA(closes, 200);
          const m = lastMACD(closes, 12, 26, 9);

          initialRows.push({
            symbol,
            open: last.open,
            high: last.high,
            low: last.low,
            close: last.close,
            volume: last.volume,
            rsi14: rsi,
            macd: m.macd,
            macdSignal: m.signal,
            macdHist: m.hist,
            ema12,
            ema26,
            ema50,
            ema100,
            ema200,
            ts: Date.now(),
          });
        }

        if (cancelledRef.current) return;
        statesRef.current = states;
        initialRows.sort((a, b) => a.symbol.localeCompare(b.symbol));
        setRows(initialRows);
        setSeeded(true);
        setProgress({ done: initialRows.length, total: initialRows.length });

        // open WS connections in batches (avoid huge URL)
        const streamName = TF_TO_STREAM[timeframe];
        const streamSymbols = Array.from(states.keys()).map((s) => s.toLowerCase());

        // create batches for WS
        const wsBatches: string[][] = [];
        for (let i = 0; i < streamSymbols.length; i += BATCH_WS_SIZE) {
          wsBatches.push(streamSymbols.slice(i, i + BATCH_WS_SIZE));
        }

        // clear previous
        wsRefs.current.forEach((w) => { try { w.close(); } catch {} });
        wsRefs.current = [];

        // create WS per batch
        const createWs = (syms: string[]) => {
          const streams = syms.map((s) => `${s}@${streamName}`).join('/');
          const url = `wss://fstream.binance.com/stream?streams=${streams}`;
          let ws: WebSocket;
          try {
            ws = new WebSocket(url);
          } catch (err) {
            console.warn('WebSocket construction failed', err);
            return null;
          }

          ws.onopen = () => {
            console.info('WS open for batch', syms.length);
          };

          ws.onmessage = (ev: MessageEvent) => {
            try {
              const parsed = JSON.parse(ev.data as string);
              const k = parsed?.data?.k;
              if (!k) return;
              const symbol = k.s as string;
              const isFinal = !!k.x;
              const open = +k.o;
              const high = +k.h;
              const low = +k.l;
              const close = +k.c;
              const volume = +k.v;

              const st = statesRef.current.get(symbol);
              if (!st) return;

              const partial: Partial<Row> = { symbol, open, high, low, close, volume, ts: Date.now() };

              if (isFinal) {
                st.closes.push(close);
                if (st.closes.length > klimit) st.closes.shift();

                partial.rsi14 = lastRSI(st.closes, 14);
                partial.ema12 = lastEMA(st.closes, 12);
                partial.ema26 = lastEMA(st.closes, 26);
                partial.ema50 = lastEMA(st.closes, 50);
                partial.ema100 = lastEMA(st.closes, 100);
                partial.ema200 = lastEMA(st.closes, 200);
                const mm = lastMACD(st.closes, 12, 26, 9);
                partial.macd = mm.macd;
                partial.macdSignal = mm.signal;
                partial.macdHist = mm.hist;
              }

              batchRef.current[symbol] = { ...(batchRef.current[symbol] || {}), ...partial };
              scheduleFlush();
            } catch (err) {
              // ignore parse errors per frame
              // console.warn('ws msg parse err', err);
            }
          };

          ws.onerror = (e) => {
            console.warn('WS error', e);
            setErrors((prev) => [...prev, `ws error for batch (len ${syms.length})`].slice(-50));
          };

          ws.onclose = (ev) => {
            // try simple reconnect if not cancelled
            console.warn('WS closed, code=', (ev as CloseEvent).code);
            if (!cancelledRef.current) {
              setTimeout(() => { if (!cancelledRef.current) createWs(syms); }, 1500 + Math.random() * 1500);
            }
          };

          return ws;
        };

        for (const batch of wsBatches) {
          const w = createWs(batch);
          if (w) wsRefs.current.push(w);
        }

        console.info(`Connecting WebSocket for ${streamSymbols.length} Futures USDT pairs across ${wsRefs.current.length} connection(s).`);
      } catch (err: any) {
        console.error('useBinanceLive init failed', err);
        setErrors((p) => [...p, String(err)].slice(-50));
      }
    })();

    return () => {
      cancelledRef.current = true;
      wsRefs.current.forEach((w) => { try { w.close(); } catch {} });
      wsRefs.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe, maxSymbols, klimit]);

  const sorted = useMemo(() => [...rows].sort((a, b) => a.symbol.localeCompare(b.symbol)), [rows]);

  return { rows: sorted, seeded, progress, errors };
}
