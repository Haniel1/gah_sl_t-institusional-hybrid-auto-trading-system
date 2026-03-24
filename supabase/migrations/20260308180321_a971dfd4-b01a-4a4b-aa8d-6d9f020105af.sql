
ALTER TABLE simulation_state DROP CONSTRAINT simulation_state_coin_symbol_key;
ALTER TABLE simulation_state ADD CONSTRAINT simulation_state_coin_symbol_strategy_key UNIQUE (coin_symbol, strategy);
