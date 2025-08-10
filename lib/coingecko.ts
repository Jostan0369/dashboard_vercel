// /lib/coingecko.ts
import axios from 'axios';
import { CryptoData } from '@/types';

const coinIds: Record<string, string> = {
  BTCUSDT: 'bitcoin',
  ETHUSDT: 'ethereum',
  BNBUSDT: 'binancecoin',
  SOLUSDT: 'solana',
  XRPUSDT: 'ripple'
};

export async function getFromCoinGecko(symbol: string): Promise<CryptoData> {
  const id = coinIds[symbol];
  if (!id) throw new Error(`CoinGecko ID not mapped for ${symbol}`);

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_vol=true`;
  const { data } = await axios.get(url);

  const price = data[id].usd;
  const volume = data[id].usd_24h_vol;

  return {
    symbol,
    price,
    volume,
    lastClose: price,
    source: 'CoinGecko'
  };
}
