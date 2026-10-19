-- Retire the waitlist signup flow.
-- The waitlist table is kept (it holds real signups) but the RPC is removed.
DROP FUNCTION IF EXISTS join_waitlist(text, text, text, int, text);
