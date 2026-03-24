-- Fix null coin_symbol entries by deriving from pair
UPDATE auto_trade_config SET coin_symbol = UPPER(REPLACE(REPLACE(pair, '_idr', ''), '_', '')) WHERE coin_symbol IS NULL AND pair IS NOT NULL;

-- Set all currently enabled configs to disabled so user manually enables them
UPDATE auto_trade_config SET enabled = false WHERE enabled = true;