 
// components/NseTable.tsx
import React, { useState, useEffect } from "react";

const timeframes = ["15m", "1h", "4h", "1d"];

const sampleNseData = [
  {
    symbol: "NIFTY",
    open: 22950,
    high: 23020,
    low: 22870,
    close: 22980,
    volume: 150000,
    change: "+0.13%",
    prevClose: 22950,
    rsi: 55,
    ema1: 22960,
    ema2: 22980,
    signal: "BUY",
  },
  {
    symbol: "BANKNIFTY",
    open: 49300,
    high: 49550,
    low: 49100,
    close: 49420,
    volume: 98000,
    change: "-0.22%",
    prevClose: 49530,
    rsi: 47,
    ema1: 49400,
    ema2: 49450,
    signal: "SELL",
  },
];

const NseTable = () => {
  const [selectedTimeframe, setSelectedTimeframe] = useState("15m");
  const [data, setData] = useState(sampleNseData);

  useEffect(() => {
    // Future: Add API logic here per timeframe
    setData(sampleNseData);
  }, [selectedTimeframe]);

  return (
    <div className="p-4">
      <div className="flex gap-2 mb-4">
        {timeframes.map((t) => (
          <button
            key={t}
            className={`px-4 py-2 rounded-lg ${
              selectedTimeframe === t ? "bg-blue-600 text-white" : "bg-gray-200"
            }`}
            onClick={() => setSelectedTimeframe(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2">Symbol</th>
              <th className="p-2">Open</th>
              <th className="p-2">High</th>
              <th className="p-2">Low</th>
              <th className="p-2">Close</th>
              <th className="p-2">% Change</th>
              <th className="p-2">Prev Close</th>
              <th className="p-2">Volume</th>
              <th className="p-2">RSI</th>
              <th className="p-2">EMA1</th>
              <th className="p-2">EMA2</th>
              <th className="p-2">Signal</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr key={idx} className="text-center">
                <td className="p-2 font-medium">{row.symbol}</td>
                <td className="p-2">{row.open}</td>
                <td className="p-2">{row.high}</td>
                <td className="p-2">{row.low}</td>
                <td className="p-2">{row.close}</td>
                <td className="p-2">{row.change}</td>
                <td className="p-2">{row.prevClose}</td>
                <td className="p-2">{row.volume}</td>
                <td className="p-2">{row.rsi}</td>
                <td className="p-2">{row.ema1}</td>
                <td className="p-2">{row.ema2}</td>
                <td className="p-2 font-semibold text-green-600">
                  {row.signal}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default NseTable;

