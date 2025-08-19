// components/CryptoTable.tsx
"use client";

import React, { useEffect, useState } from "react";
import { calculateRSI, calculateEMA, calculateMACD } from "@/lib/indicators";

type Kline = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type RowData = {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  rsi: number;
  ema12: number;
  ema26: number;
  ema50: number;
  ema100: number;
  ema200: number;
  macd: number;
};

const CryptoTable = () => {
  const [rows, setRows] = useState<RowData[]>([]);

  useEffect(() => {
    const ws = new WebSocket(
      "wss://fstream.binance.com/ws/!miniTicker@arr"
    );

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        const updates: RowData[] = [];

        for (const ticker of data) {
          const symbol = ticker.s;

          // Fetch recent klines for indicator calc
          const res = await fetch(
            `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=15m&limit=200`
          );
          if (!res.ok) continue;
          const klinesRaw = await res.json();

          const klines: Kline[] = klinesRaw.map((k: any) => ({
            time: k[0],
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
          }));

          const closes = klines.map((k) => k.close);

          // Indicators
          const rsi = calculateRSI(closes, 14);
          const ema12 = calculateEMA(closes, 12);
          const ema26 = calculateEMA(closes, 26);
          const ema50 = calculateEMA(closes, 50);
          const ema100 = calculateEMA(closes, 100);
          const ema200 = calculateEMA(closes, 200);
          const macd = calculateMACD(closes, 12, 26, 9);

          updates.push({
            symbol,
            open: klines[klines.length - 1].open,
            high: klines[klines.length - 1].high,
            low: klines[klines.length - 1].low,
            close: klines[klines.length - 1].close,
            rsi,
            ema12,
            ema26,
            ema50,
            ema100,
            ema200,
            macd,
          });
        }

        setRows(updates);
      } catch (err) {
        console.error("Error:", err);
      }
    };

    return () => ws.close();
  }, []);

  return (
    <div className="overflow-x-auto p-4">
      <table className="min-w-full border-collapse border border-gray-300 text-sm text-white">
        <thead>
          <tr className="bg-gray-800">
            <th className="border px-2 py-1">Symbol</th>
            <th className="border px-2 py-1">Open</th>
            <th className="border px-2 py-1">High</th>
            <th className="border px-2 py-1">Low</th>
            <th className="border px-2 py-1">Close</th>
            <th className="border px-2 py-1">RSI</th>
            <th className="border px-2 py-1">EMA12</th>
            <th className="border px-2 py-1">EMA26</th>
            <th className="border px-2 py-1">EMA50</th>
            <th className="border px-2 py-1">EMA100</th>
            <th className="border px-2 py-1">EMA200</th>
            <th className="border px-2 py-1">MACD</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.symbol} className="text-center border">
              <td className="border px-2 py-1">{row.symbol}</td>
              <td className="border px-2 py-1">{row.open.toFixed(4)}</td>
              <td className="border px-2 py-1">{row.high.toFixed(4)}</td>
              <td className="border px-2 py-1">{row.low.toFixed(4)}</td>
              <td className="border px-2 py-1">{row.close.toFixed(4)}</td>
              <td className="border px-2 py-1">{row.rsi.toFixed(2)}</td>
              <td className="border px-2 py-1">{row.ema12.toFixed(2)}</td>
              <td className="border px-2 py-1">{row.ema26.toFixed(2)}</td>
              <td className="border px-2 py-1">{row.ema50.toFixed(2)}</td>
              <td className="border px-2 py-1">{row.ema100.toFixed(2)}</td>
              <td className="border px-2 py-1">{row.ema200.toFixed(2)}</td>
              <td className="border px-2 py-1">{row.macd.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CryptoTable;
