'use client';

import React, { useMemo } from 'react';
import { useBinanceLive, TF, Row } from '@/hooks/useBinanceLive';

export type Timeframe = '15m' | '1h' | '4h' | '1d';

type Props = {
  timeframe: Timeframe;
  /** Max number of symbols to render (also used to limit how many pairs we subscribe to) */
  limit?: number;
  /** Kept for compatibility with your usage; ignored in WebSocket mode */
  pollInterval?: number;
  title?: string;
};

function fmt(x: number | null | undefined, d = 2): string {
  if (x === null || x === undefined || Number.isNaN(x)) return '-';
  return Number.isFinite(x) ? x.toFixed(d) : '-';
}

const CryptoTable: React.FC<Props> = ({ timeframe, limit = 120, pollInterval, title }) => {
  // Live Futures USDT data + indicators (seeded with klines so RSI/EMA200 are available immediately)
  const { rows } = useBinanceLive(timeframe as TF, {
    maxSymbols: limit,  // how many pairs to subscribe to and render
    klimit: 600,        // enough history for EMA200/RSI14/MACD
  });

  const list: Row[] = useMemo(() => rows.slice(0, limit), [rows, limit]);

  return (
    <div className="p-4 overflow-x-auto">
      <h2 className="text-lg font-semibold mb-3">
        {title ?? 'Crypto Futures USDT'} — {timeframe}
      </h2>

      <table className="w-full table-auto border-collapse rounded-lg shadow-md">
        <thead>
          <tr className="bg-gray-800 text-white text-xs">
            <th className="p-2 text-left">Symbol</th>
            <th className="p-2">Open</th>
            <th className="p-2">High</th>
            <th className="p-2">Low</th>
            <th className="p-2">Close</th>
            <th className="p-2">Volume</th>
            {/* exact order you requested */}
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
            <tr key={r.symbol} className="text-xs text-center border-b hover:bg-gray-50">
              <td className="p-2 font-semibold text-left">{r.symbol}</td>
              <td className="p-2">{fmt(r.open, 4)}</td>
              <td className="p-2">{fmt(r.high, 4)}</td>
              <td className="p-2">{fmt(r.low, 4)}</td>
              <td className="p-2">{fmt(r.close, 4)}</td>
              <td className="p-2">{fmt(r.volume, 2)}</td>
              {/* indicators */}
              <td className="p-2">{fmt(r.rsi14, 2)}</td>
              <td className="p-2">{fmt(r.macd, 4)}</td>
              <td className="p-2">{fmt(r.ema12, 4)}</td>
              <td className="p-2">{fmt(r.ema26, 4)}</td>
              <td className="p-2">{fmt(r.ema50, 4)}</td>
              <td className="p-2">{fmt(r.ema100, 4)}</td>
              <td className="p-2">{fmt(r.ema200, 4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CryptoTable;
