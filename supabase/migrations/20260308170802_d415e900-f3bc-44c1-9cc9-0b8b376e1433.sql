
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE trading_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  indodax_api_key text DEFAULT '',
  indodax_secret text DEFAULT '',
  telegram_bot_token text DEFAULT '',
  telegram_chat_id text DEFAULT '',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE trading_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on trading_users" ON trading_users FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE auto_trade_config ADD COLUMN user_id uuid REFERENCES trading_users(id) ON DELETE CASCADE;
ALTER TABLE trade_history ADD COLUMN user_id uuid REFERENCES trading_users(id) ON DELETE CASCADE;

INSERT INTO trading_users (name, username, password_hash)
VALUES ('Raxlty', 'Raxlty', crypt('@Samuelch14', gen_salt('bf')));

UPDATE auto_trade_config SET user_id = (SELECT id FROM trading_users WHERE username = 'Raxlty');
UPDATE trade_history SET user_id = (SELECT id FROM trading_users WHERE username = 'Raxlty');
