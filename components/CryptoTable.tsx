// components/CryptoTable.tsx
'use client';

import React, { useMemo } from 'react';
import { useBinanceLive, TF, Row } from '@/hooks/useBinanceLive';

export type Timeframe = '15m' | '1h' | '4h' | '1d';

type Props = {
  timeframe: Timeframe;
  limit?: number;
  pollInterval?: number;
  title?: string;
};

function fmt(x: number | null | undefined, d = 2): string {
  if (x === null || x === undefined || Number.isNaN(x)) return '-';
  return Number.isFinite(x) ? x.toFixed(d) : '-';
}

const CryptoTable: React.FC<Props> = ({ timeframe, limit = 60, title }) => {
  const { rows, seeded, progress, errors } = useBinanceLive(timeframe as TF, { maxSymbols: limit, klimit: 600 });

  const list: Row[] = useMemo(() => rows.slice(0, limit), [rows, limit]);

  return (
    <div className="p-4 overflow-x-auto">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">{title ?? 'Crypto Futures USDT'} — {timeframe}</h2>
        <div className="text-sm text-gray-500">
          {seeded ? 'Seeded' : `Seeding ${progress.done}/${progress.total}`}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="mb-2 text-xs text-red-600">
          Errors: {errors.length}. Check console for details.
        </div>
      )}

      {!seeded ? (
        <div className="text-center py-8 text-gray-500">⏳ Loading historical candles and computing indicators... ({progress.done}/{progress.total})</div>
      ) : (
        <table className="w-full table-auto border-collapse rounded-lg shadow-md text-xs">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className="p-2 text-left">Symbol</th>
              <th className="p-2">Open</th>
              <th className="p-2">High</th>
              <th className="p-2">Low</th>
              <th className="p-2">Close</th>
              <th className="p-2">Volume</th>
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
              <tr key={r.symbol} className="border-b hover:bg-gray-50">
                <td className="p-2 font-semibold">{r.symbol}</td>
                <td className="p-2 text-right">{fmt(r.open, 4)}</td>
                <td className="p-2 text-right">{fmt(r.high, 4)}</td>
                <td className="p-2 text-right">{fmt(r.low, 4)}</td>
                <td className="p-2 text-right">{fmt(r.close, 4)}</td>
                <td className="p-2 text-right">{fmt(r.volume, 2)}</td>
                <td className="p-2 text-right">{fmt(r.rsi14, 2)}</td>
                <td className="p-2 text-right">{fmt(r.macd, 4)}</td>
                <td className="p-2 text-right">{fmt(r.ema12, 4)}</td>
                <td className="p-2 text-right">{fmt(r.ema26, 4)}</td>
                <td className="p-2 text-right">{fmt(r.ema50, 4)}</td>
                <td className="p-2 text-right">{fmt(r.ema100, 4)}</td>
                <td className="p-2 text-right">{fmt(r.ema200, 4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default CryptoTable;
