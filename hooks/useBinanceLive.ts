// hooks/useBinanceLive.ts
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { seedEMA, nextEMA, seedMACD, nextMACD, seedRSI, nextRSI, EMAState, MACDState, RSIState } from '@/lib/ta';

export type TF = '15m' | '1h' | '4h' | '1d';

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

const TF_TO_STREAM: Record<TF, string> = {
  '15m': 'kline_15m',
  '1h': 'kline_1h',
  '4h': 'kline_4h',
  '1d': 'kline_1d',
};

const KLIMIT = 600;           // enough for accurate EMA200/RSI seed
const MAX_SYMBOLS = 60;       // keep UI snappy; raise if your device can handle more
const FAPI = 'https://fapi.binance.com';

// -------- helpers --------
async function fetchUsdtPerpSymbols(): Promise<string[]> {
  const ex = await fetch(`${FAPI}/fapi/v1/exchangeInfo`).then(r => r.json());
  const syms: string[] = ex.symbols
    .filter((s: any) => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING')
    .map((s: any) => s.symbol.toLowerCase());

  // Rank by 24h volume to pick most active first (optional but useful)
  try {
    const t24 = await fetch(`${FAPI}/fapi/v1/ticker/24hr`).then(r => r.json());
    const vol = new Map<string, number>();
    t24.forEach((t: any) => {
      if (t.symbol.endsWith('USDT')) vol.set(t.symbol.toLowerCase(), parseFloat(t.volume));
    });
    return [...syms].sort((a, b) => (vol.get(b) || 0) - (vol.get(a) || 0)).slice(0, MAX_SYMBOLS);
  } catch {
    return syms.slice(0, MAX_SYMBOLS);
  }
}

async function fetchKlines(symbol: string, tf: TF, limit = KLIMIT) {
  const url = `${FAPI}/fapi/v1/klines?symbol=${symbol.toUpperCase()}&interval=${tf}&limit=${limit}`;
  const arr = await fetch(url).then(r => r.json());
  return arr.map((k: any[]) => ({
    openTime: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5], closeTime: k[6],
  }));
}

export function useBinanceLive(timeframe: TF) {
  const [rows, setRows] = useState<Row[]>([]);
  const statesRef = useRef<Map<string, PerSymbolState>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const batchRef = useRef<Record<string, Row>>({});
  const scheduledRef = useRef<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1) pick symbols
      const symbols = await fetchUsdtPerpSymbols();
      if (cancelled) return;

      // 2) seed each symbol with historical klines and build indicator states
      const seededRows: Row[] = [];
      const stateMap = new Map<string, PerSymbolState>();

      const klinesAll = await Promise.all(
        symbols.map(async (s) => {
          const ks = await fetchKlines(s, timeframe, KLIMIT);
          return { s, ks };
        })
      );
      if (cancelled) return;

      for (const { s, ks } of klinesAll) {
        if (!ks.length) continue;
        const closes = ks.map((x) => x.close);

        const ema50 = seedEMA(50, closes);
        const ema100 = seedEMA(100, closes);
        const ema200 = seedEMA(200, closes);
        const macd = seedMACD(closes, 12, 26, 9);
        const rsi = seedRSI(closes, 14);

        const last = ks[ks.length - 1];
        const symbolU = s.toUpperCase();

        stateMap.set(symbolU, { closes: [...closes], ema50, ema100, ema200, macd, rsi });

        seededRows.push({
          symbol: symbolU,
          open: last.open,
          high: last.high,
          low: last.low,
          close: last.close,
          volume: last.volume,
          rsi14: (() => {
            if (rsi.avgGain == null || rsi.avgLoss == null) return null;
            if (rsi.avgLoss === 0) return 100;
            const rs = rsi.avgGain / rsi.avgLoss;
            return 100 - 100 / (1 + rs);
          })(),
          ema12: macd.emaFast.value,
          ema26: macd.emaSlow.value,
          ema50: ema50.value,
          ema100: ema100.value,
          ema200: ema200.value,
          macd: macd.macd,
          macdSignal: macd.signal.value,
          macdHist: macd.macd != null && macd.signal.value != null ? macd.macd - macd.signal.value : null,
          ts: Date.now(),
        });
      }

      if (cancelled) return;
      statesRef.current = stateMap;
      setRows(seededRows.sort((a, b) => a.symbol.localeCompare(b.symbol)));

      // 3) open combined WS for this timeframe
      const stream = TF_TO_STREAM[timeframe];
      const streams = symbols.map((s) => `${s}@${stream}`).join('/');
      const url = `wss://fstream.binance.com/stream?streams=${streams}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        const k = msg?.data?.k;
        if (!k) return;

        const symbol = k.s as string; // UPPERCASE
        const isFinal = !!k.x;
        const open = +k.o, high = +k.h, low = +k.l, close = +k.c, volume = +k.v;

        const map = statesRef.current;
        const st = map.get(symbol);
        if (!st) return;

        // Update live OHLCV immediately
        const partial: Row = {
          symbol,
          open, high, low, close, volume,
          rsi14: null,
          ema12: null, ema26: null, ema50: null, ema100: null, ema200: null,
          macd: null, macdSignal: null, macdHist: null,
          ts: Date.now(),
        };

        // On candle close, advance indicators incrementally
        if (isFinal) {
          st.closes.push(close);
          if (st.closes.length > KLIMIT) st.closes.shift();

          // Big EMAs
          st.ema50 = st.ema50.value == null ? seedEMA(50, st.closes) : nextEMA(st.ema50, close);
          st.ema100 = st.ema100.value == null ? seedEMA(100, st.closes) : nextEMA(st.ema100, close);
          st.ema200 = st.ema200.value == null ? seedEMA(200, st.closes) : nextEMA(st.ema200, close);

          // MACD (fast/slow + signal)
          const m = nextMACD(st.macd, close);
          st.macd = m.state;

          // RSI
          const r = nextRSI(st.rsi, close);
          st.rsi = r.state;

          partial.ema12 = st.macd.emaFast.value;
          partial.ema26 = st.macd.emaSlow.value;
          partial.ema50 = st.ema50.value;
          partial.ema100 = st.ema100.value;
          partial.ema200 = st.ema200.value;
          partial.macd = m.macd;
          partial.macdSignal = m.signal;
          partial.macdHist = m.hist;
          partial.rsi14 = r.rsi;
        }

        // Batch UI updates to avoid re-render storms
        batchRef.current[symbol] = partial;
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
      };

      ws.onopen = () => {
        // eslint-disable-next-line no-console
        console.log(`✅ WS open (${timeframe}) for ${symbols.length} USDT perpetuals`);
      };
      ws.onerror = (e) => {
        // eslint-disable-next-line no-console
        console.warn('WS error', timeframe, e);
      };
      ws.onclose = () => {
        // eslint-disable-next-line no-console
        console.warn('WS closed', timeframe);
      };
    })();

    return () => {
      cancelled = true;
      wsRef.current?.close();
    };
  }, [timeframe]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [rows]);

  return { rows: sorted };
}
