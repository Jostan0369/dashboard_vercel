// pages/api/stream.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { BinanceWsManager } from '@/lib/binanceWs';
import { getFuturesSymbols } from '@/lib/binance';

const managers = new Map<string, BinanceWsManager>(); // timeframe -> manager

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const timeframe = String(req.query.timeframe || '1h');
  const valid = ['1m', '15m', '1h', '4h', '1d'];
  if (!valid.includes(timeframe)) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'Invalid timeframe' })}\n\n`);
    res.end();
    return;
  }

  // create manager if not exists
  if (!managers.has(timeframe)) {
    const symbols = await getFuturesSymbols();
    const manager = new BinanceWsManager(symbols, timeframe);
    managers.set(timeframe, manager);
    manager.init().catch(err => console.error('manager init failed', err?.message ?? err));
  }

  const manager = managers.get(timeframe)!;

  const onCandle = (payload: any) => {
    try {
      const data = JSON.stringify(payload);
      res.write(`event: candle\ndata: ${data}\n\n`);
    } catch (e) {}
  };

  manager.on('candle', onCandle);

  // comment ping so proxies keep connection alive
  const keepAlive = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (e) {}
  }, 30_000);

  req.on('close', () => {
    clearInterval(keepAlive);
    manager.off('candle', onCandle);
  });
}
