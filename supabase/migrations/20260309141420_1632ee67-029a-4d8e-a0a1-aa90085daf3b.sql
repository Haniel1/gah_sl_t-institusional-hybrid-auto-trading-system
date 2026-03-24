ALTER TABLE public.auto_trade_config ALTER COLUMN initial_balance SET DEFAULT 1000000;
ALTER TABLE public.auto_trade_config ALTER COLUMN current_balance SET DEFAULT 1000000;
ALTER TABLE public.auto_trade_config ALTER COLUMN initial_capital SET DEFAULT 1000000;
ALTER TABLE public.auto_trade_config ALTER COLUMN current_capital SET DEFAULT 1000000;
ALTER TABLE public.auto_trade_config ALTER COLUMN strategy SET DEFAULT 'swing-short-term';