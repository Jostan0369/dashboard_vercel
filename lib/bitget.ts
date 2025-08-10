// lib/bitget.ts
import axios from 'axios';
import { CryptoData } from '@/types';

export async function getFromBitget(symbol: string, _timeframe?: string): Promise<CryptoData> {
  const formatted = symbol.replace('USDT', '_USDT');
  const url = `https://api.bitget.com/api/spot/v1/market/ticker?symbol=${formatted}`;
  const { data } = await axios.get(url);

  const price = parseFloat(data.data.close);
  const volume = parseFloat(data.data.baseVol);

  return {
    symbol,
    price,
    volume,
    lastClose: price,
    source: 'Bitget'
  };
}
