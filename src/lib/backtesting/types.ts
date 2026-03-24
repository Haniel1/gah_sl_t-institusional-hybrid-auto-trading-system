// Define types for the backtesting module

export interface BacktestResult {
    strategyName: string;
    initialBalance: number;
    finalBalance: number;
    trades: TradeResult[];
}

export interface TradeResult {
    entryPrice: number;
    exitPrice: number;
    profit: number;
    timestamp: string;
}