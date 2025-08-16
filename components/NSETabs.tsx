'use client'
import React, { useState } from 'react'
import CryptoTable from './CryptoTable'

export default function NSETabs() {
  const [activeMainTab, setActiveMainTab] = useState<'crypto' | 'nse'>('crypto')
  const [activeTf, setActiveTf] = useState<'15m'|'1h'|'4h'|'1d'>('15m')

  return (
    <div className="w-full">
      <div className="flex justify-center mb-4 space-x-6">
        <button
          className={`px-4 py-2 rounded-full ${activeMainTab==='crypto'?'bg-blue-600 text-white':'bg-gray-200'}`}
          onClick={()=>setActiveMainTab('crypto')}
        >
          CRYPTO
        </button>
        <button
          className={`px-4 py-2 rounded-full ${activeMainTab==='nse'?'bg-green-600 text-white':'bg-gray-200'}`}
          onClick={()=>setActiveMainTab('nse')}
        >
          NSE
        </button>
      </div>

      {activeMainTab==='crypto' ? (
        <div>
          <div className="flex justify-center gap-3 mb-4">
            <button onClick={()=>setActiveTf('15m')} className={`px-3 py-1 rounded ${activeTf==='15m'?'bg-gray-800 text-white':'bg-gray-200'}`}>15m</button>
            <button onClick={()=>setActiveTf('1h' )} className={`px-3 py-1 rounded ${activeTf==='1h' ?'bg-gray-800 text-white':'bg-gray-200'}`}>1h</button>
            <button onClick={()=>setActiveTf('4h' )} className={`px-3 py-1 rounded ${activeTf==='4h' ?'bg-gray-800 text-white':'bg-gray-200'}`}>4h</button>
            <button onClick={()=>setActiveTf('1d' )} className={`px-3 py-1 rounded ${activeTf==='1d' ?'bg-gray-800 text-white':'bg-gray-200'}`}>1d</button>
          </div>

          {/* Props now match CryptoTable definition */}
          <CryptoTable timeframe={activeTf} limit={100} pollInterval={30000} />
        </div>
      ) : (
        <div className="text-center text-gray-600 py-20">📊 NSE Table Coming Soon...</div>
      )}
    </div>
  )
}
