// hooks/useBinanceLive.ts
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { lastEMA, lastRSI, lastMACD } from '@/lib/ta';

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

type PerSymbolState = {
  closes: number[]; // array of closes (old -> new)
};

const FAPI = 'https://fapi.binance.com';
const KLIMIT = 600;     // enough for EMA200 and RSI seed
const MAX_SYMBOLS = 60; // adjust to taste; higher = heavier on browser

const TF_TO_STREAM: Record<TF, string> = {
  '15m': 'kline_15m',
  '1h': 'kline_1h',
  '4h': 'kline_4h',
  '1d': 'kline_1d',
};

async function fetchTopUsdtPerpSymbols(limit: number): Promise<string[]> {
  const ex = await fetch(`${FAPI}/fapi/v1/exchangeInfo`).then((r) => r.json());
  const all: string[] = ex.symbols
    .filter((s: any) => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING')
    .map((s: any) => s.symbol.toLowerCase());

  try {
    const tick24 = await fetch(`${FAPI}/fapi/v1/ticker/24hr`).then((r) => r.json());
    const volMap = new Map<string, number>();
    tick24.forEach((t: any) => {
      if (typeof t.symbol === 'string' && t.symbol.endsWith('USDT')) volMap.set(t.symbol.toLowerCase(), parseFloat(t.volume));
    });
    return [...all].sort((a, b) => (volMap.get(b) || 0) - (volMap.get(a) || 0)).slice(0, limit);
  } catch {
    return all.slice(0, limit);
  }
}

async function fetchKlines(symbol: string, tf: TF, limit = KLIMIT) {
  const url = `${FAPI}/fapi/v1/klines?symbol=${symbol.toUpperCase()}&interval=${tf}&limit=${limit}`;
  const data = await fetch(url).then((r) => r.json());
  // data is array of arrays - convert to typed objects
  return data.map((k: any[]) => ({
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
  const klimit = opts?.klimit ?? KLIMIT;
  const maxSymbols = opts?.maxSymbols ?? MAX_SYMBOLS;

  const [rows, setRows] = useState<Row[]>([]);
  const statesRef = useRef<Map<string, PerSymbolState>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const batchRef = useRef<Record<string, Partial<Row>>>({});
  const scheduledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 1) pick top symbols
        const symbols = await fetchTopUsdtPerpSymbols(maxSymbols);
        if (cancelled) return;

        // 2) fetch historical klines for each symbol (parallel)
        const klinesAll = await Promise.all(
          symbols.map(async (s) => {
            try {
              const ks = await fetchKlines(s, timeframe, klimit);
              return { symbol: s.toUpperCase(), ks };
            } catch (e) {
              return { symbol: s.toUpperCase(), ks: [] as any[] };
            }
          })
        );
        if (cancelled) return;

        // 3) build initial states + rows
        const initialRows: Row[] = [];
        const states = new Map<string, PerSymbolState>();
        for (const item of klinesAll) {
          const { symbol, ks } = item;
          if (!ks || ks.length === 0) continue;
          const closes = ks.map((k) => k.close);
          states.set(symbol, { closes: [...closes] });

          const last = ks[ks.length - 1];
          const rsi = lastRSI(closes, 14);
          const ema12 = lastEMA(closes, 12);
          const ema26 = lastEMA(closes, 26);
          const ema50 = lastEMA(closes, 50);
          const ema100 = lastEMA(closes, 100);
          const ema200 = lastEMA(closes, 200);
          const macdVals = lastMACD(closes, 12, 26, 9);

          initialRows.push({
            symbol,
            open: last.open,
            high: last.high,
            low: last.low,
            close: last.close,
            volume: last.volume,
            rsi14: rsi,
            macd: macdVals.macd,
            macdSignal: macdVals.signal,
            macdHist: macdVals.hist,
            ema12,
            ema26,
            ema50,
            ema100,
            ema200,
            ts: Date.now(),
          });
        }

        if (cancelled) return;
        statesRef.current = states;
        // sort alphabetically for stable UI
        initialRows.sort((a, b) => a.symbol.localeCompare(b.symbol));
        setRows(initialRows);

        // 4) open combined kline WS for this timeframe
        // build streams - warning: many streams make long URL; MAX_SYMBOLS keeps this reasonable
        const streamName = TF_TO_STREAM[timeframe];
        const streams = Array.from(states.keys())
          .map((s) => `${s.toLowerCase()}@${streamName}`)
          .join('/');
        const wsUrl = `wss://fstream.binance.com/stream?streams=${streams}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          // console.log('WS open', timeframe);
        };

        ws.onmessage = (ev: MessageEvent) => {
          try {
            const parsed = JSON.parse(ev.data as string);
            const k = parsed?.data?.k;
            if (!k) return;
            const symbol: string = k.s;
            const isFinal: boolean = !!k.x;
            const open = +k.o;
            const high = +k.h;
            const low = +k.l;
            const close = +k.c;
            const volume = +k.v;

            const st = statesRef.current.get(symbol);
            if (!st) return;

            // always update live price
            const livePartial: Partial<Row> = {
              symbol,
              open,
              high,
              low,
              close,
              volume,
              ts: Date.now(),
            };

            if (isFinal) {
              // append closed candle and compute indicators
              st.closes.push(close);
              if (st.closes.length > klimit) st.closes.shift();

              // compute fresh indicators (fast, robust)
              const rsiVal = lastRSI(st.closes, 14);
              const ema12Val = lastEMA(st.closes, 12);
              const ema26Val = lastEMA(st.closes, 26);
              const ema50Val = lastEMA(st.closes, 50);
              const ema100Val = lastEMA(st.closes, 100);
              const ema200Val = lastEMA(st.closes, 200);
              const macdVals = lastMACD(st.closes, 12, 26, 9);

              livePartial.rsi14 = rsiVal;
              livePartial.ema12 = ema12Val;
              livePartial.ema26 = ema26Val;
              livePartial.ema50 = ema50Val;
              livePartial.ema100 = ema100Val;
              livePartial.ema200 = ema200Val;
              livePartial.macd = macdVals.macd;
              livePartial.macdSignal = macdVals.signal;
              livePartial.macdHist = macdVals.hist;
            }

            // batch updates
            batchRef.current[symbol] = { ...(batchRef.current[symbol] || {}), ...livePartial };
            if (!scheduledRef.current) {
              scheduledRef.current = true;
              requestAnimationFrame(() => {
                const updates = batchRef.current;
                batchRef.current = {};
                scheduledRef.current = false;

                setRows((prev) => {
                  if (prev.length === 0) return prev;
                  const indexMap = new Map(prev.map((r, i) => [r.symbol, i]));
                  const next = [...prev];
                  for (const [sym, u] of Object.entries(updates)) {
                    const idx = indexMap.get(sym);
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
                      ema12: u.ema12 ?? base.ema12,
                      ema26: u.ema26 ?? base.ema26,
                      ema50: u.ema50 ?? base.ema50,
                      ema100: u.ema100 ?? base.ema100,
                      ema200: u.ema200 ?? base.ema200,
                      macd: u.macd ?? base.macd,
                      macdSignal: u.macdSignal ?? base.macdSignal,
                      macdHist: u.macdHist ?? base.macdHist,
                      ts: u.ts ?? base.ts,
                    };
                  }
                  return next;
                });
              });
            }
          } catch (err) {
            // swallow per-message parsing errors
            // console.warn('WS msg parse error', err);
          }
        };

        ws.onerror = (e) => {
          // console.warn('WS error', e);
        };

        ws.onclose = () => {
          // console.warn('WS closed', timeframe);
        };
      } catch (err) {
        // console.error('useBinanceLive init error', err);
      }
    })();

    return () => {
      cancelled = true;
      wsRef.current?.close();
    };
  }, [timeframe, klimit, maxSymbols]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [rows]);

  return { rows: sorted };
}
