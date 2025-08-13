// components/CryptoTable.tsx
"use client";

import React from "react";
import { useBinanceLive } from "@/hooks/useBinanceLive";
import { calculateRSI, calculateEMA, calculateMACD } from "@/lib/ta";

interface CryptoData {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  prices: number[]; // Needed for indicators
}

interface CryptoTableProps {
  symbols: string[];
  interval: string;
}

const CryptoTable: React.FC<CryptoTableProps> = ({ symbols, interval }) => {
  const marketData = useBinanceLive(symbols, interval);

  const tableData = marketData.map((data: CryptoData) => {
    const rsi = calculateRSI(data.prices);
    const ema12 = calculateEMA(data.prices, 12);
    const ema26 = calculateEMA(data.prices, 26);
    const { macd, signal } = calculateMACD(data.prices);

    return {
      ...data,
      rsi: rsi ? rsi.toFixed(2) : "-",
      ema12: ema12 ? ema12.toFixed(2) : "-",
      ema26: ema26 ? ema26.toFixed(2) : "-",
      macd: macd ? macd.toFixed(2) : "-",
      signal: signal ? signal.toFixed(2) : "-"
    };
  });

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full table-auto border-collapse border border-gray-700">
        <thead>
          <tr className="bg-gray-800 text-white">
            <th className="border border-gray-700 px-4 py-2">Symbol</th>
            <th className="border border-gray-700 px-4 py-2">Open</th>
            <th className="border border-gray-700 px-4 py-2">High</th>
            <th className="border border-gray-700 px-4 py-2">Low</th>
            <th className="border border-gray-700 px-4 py-2">Close</th>
            <th className="border border-gray-700 px-4 py-2">RSI</th>
            <th className="border border-gray-700 px-4 py-2">EMA12</th>
            <th className="border border-gray-700 px-4 py-2">EMA26</th>
            <th className="border border-gray-700 px-4 py-2">MACD</th>
            <th className="border border-gray-700 px-4 py-2">Signal</th>
          </tr>
        </thead>
        <tbody>
          {tableData.map((row, idx) => (
            <tr
              key={idx}
              className="text-center hover:bg-gray-700 transition-colors"
            >
              <td className="border border-gray-700 px-4 py-2">{row.symbol}</td>
              <td className="border border-gray-700 px-4 py-2">{row.open}</td>
              <td className="border border-gray-700 px-4 py-2">{row.high}</td>
              <td className="border border-gray-700 px-4 py-2">{row.low}</td>
              <td className="border border-gray-700 px-4 py-2">{row.close}</td>
              <td className="border border-gray-700 px-4 py-2">{row.rsi}</td>
              <td className="border border-gray-700 px-4 py-2">{row.ema12}</td>
              <td className="border border-gray-700 px-4 py-2">{row.ema26}</td>
              <td className="border border-gray-700 px-4 py-2">{row.macd}</td>
              <td className="border border-gray-700 px-4 py-2">{row.signal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CryptoTable;
