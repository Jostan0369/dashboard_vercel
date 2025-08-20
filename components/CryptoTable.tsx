"use client";
import React, { useEffect, useState } from "react";
import { calculateEMA, calculateRSI, calculateMACD } from "../lib/indicator"; // ✅ FIXED PATH

type Kline = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type IndicatorData = {
  rsi: number[];
  ema12: number[];
  ema26: number[];
  ema200: number[];
  macd: { MACD: number; signal: number; histogram: number }[];
};

const CryptoTable = ({ symbol, interval }: { symbol: string; interval: string }) => {
  const [data, setData] = useState<Kline[]>([]);
  const [indicators, setIndicators] = useState<IndicatorData | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const res = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=500`
      );
      const raw = await res.json();
      const formatted: Kline[] = raw.map((k: any) => ({
        time: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
      }));
      setData(formatted);

      // ✅ calculate indicators
      const closes = formatted.map((c) => c.close);
      const rsi = calculateRSI(closes, 14);
      const ema12 = calculateEMA(closes, 12);
      const ema26 = calculateEMA(closes, 26);
      const ema200 = calculateEMA(closes, 200);
      const macd = calculateMACD(closes, 12, 26, 9);

      setIndicators({ rsi, ema12, ema26, ema200, macd });
    };

    fetchData();
  }, [symbol, interval]);

  if (!data.length || !indicators) return <p>Loading...</p>;

  const latest = data[data.length - 1];
  const latestRSI = indicators.rsi[indicators.rsi.length - 1];
  const latestEMA12 = indicators.ema12[indicators.ema12.length - 1];
  const latestEMA26 = indicators.ema26[indicators.ema26.length - 1];
  const latestEMA200 = indicators.ema200[indicators.ema200.length - 1];
  const latestMACD = indicators.macd[indicators.macd.length - 1];

  return (
    <div className="p-4 border rounded-lg bg-white shadow">
      <h2 className="text-lg font-bold mb-2">{symbol} ({interval})</h2>
      <table className="table-auto w-full text-sm border-collapse border border-gray-300">
        <thead className="bg-gray-200">
          <tr>
            <th className="border px-2">Symbol</th>
            <th className="border px-2">Last Price</th>
            <th className="border px-2">RSI</th>
            <th className="border px-2">EMA12</th>
            <th className="border px-2">EMA26</th>
            <th className="border px-2">EMA200</th>
            <th className="border px-2">MACD</th>
          </tr>
        </thead>
        <tbody>
          <tr className="text-center">
            <td className="border px-2">{symbol}</td>
            <td className="border px-2">{latest.close.toFixed(4)}</td>
            <td className="border px-2">{latestRSI?.toFixed(2)}</td>
            <td className="border px-2">{latestEMA12?.toFixed(2)}</td>
            <td className="border px-2">{latestEMA26?.toFixed(2)}</td>
            <td className="border px-2">{latestEMA200?.toFixed(2)}</td>
            <td className="border px-2">{latestMACD?.MACD.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default CryptoTable;
