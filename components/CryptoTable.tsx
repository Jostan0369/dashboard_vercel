"use client";
import React, { useEffect, useState } from "react";
import { calculateEMA, calculateRSI, calculateMACD } from "@/lib/indicator";

type Kline = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

const CryptoTable = () => {
  const [data, setData] = useState<Kline[]>([]);
  const [indicators, setIndicators] = useState<any>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(
          "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=100"
        );
        const raw = await res.json();

        const formatted: Kline[] = raw.map((d: any) => ({
          time: d[0],
          open: parseFloat(d[1]),
          high: parseFloat(d[2]),
          low: parseFloat(d[3]),
          close: parseFloat(d[4]),
        }));

        setData(formatted);

        const closes = formatted.map((d) => d.close);

        const ema12 = calculateEMA(closes, 12).at(-1);
        const ema26 = calculateEMA(closes, 26).at(-1);
        const rsi = calculateRSI(closes, 14).at(-1);
        const macd = calculateMACD(closes);

        setIndicators({
          ema12,
          ema26,
          rsi,
          macd: macd.macdLine.at(-1),
          signal: macd.signalLine.at(-1),
        });
      } catch (err) {
        console.error(err);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold">BTC/USDT (15m)</h2>
      <table className="table-auto w-full border">
        <thead>
          <tr className="bg-gray-100">
            <th className="px-2">EMA12</th>
            <th className="px-2">EMA26</th>
            <th className="px-2">RSI</th>
            <th className="px-2">MACD</th>
            <th className="px-2">Signal</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{indicators?.ema12?.toFixed(2)}</td>
            <td>{indicators?.ema26?.toFixed(2)}</td>
            <td>{indicators?.rsi?.toFixed(2)}</td>
            <td>{indicators?.macd?.toFixed(4)}</td>
            <td>{indicators?.signal?.toFixed(4)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default CryptoTable;
