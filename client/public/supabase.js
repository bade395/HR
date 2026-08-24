const SUPABASE_URL = "https://hyorhffbxqksejwfunhv.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_X_c771EZAdhB1t-F7FROlw_7ndeYWp0";

window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);
