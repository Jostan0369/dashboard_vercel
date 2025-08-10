# Crypto Dashboard

A real-time Binance USDT Futures dashboard with live signals, indicators, and sortable table UI.

## Features

- Fetches live data from Binance Futures
- Custom RSI, EMA, Buy/Sell signal logic
- Timeframe & market selectors (Crypto/NSE)
- Built with Next.js App Router + Tailwind CSS

## Development

```bash
npm install
npm run dev
npm install axios ws



## Added server-side indicators (EMA, MACD, RSI)
I added `lib/indicators.ts` which computes EMA, MACD and RSI.
The API endpoint `pages/api/crypto.ts` now discovers Binance USDT symbols automatically
and computes EMA12, EMA26, EMA50, EMA100, EMA200, MACD (12,26,9) and RSI(14) for each symbol.
It also triggers Pusher events (`crypto-channel` / `price-update`) with the payload containing:
```
{ symbol, open, high, low, close, volume, ema12, ema26, ema50, ema100, ema200, macd, macdSignal, macdHist, rsi14, ts }
```
To run:
1. `npm install`
2. `cp .env.local.example .env.local` and fill Pusher keys if you want realtime push
3. `npm run dev`
Note: Fetching indicators for many symbols can be slow on first call. The `limit` query param on `/api/crypto?timeframe=1h&limit=200` controls how many symbols to compute.
