const SUPABASE_URL = "https://hyorhffbxqksejwfunhv.supabase.co";

// Public publishable key only. Never place a service-role/secret key in browser code.
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_X_c771EZAdhB1t-F7FROlw_7ndeYWp0";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);