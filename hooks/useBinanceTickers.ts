'use client'

import { useEffect, useState } from 'react'

interface TickerData {
  symbol: string
  lastPrice: number
  open: number
  high: number
  low: number
  volume: number
  // placeholders for indicators
  rsi?: number
  ema12?: number
  ema26?: number
  macd?: number
  ema50?: number
  ema100?: number
  ema200?: number
  emaCross?: string
  tmvSignal?: string
  miSignal?: string
  trendSignal?: string
  viSignal?: string
  volumeIn?: number
  finalSignal?: string
}

export default function useBinanceTickers() {
  const [tickers, setTickers] = useState<{ [symbol: string]: TickerData }>({})

  useEffect(() => {
    let ws: WebSocket

    async function fetchInitialData() {
      // 1️⃣ Fetch all Futures USDT symbols
      const resInfo = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo')
      const info = await resInfo.json()
      const symbols: string[] = info.symbols
        .filter((s: any) => s.symbol.endsWith('USDT') && s.status === 'TRADING')
        .map((s: any) => s.symbol.toUpperCase())

      console.log(`Connecting WebSocket for ${symbols.length} Futures USDT pairs...`)

      // 2️⃣ Initial price load (avoid "-" in table)
      const resTickers = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr')
      const allTickers = await resTickers.json()

      const initialTickers: { [symbol: string]: TickerData } = {}
      allTickers.forEach((t: any) => {
        const symbol = t.symbol?.toUpperCase()
        if (!symbol || !symbol.endsWith('USDT')) return
        initialTickers[symbol] = {
          symbol,
          lastPrice: parseFloat(t.lastPrice),
          open: parseFloat(t.openPrice),
          high: parseFloat(t.highPrice),
          low: parseFloat(t.lowPrice),
          volume: parseFloat(t.volume),
        }
      })

      setTickers(initialTickers)

      // 3️⃣ Live WebSocket Updates
      ws = new WebSocket('wss://fstream.binance.com/ws/!ticker@arr')

      ws.onmessage = (event) => {
        const updates = JSON.parse(event.data)
        const updatedTickers: { [symbol: string]: TickerData } = {}

        for (const t of updates) {
          const symbol = t.s?.toUpperCase()
          if (!symbol?.endsWith('USDT')) continue

          updatedTickers[symbol] = {
            symbol,
            lastPrice: parseFloat(t.c),
            open: parseFloat(t.o),
            high: parseFloat(t.h),
            low: parseFloat(t.l),
            volume: parseFloat(t.v),
          }
        }

        // Merge with previous state
        setTickers((prev) => ({ ...prev, ...updatedTickers }))
      }

      ws.onclose = () => console.warn('WebSocket closed')
      ws.onerror = (err) => console.error('WebSocket error:', err)
    }

    fetchInitialData()

    return () => {
      if (ws) ws.close()
    }
  }, [])

  return tickers
}
