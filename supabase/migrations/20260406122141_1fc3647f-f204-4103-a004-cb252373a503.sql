
ALTER TABLE public.okx_sim_state DROP CONSTRAINT IF EXISTS okx_sim_state_symbol_key;
ALTER TABLE public.okx_sim_state ADD CONSTRAINT okx_sim_state_symbol_strategy_key UNIQUE (symbol, strategy);
