// components/NSETabs.tsx
'use client';
import React, { useState } from 'react';
import CryptoTable from './CryptoTable';

export default function NSETabs() {
  const [activeMainTab, setActiveMainTab] = useState<'crypto' | 'nse'>('crypto');
  const [activeTf, setActiveTf] = useState<'15m' | '1h' | '4h' | '1d'>('15m');

  return (
    <div className="w-full">
      <div className="flex justify-center mb-4 space-x-6">
        <button
          className={`px-4 py-2 rounded-full ${activeMainTab === 'crypto' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          onClick={() => setActiveMainTab('crypto')}
        >
          CRYPTO
        </button>
        <button
          className={`px-4 py-2 rounded-full ${activeMainTab === 'nse' ? 'bg-green-600 text-white' : 'bg-gray-200'}`}
          onClick={() => setActiveMainTab('nse')}
        >
          NSE
        </button>
      </div>

      {activeMainTab === 'crypto' ? (
        <div>
          <div className="flex justify-center gap-3 mb-4">
            {(['15m','1h','4h','1d'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setActiveTf(tf)}
                className={`px-3 py-1 rounded ${activeTf === tf ? 'bg-gray-800 text-white' : 'bg-gray-200'}`}
              >
                {tf}
              </button>
            ))}
          </div>
          <CryptoTable timeframe={activeTf} limit={80} />
        </div>
      ) : (
        <div className="text-center text-gray-600 py-20">📊 NSE Table Coming Soon...</div>
      )}
    </div>
  );
}
