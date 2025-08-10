export type CryptoData = {
  symbol: string;
  price: number;       // was string
  volume?: number;     // was string or missing
  lastClose?: number;
  source: string;
  timestamp?: string;
};
