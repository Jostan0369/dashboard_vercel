// pages/api/binance-data.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { lastEMA, lastMACD, lastRSI } from "@/lib/ta";

const FAPI = "https://data-api.binance.vision"; // Changed to alternative URL

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
    const symbol = "BTCUSDT"; 
    const timeframe = "15m";
    const klimit = 600; 

    // Step 1: Fetch Klines from the alternative URL
    const url = `${FAPI}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${timeframe}&limit=${klimit}`;
    const kResp = await fetch(url);

    if (!kResp.ok) {
      console.error(`Failed to fetch klines from Binance. Status: ${kResp.status}`);
      return res.status(500).json({ error: `Failed to fetch klines from Binance. Status: ${kResp.status}` });
    }

    const arr = await kResp.json();
    console.log(`Fetched ${arr.length} klines for ${symbol}.`); // Log the number of data points

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
    
    // Step 2: Calculate a single indicator (RSI14)
    const rsi = lastRSI(closes, 14);

    const last = ks[ks.length - 1];

    const result = {
      symbol: symbol,
      open: last.open,
      high: last.high,
      low: last.low,
      close: last.close,
      volume: last.volume,
      rsi14: rsi,
      data_points: closes.length,
    };
    
    // Log the final result
    console.log(`Final result for ${symbol}:`, result);

    res.status(200).json([result]);

  } catch (err: any) {
    console.error("API /binance-data error:", err);
    res.status(500).json({ error: "Failed to fetch binance data" });
  }
}
