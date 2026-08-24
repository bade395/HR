const SUPABASE_URL = "https://hyorhffbxqksejwfunhv.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "ضع_هنا_PUBLISHABLE_KEY_الذي_أرسلته_لي";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);