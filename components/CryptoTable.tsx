'use client'
import React, { useEffect, useRef, useState } from 'react';

type Row = {
  symbol: string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
  ema12?: number | null;
  ema26?: number | null;
  ema50?: number | null;
  ema100?: number | null;
  ema200?: number | null;
  macd?: number | null;
  macdSignal?: number | null;
  macdHist?: number | null;
  rsi14?: number | null;
  ts?: number;
  finalSignal?: string;
};

interface Props {
  timeframe?: '15m' | '1h' | '4h' | '1d' | string;
  limit?: number;
  pollInterval?: number;
}

function fmt(v?: number|null, d=4) {
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return v.toFixed(d);
}

export default function CryptoTable({ timeframe = '1h', limit = 100, pollInterval = 30_000 }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const indexRef = useRef<Record<string, number>>({});
  const wsRef = useRef<WebSocket|null>(null);
  const pollRef = useRef<number|null>(null);

  const buildIndex = (arr: Row[]) => {
    const map: Record<string, number> = {};
    arr.forEach((r,i)=>map[r.symbol]=i);
    indexRef.current = map;
  };

  // fetch initial snapshot of indicators
  const fetchSnapshot = async () => {
    try {
      const res = await fetch(`/api/crypto?timeframe=${encodeURIComponent(timeframe)}&limit=${limit}&candles=500`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json() as Row[];
      setRows(data);
      buildIndex(data);
    } catch (err) {
      console.error('fetchSnapshot error', err);
    }
  };

  useEffect(()=>{
    fetchSnapshot();

    // polling for indicators/ohlc every pollInterval (server computes indicators)
    pollRef.current = window.setInterval(()=>{
      fetchSnapshot();
    }, pollInterval);

    // connect to Binance futures ticker websocket for live price updates
    // using combined stream for all tickers: fstream supports !ticker@arr on ws
    try {
      const ws = new WebSocket('wss://fstream.binance.com/ws/!ticker@arr');
      wsRef.current = ws;
      ws.onmessage = (ev)=>{
        try {
          const data = JSON.parse(ev.data);
          // data is array of tickers for many symbols; filter USDT futures symbols
          // Some endpoints send an array, sometimes object; handle both
          const list = Array.isArray(data) ? data : (data.data || data);
          if (!Array.isArray(list)) return;
          // create a map of updates for quick patching
          const updates: Record<string, Partial<Row>> = {};
          for (const t of list) {
            if (!t.s || !t.s.endsWith('USDT')) continue;
            const sym = t.s;
            const close = parseFloat(t.c);
            const open = parseFloat(t.o);
            const high = parseFloat(t.h);
            const low = parseFloat(t.l);
            const vol = parseFloat(t.v);
            updates[sym] = { symbol: sym, close, open, high, low, volume: vol };
          }
          // apply updates in one state update
          setRows(prev=>{
            if (prev.length===0) return prev;
            const next = prev.map(r=>{
              const u = updates[r.symbol];
              if (!u) return r;
              return { ...r, ...u, ts: Date.now() };
            });
            return next;
          });
        } catch (e) {}
      };
      ws.onopen = ()=>console.log('Binance ws open');
      ws.onerror = (e)=>console.warn('ws err', e);
      ws.onclose = ()=>console.warn('ws closed');
    } catch (err) {
      console.warn('ws connect failed', err);
    }

    return ()=>{
      if (wsRef.current) try{ wsRef.current.close() }catch(e){}
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
  }, [timeframe, limit, pollInterval]);

  return (
    <div className="p-4 overflow-x-auto">
      <h2 className="text-xl font-semibold mb-4">Timeframe: {timeframe}</h2>
      <table className="w-full table-auto border-collapse rounded-lg shadow-md">
        <thead>
          <tr className="bg-gray-800 text-white text-xs">
            <th className="p-2">Symbol</th>
            <th className="p-2">Open</th>
            <th className="p-2">High</th>
            <th className="p-2">Low</th>
            <th className="p-2">Close</th>
            <th className="p-2">RSI(14)</th>
            <th className="p-2">EMA12</th>
            <th className="p-2">EMA26</th>
            <th className="p-2">MACD</th>
            <th className="p-2">EMA50</th>
            <th className="p-2">EMA100</th>
            <th className="p-2">EMA200</th>
            <th className="p-2">Volume</th>
            <th className="p-2">Final</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r=>(
            <tr key={r.symbol} className="text-xs text-center border-b hover:bg-gray-100">
              <td className="p-2 font-semibold">{r.symbol}</td>
              <td className="p-2">{fmt(r.open)}</td>
              <td className="p-2">{fmt(r.high)}</td>
              <td className="p-2">{fmt(r.low)}</td>
              <td className="p-2">{fmt(r.close)}</td>
              <td className="p-2">{r.rsi14!=null? r.rsi14.toFixed(2) : '-'}</td>
              <td className="p-2">{r.ema12!=null? r.ema12.toFixed(4) : '-'}</td>
              <td className="p-2">{r.ema26!=null? r.ema26.toFixed(4) : '-'}</td>
              <td className="p-2">{r.macd!=null? r.macd.toFixed(4) : '-'}</td>
              <td className="p-2">{r.ema50!=null? r.ema50.toFixed(4) : '-'}</td>
              <td className="p-2">{r.ema100!=null? r.ema100.toFixed(4) : '-'}</td>
              <td className="p-2">{r.ema200!=null? r.ema200.toFixed(4) : '-'}</td>
              <td className="p-2">{r.volume? (r.volume/1e6).toFixed(2)+'M' : '-'}</td>
              <td className="p-2 font-bold">{r.finalSignal ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
