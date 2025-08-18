import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const preferredRegion = ['bom1','sin1','hkg1']; // avoid blocked regions

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol') ?? 'BTCUSDT';
  const interval = searchParams.get('interval') ?? '15m';
  const limit = searchParams.get('limit') ?? '600';
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const r = await fetch(url);
  return new NextResponse(await r.text(), { status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'application/json' }});
}
