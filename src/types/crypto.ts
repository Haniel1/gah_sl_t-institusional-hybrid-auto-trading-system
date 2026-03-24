export interface CoinData {
  id: string;
  symbol: string;
  name: string;
  last: number;
  high: number;
  low: number;
  buy: number;
  sell: number;
  volumeIdr: number;
  change24h: number;
}

export type SignalAction = 'BUY' | 'SELL' | 'HOLD';

export interface Signal {
  action: SignalAction;
  confidence: number;
  reasons: string[];
  takeProfit: number;
  stopLoss: number;
  rsi: number;
  macd: number;
  zScore: number;
}

export interface NotificationLog {
  id: string;
  coin: string;
  signal: SignalAction;
  message: string;
  timestamp: Date;
  sent: boolean;
}

export const WATCHLIST = [
  'BTC', 'ETH', 'SOL', 'DOGE', 'BNB', 'XRP', 'BCH', 'TRX', 'AAVE', 'ICP',
  'WLD', 'QNT', 'WBTC', 'PAXG', 'XAUT', 'FARTCOIN', 'PIPPIN', 'YFI', 'CST',
  'ADA', 'DOT', 'LINK', 'UNI', 'SFI',
];

export const AUTO_TRADE_COINS = ['PIPPIN', 'SFI', 'ICP', 'XAUT', 'AAVE', 'BCH', 'PAXG'];

export const COIN_NAMES: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', DOGE: 'Dogecoin',
  BNB: 'BNB', XRP: 'Ripple', BCH: 'Bitcoin Cash', TRX: 'TRON',
  AAVE: 'Aave', ICP: 'Internet Computer', WLD: 'Worldcoin',
  QNT: 'Quant', WBTC: 'Wrapped Bitcoin', PAXG: 'PAX Gold',
  XAUT: 'Tether Gold', ADA: 'Cardano', DOT: 'Polkadot',
  LINK: 'Chainlink', UNI: 'Uniswap', YFI: 'yearn.finance', SFI: 'Socket Finance',
  CST: 'Castcoin', FARTCOIN: 'Fartcoin', PIPPIN: 'Pippin',
  USDT: 'Tether', USDC: 'USD Coin', MATIC: 'Polygon',
  AVAX: 'Avalanche', ATOM: 'Cosmos', FIL: 'Filecoin',
  LTC: 'Litecoin', NEAR: 'NEAR', APT: 'Aptos',
  ARB: 'Arbitrum', OP: 'Optimism', SUI: 'Sui',
  SEI: 'Sei', INJ: 'Injective', SHIB: 'Shiba Inu',
  PEPE: 'Pepe', ALGO: 'Algorand', VET: 'VeChain',
  SAND: 'The Sandbox', MANA: 'Decentraland', GALA: 'Gala',
  AXS: 'Axie Infinity', IMX: 'Immutable X', RUNE: 'THORChain',
  DYDX: 'dYdX', CRV: 'Curve', MKR: 'Maker',
};
