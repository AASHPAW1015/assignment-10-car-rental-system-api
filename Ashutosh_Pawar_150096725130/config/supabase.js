const { createClient } = require("@supabase/supabase-js");

const options = { auth: { persistSession: false, autoRefreshToken: false } };

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, options);

const authClient = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, options);

const clientForToken = (token) =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    ...options,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

module.exports = { supabase, authClient, clientForToken };
