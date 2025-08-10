// lib/binanceWs.ts
import WebSocket from 'ws';
import EventEmitter from 'events';
import { getKlines } from './binance';
import { ema, macd, rsi } from './indicators';

type KlineObj = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  isFinal: boolean;
};

const BINANCE_FUTURES_BASE = 'wss://fstream.binance.com/stream?streams=';

export class BinanceWsManager extends EventEmitter {
  private symbols: string[];
  private timeframe: string;
  private batchSize = 60; // tweak if needed
  private klinesNeeded = 500;
  private cache: Map<string, number[]> = new Map(); // symbol -> closes
  private sockets: Map<number, WebSocket> = new Map();
  private backoffs: Map<number, number> = new Map();

  constructor(symbols: string[], timeframe = '1m') {
    super();
    this.symbols = symbols;
    this.timeframe = timeframe;
  }

  async init() {
    // prefetch historical closes
    await Promise.all(this.symbols.map(s => this.fetchInitial(s)));
    // connect batches
    for (let i = 0; i < this.symbols.length; i += this.batchSize) {
      const chunk = this.symbols.slice(i, i + this.batchSize).map(s => `${s.toLowerCase()}@kline_${this.timeframe}`);
      this.connectBatch(chunk, i / this.batchSize);
    }
  }

  private async fetchInitial(symbol: string) {
    try {
      const klines = await getKlines(symbol, this.timeframe, this.klinesNeeded);
      const closes = klines.map(k => k.close);
      this.cache.set(symbol, closes);
    } catch (err: any) {
      console.warn('fetchInitial failed', symbol, err?.message ?? err);
      this.cache.set(symbol, []);
    }
  }

  private connectBatch(streams: string[], batchIndex: number) {
    if (!streams.length) return;
    const url = BINANCE_FUTURES_BASE + streams.join('/');
    const ws = new WebSocket(url);
    this.sockets.set(batchIndex, ws);
    this.backoffs.set(batchIndex, 1000);

    let pingTimer: NodeJS.Timeout | null = null;

    ws.on('open', () => {
      this.backoffs.set(batchIndex, 1000);
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        try { ws.ping(); } catch (e) {}
      }, 60_000 * 2);
      console.log(`Binance WS batch ${batchIndex} open (${streams.length})`);
    });

    ws.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString());
        if (!parsed || !parsed.data) return;
        const data = parsed.data;
        if (data.e === 'kline' && data.k) {
          const k = this.parseKline(data.k);
          const symbol = data.s;
          this.handleKline(symbol, k);
        }
      } catch (e) {
        // ignore
      }
    });

    ws.on('close', (code, reason) => {
      if (pingTimer) clearInterval(pingTimer);
      console.warn(`WS batch ${batchIndex} closed`, code, reason?.toString?.() ?? reason);
      this.sockets.delete(batchIndex);
      this.scheduleReconnect(streams, batchIndex);
    });

    ws.on('error', (err) => {
      console.error('WS batch error', err?.message ?? err);
      try { ws.terminate(); } catch {}
    });
  }

  private scheduleReconnect(streams: string[], batchIndex: number) {
    const prev = this.backoffs.get(batchIndex) ?? 1000;
    const next = Math.min(prev * 2, 60_000);
    this.backoffs.set(batchIndex, next);
    setTimeout(() => this.connectBatch(streams, batchIndex), next);
  }

  private parseKline(k: any): KlineObj {
    return {
      openTime: k.t,
      open: parseFloat(k.o),
      high: parseFloat(k.h),
      low: parseFloat(k.l),
      close: parseFloat(k.c),
      volume: parseFloat(k.v),
      closeTime: k.T,
      isFinal: !!k.x,
    };
  }

  private handleKline(symbol: string, k: KlineObj) {
    const cur = this.cache.get(symbol) || [];
    cur.push(k.close);
    if (cur.length > this.klinesNeeded) cur.splice(0, cur.length - this.klinesNeeded);
    this.cache.set(symbol, cur);

    // compute indicators when kline closed (final)
    if (!k.isFinal) return;

    const closes = this.cache.get(symbol) || [];
    if (closes.length < 2) return;

    const ema12 = ema(closes, 12).filter(v => v != null).slice(-1)[0] ?? null;
    const ema26 = ema(closes, 26).filter(v => v != null).slice(-1)[0] ?? null;
    const ema50 = ema(closes, 50).filter(v => v != null).slice(-1)[0] ?? null;
    const ema100 = ema(closes, 100).filter(v => v != null).slice(-1)[0] ?? null;
    const ema200 = ema(closes, 200).filter(v => v != null).slice(-1)[0] ?? null;
    const m = macd(closes, 12, 26, 9);
    const macdVal = m.macdLine.filter(v => v != null).slice(-1)[0] ?? null;
    const macdSignal = m.signalLine.filter(v => v != null).slice(-1)[0] ?? null;
    const macdHist = m.histogram.filter(v => v != null).slice(-1)[0] ?? null;
    const rsi14 = rsi(closes, 14).filter(v => v != null).slice(-1)[0] ?? null;

    const payload = {
      symbol,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volume,
      ema12,
      ema26,
      ema50,
      ema100,
      ema200,
      macd: macdVal,
      macdSignal,
      macdHist,
      rsi14,
      ts: Date.now(),
    };

    this.emit('candle', payload);
  }
}
