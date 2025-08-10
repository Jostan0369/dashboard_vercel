// hooks/useSSE.ts - optional, simple wrapper (not used in polling approach)
import { useEffect, useRef } from 'react';

export function useSSE(timeframe: string, onCandle: (payload:any)=>void) {
  const esRef = useRef<EventSource|null>(null);
  useEffect(()=>{
    const url = `/api/stream?timeframe=${encodeURIComponent(timeframe)}`;
    let es: any = null;
    try{
      es = new EventSource(url);
      es.addEventListener('candle', (ev:any)=>{
        try{ const data = JSON.parse(ev.data); onCandle(data); }catch(e){}
      });
      es.onerror = (err:any)=>{ console.warn('SSE err', err); }
      esRef.current = es;
    }catch(e){
      console.warn('EventSource not available', e);
    }
    return ()=>{ try{ es && es.close(); }catch(e){} }
  },[timeframe,onCandle]);
}
