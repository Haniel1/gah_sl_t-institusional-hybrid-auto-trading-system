ALTER TABLE public.auto_trade_config DROP CONSTRAINT auto_trade_config_pair_key;
ALTER TABLE public.auto_trade_config ADD CONSTRAINT auto_trade_config_pair_strategy_key UNIQUE (pair, strategy);