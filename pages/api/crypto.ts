// pages/api/crypto.ts - serverless-friendly indicator endpoint
import type { NextApiRequest, NextApiResponse } from 'next';
import { getFuturesSymbols, getKlines } from '@/lib/binance';
import { ema, macd, rsi } from '@/lib/indicators';

type Payload = {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema12?: number | null;
  ema26?: number | null;
  ema50?: number | null;
  ema100?: number | null;
  ema200?: number | null;
  macd?: number | null;
  macdSignal?: number | null;
  macdHist?: number | null;
  rsi14?: number | null;
  ts: number;
};

const VALID = ['15m', '1h', '4h', '1d'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const timeframe = String(req.query.timeframe || '1h');
    if (!VALID.includes(timeframe)) {
      return res.status(400).json({ error: 'Invalid timeframe' });
    }

    const limitSymbols = Number(req.query.limit) || 100; // default safe
    const candlesNeeded = Math.max(250, Number(req.query.candles) || 500); // ensure >=250

    const symbols = await getFuturesSymbols();
    const selected = symbols.slice(0, Math.min(limitSymbols, symbols.length));

    const out: Payload[] = [];

    // Loop sequentially to avoid hitting rate limits quickly — small optimization for serverless
    for (const symbol of selected) {
      try {
        const klines = await getKlines(symbol, timeframe, candlesNeeded);
        if (!klines || klines.length < 50) {
          // skip if not enough data
          continue;
        }
        const closes = klines.map(k => k.close);
        const last = klines[klines.length - 1];

        const ema12Series = ema(closes, 12);
        const ema26Series = ema(closes, 26);
        const ema50Series = ema(closes, 50);
        const ema100Series = ema(closes, 100);
        const ema200Series = ema(closes, 200);

        const macdRes = macd(closes, 12, 26, 9);
        const rsiSeries = rsi(closes, 14);

        const payload: Payload = {
          symbol,
          open: last.open,
          high: last.high,
          low: last.low,
          close: last.close,
          volume: last.volume,
          ema12: ema12Series[ema12Series.length - 1] ?? null,
          ema26: ema26Series[ema26Series.length - 1] ?? null,
          ema50: ema50Series[ema50Series.length - 1] ?? null,
          ema100: ema100Series[ema100Series.length - 1] ?? null,
          ema200: ema200Series[ema200Series.length - 1] ?? null,
          macd: macdRes.macdLine[macdRes.macdLine.length - 1] ?? null,
          macdSignal: macdRes.signalLine[macdRes.signalLine.length - 1] ?? null,
          macdHist: macdRes.histogram[macdRes.histogram.length - 1] ?? null,
          rsi14: rsiSeries[rsiSeries.length - 1] ?? null,
          ts: Date.now(),
        };

        out.push(payload);
      } catch (err: any) {
        console.warn('crypto API processing error', symbol, err?.message ?? err);
      }
    }

    return res.status(200).json(out);
  } catch (err: any) {
    console.error('crypto API error', err?.message ?? err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
