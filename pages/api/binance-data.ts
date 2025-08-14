import type { NextApiRequest, NextApiResponse } from "next";
import axios from "axios";
import { RSI, EMA, MACD } from "technicalindicators";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Get all USDT pairs
    const exchangeInfo = await axios.get("https://api.binance.com/api/v3/exchangeInfo");
    const symbols = exchangeInfo.data.symbols
      .filter((s: any) => s.symbol.endsWith("USDT") && s.status === "TRADING")
      .map((s: any) => s.symbol);

    const results: any[] = [];

    // Fetch OHLC for each
    for (const sym of symbols) {
      const klines = await axios.get(
        `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=15m&limit=100`
      );
      const ohlc = klines.data.map((k: any) => ({
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));

      const closes = ohlc.map(o => o.close);

      const rsi = RSI.calculate({ values: closes, period: 14 }).slice(-1)[0] || 0;
      const ema12 = EMA.calculate({ values: closes, period: 12 }).slice(-1)[0] || 0;
      const ema26 = EMA.calculate({ values: closes, period: 26 }).slice(-1)[0] || 0;
      const ema50 = EMA.calculate({ values: closes, period: 50 }).slice(-1)[0] || 0;
      const ema100 = EMA.calculate({ values: closes, period: 100 }).slice(-1)[0] || 0;
      const ema200 = EMA.calculate({ values: closes, period: 200 }).slice(-1)[0] || 0;

      const macdData = MACD.calculate({
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
      }).slice(-1)[0] || { MACD: 0 };

      const last = ohlc[ohlc.length - 1];
      results.push({
        symbol: sym,
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
        volume: last.volume,
        rsi,
        macd: macdData.MACD,
        ema12,
        ema26,
        ema50,
        ema100,
        ema200,
      });
    }

    res.status(200).json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error fetching Binance data" });
  }
}
