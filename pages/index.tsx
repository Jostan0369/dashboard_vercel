'use client'

import React, { useEffect, useState } from 'react';
import useBinanceTickers from '../hooks/useBinanceTickers';

type MarketType = 'CRYPTO' | 'NSE';
type Timeframe = '15m' | '1h' | '4h' | '1d';

const tableHeaders = [
  'Symbol', 'Open', 'High', 'Low', 'Close', 'Volume',
  'RSI', 'MACD', 'EMA12', 'EMA26',  'EMA50',
  'EMA100', 'EMA200',  'EMA Cross',
  'TMV Signal', 'MI Signal', 'Trend Signal',
  'VI Signal', 'Volume Signal', 'Final Signal'
];

export default function Home() {
  const [market, setMarket] = useState<MarketType>('CRYPTO');
  const [timeframe, setTimeframe] = useState<Timeframe>('15m');
  const [symbols, setSymbols] = useState<string[]>([]);

  const tickers = useBinanceTickers();

  // Fetch all USDT Futures pairs to display rows
  useEffect(() => {
    if (market !== 'CRYPTO') return;
    fetch('https://fapi.binance.com/fapi/v1/exchangeInfo') // ✅ Futures
      .then(res => res.json())
      .then(info => {
        const allUSDT = info.symbols
          .filter((s: any) => s.symbol.endsWith('USDT') && s.status === 'TRADING')
          .map((s: any) => s.symbol.toUpperCase());
        console.log('Fetched symbols for table:', allUSDT.length);
        setSymbols(allUSDT); // ✅ Load all futures pairs
      });
  }, [market]);

  return (
    <main className="min-h-screen bg-gray-100 p-4" style={{ fontFamily: 'Tahoma, sans-serif' }}>
      {/* Market Tabs */}
      <div className="flex justify-between items-center flex-wrap gap-4 mb-6">
        <div className="flex gap-2">
          {(['CRYPTO', 'NSE'] as MarketType[]).map((m) => (
            <button
              key={m}
              className={`px-4 py-2 rounded font-bold ${
                market === m
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border'
              }`}
              onClick={() => setMarket(m)}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Timeframe Tabs */}
        <div className="flex gap-2">
          {(['15m', '1h', '4h', '1d'] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              className={`px-3 py-1 rounded ${
                timeframe === tf
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-700 border'
              }`}
              onClick={() => setTimeframe(tf)}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {market === 'CRYPTO' ? (
        <div className="bg-white shadow rounded p-4 overflow-x-auto">
          <h2 className="text-lg font-bold mb-4">
            Live Market Data ({timeframe.toUpperCase()})
          </h2>

          <div className="overflow-auto max-h-[75vh]">
            <table
              className="w-full text-xs border border-gray-300"
              style={{ fontFamily: 'Tahoma, sans-serif', borderCollapse: 'collapse' }}
            >
              <thead>
                <tr className="bg-gray-800 text-white">
                  {tableHeaders.map((h, i) => (
                    <th
                      key={h}
                      className={`px-2 py-2 border border-gray-300 sticky top-0 z-20 ${
                        i === 0 ? 'left-0 bg-gray-800 z-30' : 'bg-gray-800'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {symbols.map((symbol, idx) => {
                  const row = tickers[symbol] || {};
                  return (
                    <tr
                      key={symbol}
                      className={`hover:bg-gray-100 ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                      } text-gray-900`}
                    >
                      <td className="px-2 py-1 border border-gray-300 font-semibold sticky left-0 bg-inherit z-10">
                        {symbol}
                      </td>
                      <td className="px-2 py-1 border border-gray-300">{row.open?.toFixed(6) ?? '-'}</td>
                      <td className="px-2 py-1 border border-gray-300">{row.high?.toFixed(6) ?? '-'}</td>
                      <td className="px-2 py-1 border border-gray-300">{row.low?.toFixed(6) ?? '-'}</td>
                      <td className="px-2 py-1 border border-gray-300">{row.lastPrice?.toFixed(6) ?? '-'}</td>
                      <td className="px-2 py-1 border border-gray-300">{row.volume?.toFixed(2) ?? '-'}</td>
                      <td className="px-2 py-1 border border-gray-300">{row.rsi ?? '-'}</td>
                      <td className="px-2 py-1 border border-gray-300">{row.macd ?? '-'}</td>
                      <td className="px-2 py-1 border border-gray-300">{row.ema12 ?? '-'}</td>
                      <td className="px-2 py-1 border border-gray-300">{row.ema26 ?? '-'}</td>
                      <td className="px-2 py-1 border border-gray-300">{row.ema50 ?? '-'}</td>
                      <td className="px-2 py-1 border border-gray-300">{row.ema100 ?? '-'}</td>
                      <td className="px-2 py-1 border border-gray-300">{row.ema200 ?? '-'}</td>
                      <td className="px-2 py-1 border border-gray-300">{row.emaCross ?? '-'}</td>
                      <td className="px-2 py-1 border border-gray-300">{row.tmvSignal ?? '-'}</td>
                      <td className="px-2 py-1 border border-gray-300">{row.miSignal ?? '-'}</td>
                      <td className="px-2 py-1 border border-gray-300">{row.trendSignal ?? '-'}</td>
                      <td className="px-2 py-1 border border-gray-300">{row.viSignal ?? '-'}</td>
                      <td className="px-2 py-1 border border-gray-300">{row.volumeIn ?? '-'}</td>
                      <td className="px-2 py-1 border border-gray-300">{row.finalSignal ?? '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-center text-gray-600 text-xl font-semibold mt-20">
          NSE Data Coming Soon...
        </p>
      )}
    </main>
  );
}
