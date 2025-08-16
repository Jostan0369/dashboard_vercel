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
  closes: number[]; // historical closes oldest->newest
};

const FAPI = 'https://fapi.binance.com';
const KLIMIT_DEFAULT = 600;     // enough for EMA200/RSI seed
const MAX_SYMBOLS_DEFAULT = 60; // keep UI responsive

const TF_TO_STREAM: Record<TF, string> = {
  '15m': 'kline_15m',
  '1h': 'kline_1h',
  '4h': 'kline_4h',
  '1d': 'kline_1d',
};

async function fetchTopUsdtPerpSymbols(limit: number): Promise<string[]> {
  const exResp = await fetch(`${FAPI}/fapi/v1/exchangeInfo`);
  const ex = await exResp.json();
  const all: string[] = (ex.symbols ?? [])
    .filter((s: any) => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING')
    .map((s: any) => s.symbol.toLowerCase());

  try {
    const t24Resp = await fetch(`${FAPI}/fapi/v1/ticker/24hr`);
    const t24 = await t24Resp.json();
    const volMap = new Map<string, number>();
    (t24 ?? []).forEach((t: any) => {
      if (t && typeof t.symbol === 'string' && t.symbol.endsWith('USDT')) {
        volMap.set(t.symbol.toLowerCase(), parseFloat(t.volume) || 0);
      }
    });
    return [...all].sort((a, b) => (volMap.get(b) || 0) - (volMap.get(a) || 0)).slice(0, limit);
  } catch {
    return all.slice(0, limit);
  }
}

type Kline = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
};

async function fetchKlines(symbol: string, tf: TF, limit = KLIMIT_DEFAULT): Promise<Kline[]> {
  const url = `${FAPI}/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${tf}&limit=${limit}`;
  const res = await fetch(url);
  const arr = await res.json();
  // arr is array of arrays
  return (arr ?? []).map((k: any[]) => ({
    openTime: k[0],
    open: +k[1],
    high: +k[2],
    low: +k[3],
    close: +k[4],
    volume: +k[5],
    closeTime: k[6],
  }));
}

// hooks/useBinanceLive.ts
export function useBinanceLive(timeframe: TF, opts?: { maxSymbols?: number; klimit?: number }) { ... }
export type TF = '15m' | '1h' | '4h' | '1d';
export type Row = { symbol: string; open: number; high: number; low: number; close: number; volume: number; rsi14: number|null; macd: number|null; ema12: number|null; ema26: number|null; ema50: number|null; ema100: number|null; ema200: number|null; ts: number; };


  const [rows, setRows] = useState<Row[]>([]);
  const statesRef = useRef<Map<string, PerSymbolState>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const batchRef = useRef<Record<string, Partial<Row>>>({});
  const scheduledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 1) choose top symbols
        const symbols = await fetchTopUsdtPerpSymbols(maxSymbols);
        if (cancelled) return;

        // 2) load historical klines (parallel)
        const klinesAll = await Promise.all(
          symbols.map(async (s) => {
            try {
              const ks = await fetchKlines(s, timeframe, klimit);
              return { symbol: s.toUpperCase(), ks };
            } catch (err) {
              return { symbol: s.toUpperCase(), ks: [] as Kline[] };
            }
          })
        );
        if (cancelled) return;

        // 3) seed states and initial rows
        const initialRows: Row[] = [];
        const states = new Map<string, PerSymbolState>();

        for (const item of klinesAll) {
          const symbol = item.symbol;
          const ks = item.ks;
          if (!ks || ks.length === 0) continue;

          const closes: number[] = ks.map((k: Kline) => k.close);
          states.set(symbol, { closes: [...closes] });

          const last = ks[ks.length - 1];
          const rsiVal = lastRSI(closes, 14);
          const ema12Val = lastEMA(closes, 12);
          const ema26Val = lastEMA(closes, 26);
          const ema50Val = lastEMA(closes, 50);
          const ema100Val = lastEMA(closes, 100);
          const ema200Val = lastEMA(closes, 200);
          const macdVals = lastMACD(closes, 12, 26, 9);

          initialRows.push({
            symbol,
            open: last.open,
            high: last.high,
            low: last.low,
            close: last.close,
            volume: last.volume,
            rsi14: rsiVal,
            macd: macdVals.macd,
            macdSignal: macdVals.signal,
            macdHist: macdVals.hist,
            ema12: ema12Val,
            ema26: ema26Val,
            ema50: ema50Val,
            ema100: ema100Val,
            ema200: ema200Val,
            ts: Date.now(),
          });
        }

        if (cancelled) return;
        statesRef.current = states;
        initialRows.sort((a, b) => a.symbol.localeCompare(b.symbol));
        setRows(initialRows);

        // 4) open combined kline WebSocket for timeframe
        const streamName = TF_TO_STREAM[timeframe];
        // use only symbols we have states for (some may have been skipped)
        const streamSymbols = Array.from(states.keys()).map((s) => s.toLowerCase());
        if (streamSymbols.length === 0) return;

        const streams = streamSymbols.map((s) => `${s}@${streamName}`).join('/');
        const wsUrl = `wss://fstream.binance.com/stream?streams=${streams}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

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

            const partial: Partial<Row> = {
              symbol,
              open,
              high,
              low,
              close,
              volume,
              ts: Date.now(),
            };

            if (isFinal) {
              st.closes.push(close);
              if (st.closes.length > klimit) st.closes.shift();

              // compute indicators from st.closes
              const rsiVal = lastRSI(st.closes, 14);
              const ema12Val = lastEMA(st.closes, 12);
              const ema26Val = lastEMA(st.closes, 26);
              const ema50Val = lastEMA(st.closes, 50);
              const ema100Val = lastEMA(st.closes, 100);
              const ema200Val = lastEMA(st.closes, 200);
              const macdVals = lastMACD(st.closes, 12, 26, 9);

              partial.rsi14 = rsiVal;
              partial.macd = macdVals.macd;
              partial.macdSignal = macdVals.signal;
              partial.macdHist = macdVals.hist;
              partial.ema12 = ema12Val;
              partial.ema26 = ema26Val;
              partial.ema50 = ema50Val;
              partial.ema100 = ema100Val;
              partial.ema200 = ema200Val;
            }

            // batch updates
            batchRef.current[symbol] = { ...(batchRef.current[symbol] || {}), ...partial };
            if (!scheduledRef.current) {
              scheduledRef.current = true;
              requestAnimationFrame(() => {
                const updates = batchRef.current;
                batchRef.current = {};
                scheduledRef.current = false;

                setRows((prev) => {
                  if (prev.length === 0) return prev;
                  const idxMap = new Map(prev.map((r, i) => [r.symbol, i]));
                  const next = [...prev];
                  for (const [sym, u] of Object.entries(updates)) {
                    const i = idxMap.get(sym);
                    if (i == null) continue;
                    const base = next[i];
                    next[i] = {
                      ...base,
                      open: u.open ?? base.open,
                      high: u.high ?? base.high,
                      low: u.low ?? base.low,
                      close: u.close ?? base.close,
                      volume: u.volume ?? base.volume,
                      rsi14: u.rsi14 ?? base.rsi14,
                      macd: u.macd ?? base.macd,
                      macdSignal: u.macdSignal ?? base.macdSignal,
                      macdHist: u.macdHist ?? base.macdHist,
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
            }
          } catch {
            // ignore parse errors
          }
        };

        ws.onerror = () => {
          // ignore or log if desired
        };

      } catch {
        // initialization error
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

