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
const KLIMIT_DEFAULT = 600; // enough for EMA200
const MAX_SYMBOLS_DEFAULT = 120; // keep UI fast & WS URL safe

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
  const exRes = await fetch(`${FAPI}/fapi/v1/exchangeInfo`);
  const ex = await exRes.json();
  const futuresUsdt = (ex.symbols ?? [])
    .filter((s: any) => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING')
    .map((s: any) => s.symbol.toLowerCase());

  try {
    const t24Res = await fetch(`${FAPI}/fapi/v1/ticker/24hr`);
    const t24 = await t24Res.json();
    const vol = new Map<string, number>();
    (t24 ?? []).forEach((t: any) => {
      if (t && typeof t.symbol === 'string' && t.symbol.endsWith('USDT')) {
        vol.set(t.symbol.toLowerCase(), parseFloat(t.volume) || 0);
      }
    });
    return [...futuresUsdt].sort((a, b) => (vol.get(b) || 0) - (vol.get(a) || 0)).slice(0, limit);
  } catch {
    return futuresUsdt.slice(0, limit);
  }
}

async function fetchKlines(symbol: string, tf: TF, limit = KLIMIT_DEFAULT): Promise<Kline[]> {
  const url = `${FAPI}/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${tf}&limit=${limit}`;
  const res = await fetch(url);
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

export function useBinanceLive(
  timeframe: TF,
  opts?: { maxSymbols?: number; klimit?: number }
): { rows: Row[] } {
  const klimit = opts?.klimit ?? KLIMIT_DEFAULT;
  const maxSymbols = opts?.maxSymbols ?? MAX_SYMBOLS_DEFAULT;

  const [rows, setRows] = useState<Row[]>([]);
  const statesRef = useRef<Map<string, PerSymbolState>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const batchRef = useRef<Record<string, Partial<Row>>>({});
  const scheduledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 1) pick symbols
        const syms = await fetchTopUsdtPerpSymbols(maxSymbols);
        if (cancelled || syms.length === 0) return;

        // 2) seed klines
        const seeded = await Promise.all(
          syms.map(async (s) => {
            try {
              const ks = await fetchKlines(s, timeframe, klimit);
              return { symbol: s.toUpperCase(), ks };
            } catch {
              return { symbol: s.toUpperCase(), ks: [] as Kline[] };
            }
          })
        );
        if (cancelled) return;

        // 3) build initial rows and states
        const nextRows: Row[] = [];
        const newStates = new Map<string, PerSymbolState>();

        for (const { symbol, ks } of seeded) {
          if (!ks.length) continue;
          const closes = ks.map((k: Kline) => k.close);
          newStates.set(symbol, { closes: [...closes] });

          const last = ks[ks.length - 1];
          const rsi = lastRSI(closes, 14);
          const ema12 = lastEMA(closes, 12);
          const ema26 = lastEMA(closes, 26);
          const ema50 = lastEMA(closes, 50);
          const ema100 = lastEMA(closes, 100);
          const ema200 = lastEMA(closes, 200);
          const m = lastMACD(closes, 12, 26, 9);

          nextRows.push({
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

        if (cancelled) return;
        statesRef.current = newStates;
        nextRows.sort((a, b) => a.symbol.localeCompare(b.symbol));
        setRows(nextRows);

        // 4) open WS for live updates
        const stream = TF_TO_STREAM[timeframe];
        const streamSyms = Array.from(newStates.keys()).map((s) => s.toLowerCase());
        if (!streamSyms.length) return;

        const streams = streamSyms.map((s) => `${s}@${stream}`).join('/');
        const ws = new WebSocket(`wss://fstream.binance.com/stream?streams=${streams}`);
        wsRef.current = ws;

        ws.onmessage = (ev: MessageEvent) => {
          try {
            const msg = JSON.parse(ev.data as string);
            const k = msg?.data?.k;
            if (!k) return;

            const symbol: string = k.s;     // upper-case
            const isFinal: boolean = !!k.x; // candle closed
            const open = +k.o;
            const high = +k.h;
            const low = +k.l;
            const close = +k.c;
            const volume = +k.v;

            const st = statesRef.current.get(symbol);
            if (!st) return;

            const partial: Partial<Row> = {
              symbol,
              open, high, low, close, volume,
              ts: Date.now(),
            };

            if (isFinal) {
              st.closes.push(close);
              if (st.closes.length > klimit) st.closes.shift();

              partial.rsi14 = lastRSI(st.closes, 14);
              partial.ema12 = lastEMA(st.closes, 12);
              partial.ema26 = lastEMA(st.closes, 26);
              partial.ema50 = lastEMA(st.closes, 50);
              partial.ema100 = lastEMA(st.closes, 100);
              partial.ema200 = lastEMA(st.closes, 200);
              const m = lastMACD(st.closes, 12, 26, 9);
              partial.macd = m.macd;
              partial.macdSignal = m.signal;
              partial.macdHist = m.hist;
            }

            // batch updates to avoid re-render storms
            batchRef.current[symbol] = { ...(batchRef.current[symbol] || {}), ...partial };
            if (!scheduledRef.current) {
              scheduledRef.current = true;
              (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: any) => setTimeout(cb, 16))(
                () => {
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
                }
              );
            }
          } catch {
            // ignore malformed WS frames
          }
        };

        ws.onerror = () => { /* optional log */ };
      } catch {
        // init errors ignored to keep UI up
      }
    })();

    return () => {
      cancelled = true;
      try { wsRef.current?.close(); } catch { /* noop */ }
    };
  }, [timeframe, klimit, maxSymbols]);

  const sorted = useMemo(() => [...rows].sort((a, b) => a.symbol.localeCompare(b.symbol)), [rows]);
  return { rows: sorted };
}
