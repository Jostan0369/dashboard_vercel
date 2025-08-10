
'use client'

import React, { useState } from 'react'

const HeaderTabs = ({
  onTabChange,
  onTimeframeChange,
}: {
  onTabChange: (tab: string) => void
  onTimeframeChange: (timeframe: string) => void
}) => {
  const [activeTab, setActiveTab] = useState('crypto')
  const [timeframe, setTimeframe] = useState('1h')

  const handleTab = (tab: string) => {
    setActiveTab(tab)
    onTabChange(tab)
  }

  const handleTimeframe = (tf: string) => {
    setTimeframe(tf)
    onTimeframeChange(tf)
  }

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between px-4 py-3 bg-gray-100 rounded shadow mb-4">
      {/* Tabs */}
      <div className="flex space-x-2 mb-2 md:mb-0">
        {['crypto', 'nse'].map((tab) => (
          <button
            key={tab}
            onClick={() => handleTab(tab)}
            className={`px-4 py-2 rounded font-semibold ${
              activeTab === tab ? 'bg-blue-600 text-white' : 'bg-white border text-gray-700'
            }`}
          >
            {tab.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Timeframes */}
      <div className="flex space-x-2">
        {['15m', '1h', '4h', '1d'].map((tf) => (
          <button
            key={tf}
            onClick={() => handleTimeframe(tf)}
            className={`px-3 py-1 rounded border ${
              timeframe === tf ? 'bg-green-600 text-white' : 'bg-white text-gray-700'
            }`}
          >
            {tf}
          </button>
        ))}
      </div>
    </div>
  )
}

export default HeaderTabs

