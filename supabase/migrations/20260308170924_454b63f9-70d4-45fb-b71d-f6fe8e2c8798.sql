
CREATE OR REPLACE FUNCTION public.verify_password(_username text, _password text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM trading_users
    WHERE username = _username
    AND password_hash = extensions.crypt(_password, password_hash)
  );
$$;

CREATE OR REPLACE FUNCTION public.hash_password(_password text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT extensions.crypt(_password, extensions.gen_salt('bf'));
$$;
