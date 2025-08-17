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
    const symbol = "BTCUSDT"; 
    const timeframe = "15m";
    const klimit = 600; 

    const url = `${FAPI}/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${timeframe}&limit=${klimit}`;
    const kResp = await fetch(url);

    if (!kResp.ok) {
      throw new Error(`Failed to fetch klines from Binance. Status: ${kResp.status}`);
    }

    const arr = await kResp.json();

    if (!Array.isArray(arr) || arr.length === 0) {
      return res.status(404).json({ error: "No klines data found for this symbol." });
    }

    const closes: number[] = arr.map((k: KlineRow) => parseFloat(k[4]));

    res.status(200).json({ 
        success: true,
        symbol: symbol,
        timeframe: timeframe,
        data_points: closes.length,
        first_10_closes: closes.slice(0, 10),
        last_10_closes: closes.slice(-10)
    });

  } catch (err: any) {
    console.error("API /binance-data error:", err);
    res.status(500).json({ error: "Failed to fetch binance data" });
  }
}
