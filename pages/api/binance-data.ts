// pages/api/binance-data.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { lastEMA, lastMACD, lastRSI } from '@/lib/ta';

const FAPI = 'https://fapi.binance.com';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const timeframe = (req.query.timeframe as string) || '15m';
    const maxSymbols = parseInt((req.query.maxSymbols as string) || '60', 10);
    const klimit = parseInt((req.query.klimit as string) || '600', 10);

    const exResp = await fetch(`${FAPI}/fapi/v1/exchangeInfo`);
    const ex = await exResp.json();
    const all = (ex.symbols ?? [])
      .filter((s: any) => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING')
      .map((s: any) => s.symbol.toLowerCase());

    // rank by 24h volume
    const t24Resp = await fetch(`${FAPI}/fapi/v1/ticker/24hr`);
    const t24 = await t24Resp.json();
    const vol = new Map<string, number>();
    (t24 ?? []).forEach((t: any) => {
      if (t && typeof t.symbol === 'string' && t.symbol.endsWith('USDT')) {
        vol.set(t.symbol.toLowerCase(), parseFloat(t.volume) || 0);
      }
    });
    const top = [...all].sort((a, b) => (vol.get(b) || 0) - (vol.get(a) || 0)).slice(0, maxSymbols);

    const rows = await Promise.all(
      top.map(async (s) => {
        try {
          const kl = await fetch(`${FAPI}/fapi/v1/klines?symbol=${s.toUpperCase()}&interval=${timeframe}&limit=${klimit}`);
          const arr = await kl.json();
          const ks = (arr ?? []).map((k: any[]) => ({
            open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
          }));
          if (!ks.length) return null;
          const closes = ks.map((k) => k.close);
          const last = ks[ks.length - 1];
          const rsi = lastRSI(closes, 14);
          const ema12 = lastEMA(closes, 12);
          const ema26 = lastEMA(closes, 26);
          const ema50 = lastEMA(closes, 50);
          const ema100 = lastEMA(closes, 100);
          const ema200 = lastEMA(closes, 200);
          const m = lastMACD(closes, 12, 26, 9);
          return {
            symbol: s.toUpperCase(),
            open: last.open, high: last.high, low: last.low, close: last.close, volume: last.volume,
            rsi14: rsi, macd: m.macd, ema12, ema26, ema50, ema100, ema200, ts: Date.now(),
          };
        } catch {
          return null;
        }
      })
    );

    res.status(200).json(rows.filter(Boolean));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed' });
  }
}
