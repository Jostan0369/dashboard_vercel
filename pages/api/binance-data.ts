import type { NextApiRequest, NextApiResponse } from "next";
import { lastEMA, lastMACD, lastRSI } from "@/lib/ta";

const FAPI = "https://fapi.binance.com";

type KlineRow = [number, string, string, string, string, string, number, string, string, string, string, string, string, string];
type Kline = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const symbol = "BTCUSDT"; // Hardcoded to test
    const timeframe = (req.query.timeframe as string) || "1h"; // Use 1h for more data
    const klimit = 600; // Hardcoded to ensure enough data for EMA200

    const url = `${FAPI}/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${timeframe}&limit=${klimit}`;
    const kResp = await fetch(url);
    if (!kResp.ok) {
      return res.status(500).json({ error: "Failed to fetch klines from Binance." });
    }
    const arr = await kResp.json();

    if (!Array.isArray(arr) || arr.length === 0) {
      return res.status(404).json({ error: "No klines data found for this symbol." });
    }

    const ks: Kline[] = arr.map((k: KlineRow) => ({
      open: +k[1],
      high: +k[2],
      low: +k[3],
      close: +k[4],
      volume: +k[5],
    }));

    const closes: number[] = ks.map((kline: Kline) => kline.close);

    const last = ks[ks.length - 1];

    const rsi = lastRSI(closes, 14);
    const ema12 = lastEMA(closes, 12);
    const ema26 = lastEMA(closes, 26);
    const ema50 = lastEMA(closes, 50);
    const ema100 = lastEMA(closes, 100);
    const ema200 = lastEMA(closes, 200);
    const macdVals = lastMACD(closes, 12, 26, 9);

    const result = {
      symbol: symbol,
      open: last.open,
      high: last.high,
      low: last.low,
      close: last.close,
      volume: last.volume,
      rsi14: rsi,
      macd: macdVals.macd,
      ema12,
      ema26,
      ema50,
      ema100,
      ema200,
      macdSignal: macdVals.signal,
      macdHist: macdVals.hist,
      ts: Date.now(),
      data_points: closes.length,
    };

    res.status(200).json(result);
  } catch (err: any) {
    console.error("API /binance-data error:", err);
    res.status(500).json({ error: "Failed to fetch binance data" });
  }
}
