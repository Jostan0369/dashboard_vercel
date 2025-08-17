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
    const timeframe = (req.query.timeframe as string) || "15m";
    const maxSymbols = Number(req.query.maxSymbols ?? 60);
    const klimit = Number(req.query.klimit ?? 600);

    // 1) exchangeInfo -> list of futures USDT perpetuals
    const exResp = await fetch(`${FAPI}/fapi/v1/exchangeInfo`);
    if (!exResp.ok) throw new Error(`Failed to fetch exchangeInfo: ${exResp.statusText}`);
    const ex = await exResp.json();

    const allSymbols: string[] = (ex.symbols ?? [])
      .filter((s: any) => s.contractType === "PERPETUAL" && s.quoteAsset === "USDT" && s.status === "TRADING")
      .map((s: any) => (s.symbol as string).toLowerCase());

    // 2) rank by 24h volume (optional, best UX)
    let topSymbols = allSymbols.slice(0, maxSymbols);
    try {
      const t24Resp = await fetch(`${FAPI}/fapi/v1/ticker/24hr`);
      if (t24Resp.ok) {
        const t24 = await t24Resp.json();
        const volMap = new Map<string, number>();
        (t24 ?? []).forEach((t: any) => {
          if (t && typeof t.symbol === "string" && t.symbol.endsWith("USDT")) {
            volMap.set((t.symbol as string).toLowerCase(), parseFloat(t.volume) || 0);
          }
        });
        topSymbols = [...allSymbols]
          .sort((a, b) => (volMap.get(b) || 0) - (volMap.get(a) || 0))
          .slice(0, maxSymbols);
      }
    } catch (err) {
      // ignore ranking error — fall back to first N symbols
      topSymbols = allSymbols.slice(0, maxSymbols);
    }

    // 3) fetch klines and process each symbol one by one
    const rows = [];
    for (const sym of topSymbols) {
      try {
        const url = `${FAPI}/fapi/v1/klines?symbol=${encodeURIComponent(sym.toUpperCase())}&interval=${timeframe}&limit=${klimit}`;
        const kResp = await fetch(url);
        if (!kResp.ok) {
          console.error(`Failed to fetch klines for ${sym}: ${kResp.statusText}`);
          continue; // Skip to the next symbol on failure
        }
        const arr = await kResp.json();

        if (!Array.isArray(arr) || arr.length === 0) {
          console.warn(`No klines data for ${sym}`);
          continue;
        }

        const ks: Kline[] = arr.map((k: KlineRow) => ({
          open: +k[1],
          high: +k[2],
          low: +k[3],
          close: +k[4],
          volume: +k[5],
        }));

        if (ks.length === 0) continue;

        const closes: number[] = ks.map((kline: Kline) => kline.close);
        const last = ks[ks.length - 1];

        // Indicators
        const rsi = lastRSI(closes, 14);
        const ema12 = lastEMA(closes, 12);
        const ema26 = lastEMA(closes, 26);
        const ema50 = lastEMA(closes, 50);
        const ema100 = lastEMA(closes, 100);
        const ema200 = lastEMA(closes, 200);
        const macdVals = lastMACD(closes, 12, 26, 9);

        rows.push({
          symbol: sym.toUpperCase(),
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
        });

      } catch (err) {
        console.error(`Error processing data for ${sym}:`, err);
        // Continue to the next symbol instead of failing
        continue;
      }
    }

    res.status(200).json(rows);
  } catch (err: any) {
    console.error("API /binance-data fatal error:", err);
    res.status(500).json({ error: "Failed to fetch data from Binance." });
  }
}
