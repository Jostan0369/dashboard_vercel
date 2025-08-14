"use client";

import React, { useEffect, useState } from "react";

interface CryptoData {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  rsi: number;
  macd: number;
  ema12: number;
  ema26: number;
  ema50: number;
  ema100: number;
  ema200: number;
}

const CryptoTable: React.FC = () => {
  const [data, setData] = useState<CryptoData[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all USDT pairs with OHLCV + Indicators
  const fetchData = async () => {
    try {
      const res = await fetch("/api/binance-data");
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Error fetching Binance data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // refresh every 60s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="overflow-x-auto w-full">
      {loading ? (
        <p className="text-center py-4">Loading data...</p>
      ) : (
        <table className="min-w-full table-auto border border-gray-600">
          <thead className="bg-gray-900 text-white">
            <tr>
              <th className="px-4 py-2">Symbol</th>
              <th className="px-4 py-2">Open</th>
              <th className="px-4 py-2">High</th>
              <th className="px-4 py-2">Low</th>
              <th className="px-4 py-2">Close</th>
              <th className="px-4 py-2">Volume</th>
              <th className="px-4 py-2">RSI</th>
              <th className="px-4 py-2">MACD</th>
              <th className="px-4 py-2">EMA12</th>
              <th className="px-4 py-2">EMA26</th>
              <th className="px-4 py-2">EMA50</th>
              <th className="px-4 py-2">EMA100</th>
              <th className="px-4 py-2">EMA200</th>
            </tr>
          </thead>
          <tbody>
            {data.map((coin, i) => (
              <tr
                key={i}
                className="text-center border-t border-gray-600 hover:bg-gray-800"
              >
                <td className="px-4 py-2">{coin.symbol}</td>
                <td className="px-4 py-2">{coin.open.toFixed(4)}</td>
                <td className="px-4 py-2">{coin.high.toFixed(4)}</td>
                <td className="px-4 py-2">{coin.low.toFixed(4)}</td>
                <td className="px-4 py-2">{coin.close.toFixed(4)}</td>
                <td className="px-4 py-2">{coin.volume.toFixed(2)}</td>
                <td className="px-4 py-2">{coin.rsi.toFixed(2)}</td>
                <td className="px-4 py-2">{coin.macd.toFixed(2)}</td>
                <td className="px-4 py-2">{coin.ema12.toFixed(4)}</td>
                <td className="px-4 py-2">{coin.ema26.toFixed(4)}</td>
                <td className="px-4 py-2">{coin.ema50.toFixed(4)}</td>
                <td className="px-4 py-2">{coin.ema100.toFixed(4)}</td>
                <td className="px-4 py-2">{coin.ema200.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default CryptoTable;
