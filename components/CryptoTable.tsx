// components/CryptoTable.tsx
'use client';

import React from 'react';
import { useBinanceLive } from '@/hooks/useBinanceLive';

type Timeframe = '15m'|'1h'|'4h'|'1d';

const CryptoTable: React.FC<{ timeframe: Timeframe; title?: string }> = ({ timeframe, title }) => {
  const { rows } = useBinanceLive(timeframe);

  return (
    <div className="p-4 overflow-x-auto">
      <h2 className="text-xl font-semibold mb-3">
        {title ?? 'CRYPTO'} • Timeframe: {timeframe}
      </h2>
      <table className="w-full table-auto border-collapse rounded-lg shadow-md">
        <thead>
          <tr className="bg-gray-800 text-white text-xs">
            <th className="p-2">Symbol</th>
            <th className="p-2">Open</th>
            <th className="p-2">High</th>
            <th className="p-2">Low</th>
            <th className="p-2">Close</th>
            <th className="p-2">RSI</th>
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
            <tr key={`${timeframe}-${row.symbol}`} className="text-xs text-center border-b hover:bg-gray-50">
              <td className="p-2 font-semibold">{row.symbol}</td>
              <td className="p-2">{row.open?.toFixed(4)}</td>
              <td className="p-2">{row.high?.toFixed(4)}</td>
              <td className="p-2">{row.low?.toFixed(4)}</td>
              <td className="p-2">{row.close?.toFixed(4)}</td>
              <td className="p-2">{row.rsi14 != null ? row.rsi14.toFixed(2) : '-'}</td>
              <td className="p-2">{row.ema12 != null ? row.ema12.toFixed(4) : '-'}</td>
              <td className="p-2">{row.ema26 != null ? row.ema26.toFixed(4) : '-'}</td>
              <td className="p-2">{row.macd != null ? row.macd.toFixed(4) : '-'}</td>
              <td className="p-2">{row.macdSignal != null ? row.macdSignal.toFixed(4) : '-'}</td>
              <td className="p-2">{row.macdHist != null ? row.macdHist.toFixed(4) : '-'}</td>
              <td className="p-2">{row.ema50 != null ? row.ema50.toFixed(4) : '-'}</td>
              <td className="p-2">{row.ema100 != null ? row.ema100.toFixed(4) : '-'}</td>
              <td className="p-2">{row.ema200 != null ? row.ema200.toFixed(4) : '-'}</td>
              <td className="p-2">{(row.volume / 1e6).toFixed(2)}M</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="text-center text-sm text-gray-500 mt-4">Loading {timeframe}… seeding candles & connecting WS</div>
      )}
    </div>
  );
};

export default CryptoTable;
