// components/CryptoTable.tsx
"use client";

import React from "react";
import { useBinanceLive } from "@/hooks/useBinanceLive";
// If you exported Row type from the hook, you can import it for stronger typing:
// import type { Row } from "@/hooks/useBinanceLive";

type Timeframe = "15m" | "1h" | "4h" | "1d";

type Props = {
  timeframe: Timeframe;
  title?: string;
  /** optional knobs kept for compatibility (not required by the live hook) */
  limit?: number;
  pollInterval?: number;
};

const fmt = (v: number | null | undefined, d = 4) =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "-";

const CryptoTable: React.FC<Props> = ({ timeframe, title, limit, pollInterval }) => {
  // live rows (open/high/low/close/volume + rsi14, ema12/26/50/100/200, macd/signal/hist)
  const { rows } = useBinanceLive(timeframe);

  return (
    <div className="p-4 overflow-x-auto">
      <h2 className="text-xl font-semibold mb-3">
        {title ?? "CRYPTO"} • Timeframe: {timeframe}
      </h2>

      <table className="w-full table-auto border-collapse rounded-lg shadow-md">
        <thead>
          <tr className="bg-gray-800 text-white text-xs">
            <th className="p-2 text-left">Symbol</th>
            <th className="p-2">Open</th>
            <th className="p-2">High</th>
            <th className="p-2">Low</th>
            <th className="p-2">Close</th>
            <th className="p-2">RSI(14)</th>
            <th className="p-2">EMA12</th>
            <th className="p-2">EMA26</th>
            <th className="p-2">MACD</th>
            <th className="p-2">Signal</th>
            <th className="p-2">Hist</th>
            <th className="p-2">EMA50</th>
            <th className="p-2">EMA100</th>
            <th className="p-2">EMA200</th>
            <th className="p-2">Volume</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr
              key={`${timeframe}-${row.symbol}`}
              className="text-xs text-center border-b hover:bg-gray-50"
            >
              <td className="p-2 text-left font-semibold">{row.symbol}</td>
              <td className="p-2">{fmt(row.open)}</td>
              <td className="p-2">{fmt(row.high)}</td>
              <td className="p-2">{fmt(row.low)}</td>
              <td className="p-2">{fmt(row.close)}</td>

              <td className="p-2">{fmt(row.rsi14, 2)}</td>

              <td className="p-2">{fmt(row.ema12)}</td>
              <td className="p-2">{fmt(row.ema26)}</td>

              <td className="p-2">{fmt(row.macd)}</td>
              <td className="p-2">{fmt(row.macdSignal)}</td>
              <td className="p-2">{fmt(row.macdHist)}</td>

              <td className="p-2">{fmt(row.ema50)}</td>
              <td className="p-2">{fmt(row.ema100)}</td>
              <td className="p-2">{fmt(row.ema200)}</td>

              <td className="p-2">
                {typeof row.volume === "number" && Number.isFinite(row.volume)
                  ? (row.volume / 1e6).toFixed(2) + "M"
                  : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 && (
        <div className="text-center text-sm text-gray-500 mt-4">
          Loading {timeframe}… seeding candles & connecting WS
        </div>
      )}
    </div>
  );
};

export default CryptoTable;
