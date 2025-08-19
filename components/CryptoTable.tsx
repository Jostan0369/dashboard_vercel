// components/CryptoTable.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { calculateEMA, calculateRSI, calculateMACD } from '../lib/indicators';

type TF = '15m' | '1h' | '4h' | '1d';

type Row = {
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

const FAPI = 'https://fapi.binance.com';
const KLIMIT = 300;              // enough history for EMA200; keep moderate
const DEFAULT_LIMIT = 40;        // start small for speed
const CONCURRENCY = 6;           // REST parallelism during seeding
const BATCH_WS_SIZE = 30;        // symbols per websocket

function fmt(n: number | null | undefined, d = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return '-';
  return Number.isFinite(n) ? n.toFixed(d) : '-';
}

interface Props {
  timeframe?: TF;
  limit?: number;
  title?: string;
}

export default function CryptoTable({ timeframe = '15m', limit = DEFAULT_LIMIT, title }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [errors, setErrors] = useState<string[]>([]);

  const statesRef = useRef<Map<string, { closes: number[] }>>(new Map());
  const wsRefs = useRef<WebSocket[]>([]);
  const batchRef = useRef<Record<string, Partial<Row>>>({});
  const scheduledRef = useRef(false);
  const cancelledRef = useRef(false);

  function scheduleFlush() {
    if (scheduledRef.current) return;
    scheduledRef.current = true;
    (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: any) => setTimeout(cb, 16))(() => {
      const updates = batchRef.current;
      batchRef.current = {};
      scheduledRef.current = false;
      setRows((prev) => {
        if (!prev.length) return prev;
        const map = new Map(prev.map((r, i) => [r.symbol, i]));
        const next = [...prev];
        for (const [sym, u] of Object.entries(updates)) {
          const i = map.get(sym);
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

  useEffect(() => {
    cancelledRef.current = false;
    setSeeded(false);
    setProgress({ done: 0, total: 0 });
    setErrors([]);
    setRows([]);

    (async () => {
      try {
        // 1) Fetch all USDT perpetual futures symbols
        const exRes = await fetch(`${FAPI}/fapi/v1/exchangeInfo`);
        if (!exRes.ok) throw new Error('Failed to fetch exchangeInfo');
        const ex = await exRes.json();
        const allSymbols: string[] = (ex.symbols ?? [])
          .filter((s: any) => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING')
          .map((s: any) => s.symbol.toUpperCase());

        // 2) Rank by 24h volume, pick top N (limit)
        let top = allSymbols.slice(0, limit);
        try {
          const tRes = await fetch(`${FAPI}/fapi/v1/ticker/24hr`);
          if (tRes.ok) {
            const t24 = await tRes.json();
            const vol = new Map<string, number>();
            (t24 ?? []).forEach((t: any) => {
              if (t?.symbol?.endsWith('USDT')) vol.set(t.symbol.toUpperCase(), parseFloat(t.volume) || 0);
            });
            top = [...allSymbols].sort((a, b) => (vol.get(b) || 0) - (vol.get(a) || 0)).slice(0, limit);
          }
        } catch {
          // ignore and keep 'top'
        }

        if (cancelledRef.current) return;
        setProgress({ done: 0, total: top.length });

        // 3) Seed klines (browser → Binance) with small concurrency
        const seededList: { symbol: string; closes: number[]; lastK: { open: number; high: number; low: number; close: number; volume: number } | null }[] = [];
        for (let i = 0; i < top.length; i += CONCURRENCY) {
          const batch = top.slice(i, i + CONCURRENCY);
          const results = await Promise.all(
            batch.map(async (sym) => {
              try {
                const url = `${FAPI}/fapi/v1/klines?symbol=${encodeURIComponent(sym)}&interval=${timeframe}&limit=${KLIMIT}`;
                const r = await fetch(url);
                if (!r.ok) return { symbol: sym, closes: [] as number[], lastK: null };
                const arr = await r.json();
                if (!Array.isArray(arr) || arr.length === 0) return { symbol: sym, closes: [] as number[], lastK: null };
                const closes = arr.map((k: any[]) => +k[4]);
                const lastRaw = arr[arr.length - 1];
                const lastK = {
                  open: +lastRaw[1],
                  high: +lastRaw[2],
                  low: +lastRaw[3],
                  close: +lastRaw[4],
                  volume: +lastRaw[5],
                };
                return { symbol: sym, closes, lastK };
              } catch (err) {
                return { symbol: sym, closes: [] as number[], lastK: null };
              }
            })
          );
          seededList.push(...results);
          setProgress((p) => ({ done: Math.min(p.total, p.done + results.length), total: p.total || top.length }));
        }

        if (cancelledRef.current) return;

        // 4) Build initial rows + in-memory state
        const states = new Map<string, { closes: number[] }>();
        const initRows: Row[] = [];

        for (const item of seededList) {
          const { symbol, closes, lastK } = item;
          if (!closes.length || !lastK) {
            initRows.push({
              symbol,
              open: NaN, high: NaN, low: NaN, close: NaN, volume: NaN,
              rsi14: null, macd: null,
              ema12: null, ema26: null, ema50: null, ema100: null, ema200: null,
              ts: Date.now(),
            });
            continue;
          }

        states.set(symbol, { closes: [...closes] });

          let rsi14: number | null = null;
          let macdVal: number | null = null;
          let ema12: number | null = null;
          let ema26: number | null = null;
          let ema50: number | null = null;
          let ema100: number | null = null;
          let ema200: number | null = null;

          if (closes.length >= 200) {
            rsi14 = calculateRSI(closes, 14);
            ema12 = calculateEMA(closes, 12);
            ema26 = calculateEMA(closes, 26);
            ema50 = calculateEMA(closes, 50);
            ema100 = calculateEMA(closes, 100);
            ema200 = calculateEMA(closes, 200);
            macdVal = calculateMACD(closes).macd;
          }

          initRows.push({
            symbol,
            open: lastK.open, high: lastK.high, low: lastK.low, close: lastK.close, volume: lastK.volume,
            rsi14: rsi14, macd: macdVal,
            ema12, ema26, ema50, ema100, ema200,
            ts: Date.now(),
          });
        }

        statesRef.current = states;
        initRows.sort((a, b) => a.symbol.localeCompare(b.symbol));
        setRows(initRows);
        setSeeded(true);

        // 5) Open websockets in batches
        const stream = timeframe === '15m' ? 'kline_15m'
                     : timeframe === '1h'  ? 'kline_1h'
                     : timeframe === '4h'  ? 'kline_4h'
                     :                        'kline_1d';

        const streamSymbols = Array.from(states.keys()).map((s) => s.toLowerCase());
        const wsBatches: string[][] = [];
        for (let i = 0; i < streamSymbols.length; i += BATCH_WS_SIZE) wsBatches.push(streamSymbols.slice(i, i + BATCH_WS_SIZE));

        wsRefs.current.forEach((w) => { try { w.close(); } catch {} });
        wsRefs.current = [];

        const createWsFor = (syms: string[]) => {
          const streams = syms.map((s) => `${s}@${stream}`).join('/');
          const url = `wss://fstream.binance.com/stream?streams=${streams}`;
          let ws: WebSocket;
          try { ws = new WebSocket(url); } catch { return null; }

          ws.onmessage = (ev: MessageEvent) => {
            try {
              const parsed = JSON.parse(ev.data as string);
              const k = parsed?.data?.k;
              if (!k) return;
              const symbol = k.s as string;
              const isFinal = !!k.x;
              const open = +k.o;
              const high = +k.h;
              const low  = +k.l;
              const close= +k.c;
              const volume = +k.v;

              const st = statesRef.current.get(symbol);
              if (!st) return;

              const partial: Partial<Row> = { symbol, open, high, low, close, volume, ts: Date.now() };

              if (isFinal) {
                st.closes.push(close);
                if (st.closes.length > KLIMIT) st.closes.shift();

                if (st.closes.length >= 200) {
                  partial.rsi14 = calculateRSI(st.closes, 14);
                  partial.ema12 = calculateEMA(st.closes, 12);
                  partial.ema26 = calculateEMA(st.closes, 26);
                  partial.ema50 = calculateEMA(st.closes, 50);
                  partial.ema100 = calculateEMA(st.closes, 100);
                  partial.ema200 = calculateEMA(st.closes, 200);
                  partial.macd  = calculateMACD(st.closes).macd;
                }
              }

              batchRef.current[symbol] = { ...(batchRef.current[symbol] || {}), ...partial };
              scheduleFlush();
            } catch {
              // ignore malformed messages
            }
          };

          ws.onerror = () => {};
          ws.onclose = () => {
            if (!cancelledRef.current) setTimeout(() => { if (!cancelledRef.current) createWsFor(syms); }, 1500 + Math.random() * 1500);
          };

          return ws;
        };

        for (const b of wsBatches) {
          const w = createWsFor(b);
          if (w) wsRefs.current.push(w);
        }
        console.info(`Fetched symbols: ${streamSymbols.length}. WS connections: ${wsRefs.current.length}`);
      } catch (err: any) {
        setErrors((p) => [...p, String(err)].slice(-50));
      }
    })();

    return () => {
      cancelledRef.current = true;
      wsRefs.current.forEach((w) => { try { w.close(); } catch {} });
      wsRefs.current = [];
    };
  }, [timeframe, limit]);

  const list = useMemo(() => rows.slice(0, limit), [rows, limit]);

  return (
    <div className="p-4 overflow-x-auto">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">{title ?? 'USDT Futures'} • {timeframe}</h2>
        <div className="text-sm text-gray-500">{seeded ? 'Seeded' : `Seeding ${progress.done}/${progress.total}`}</div>
      </div>

      {!seeded ? (
        <div className="text-center py-8 text-gray-500">⏳ Loading candles & computing indicators ({progress.done}/{progress.total})...</div>
      ) : (
        <table className="w-full table-auto border-collapse rounded-lg shadow-md text-xs">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className="p-2 text-left">Symbol</th>
              <th className="p-2">Open</th>
              <th className="p-2">High</th>
              <th className="p-2">Low</th>
              <th className="p-2">Close</th>
              <th className="p-2">Volume</th>
              <th className="p-2">RSI</th>
              <th className="p-2">MACD</th>
              <th className="p-2">EMA12</th>
              <th className="p-2">EMA26</th>
              <th className="p-2">EMA50</th>
              <th className="p-2">EMA100</th>
              <th className="p-2">EMA200</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.symbol} className="border-b hover:bg-gray-50">
                <td className="p-2 font-semibold">{r.symbol}</td>
                <td className="p-2 text-right">{fmt(r.open, 4)}</td>
                <td className="p-2 text-right">{fmt(r.high, 4)}</td>
                <td className="p-2 text-right">{fmt(r.low, 4)}</td>
                <td className="p-2 text-right">{fmt(r.close, 4)}</td>
                <td className="p-2 text-right">{fmt(r.volume, 2)}</td>
                <td className="p-2 text-right">{fmt(r.rsi14, 2)}</td>
                <td className="p-2 text-right">{fmt(r.macd, 4)}</td>
                <td className="p-2 text-right">{fmt(r.ema12, 4)}</td>
                <td className="p-2 text-right">{fmt(r.ema26, 4)}</td>
                <td className="p-2 text-right">{fmt(r.ema50, 4)}</td>
                <td className="p-2 text-right">{fmt(r.ema100, 4)}</td>
                <td className="p-2 text-right">{fmt(r.ema200, 4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {errors.length > 0 && (
        <div className="mt-2 text-xs text-red-600">
          {errors.slice(-3).map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}
    </div>
  );
}
