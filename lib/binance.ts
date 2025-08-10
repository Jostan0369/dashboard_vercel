// lib/binance.ts - minimal, futures-only helpers
import axios from 'axios';

export type Kline = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
};

export async function getFuturesSymbols(): Promise<string[]> {
  const url = 'https://fapi.binance.com/fapi/v1/exchangeInfo';
  try {
    const { data } = await axios.get(url, { timeout: 15000 });
    if (!data || !data.symbols) return [];
    const syms = data.symbols
      .filter((s: any) => s.quoteAsset === 'USDT' && s.contractType === 'PERPETUAL' && s.status === 'TRADING')
      .map((s: any) => s.symbol)
      .sort();
    return syms;
  } catch (err: any) {
    console.warn('getFuturesSymbols error', err?.message ?? err);
    return [];
  }
}

export async function getKlines(symbol: string, interval = '1h', limit = 500): Promise<Kline[]> {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`;
  try {
    const { data } = await axios.get(url, { timeout: 20000 });
    const mapped: Kline[] = data.map((k: any[]) => ({
      openTime: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      closeTime: k[6],
    }));
    return mapped;
  } catch (err: any) {
    console.warn('getKlines error', symbol, interval, err?.message ?? err);
    return [];
  }
}
