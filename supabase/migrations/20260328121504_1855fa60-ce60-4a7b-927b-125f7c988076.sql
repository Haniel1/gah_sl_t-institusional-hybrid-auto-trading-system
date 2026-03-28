ALTER TABLE trading_users 
ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'indodax',
ADD COLUMN IF NOT EXISTS okx_api_key text DEFAULT '',
ADD COLUMN IF NOT EXISTS okx_secret text DEFAULT '',
ADD COLUMN IF NOT EXISTS okx_passphrase text DEFAULT '';