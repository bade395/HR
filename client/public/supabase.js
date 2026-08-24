const SUPABASE_URL = "https://hyorhffbxqksejwfunhv.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_X_c771EZAdhB1t-F7FROlw_7ndeYWp0";

// Supabase is the cloud data source. Do not use localStorage for HR records.
window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

// Remove legacy HR data from browser storage without touching the Supabase Auth
// session or unrelated application preferences.
(function clearLegacyHRStorage() {
    try {
        const legacyPrefixes = [
            'hr_employees_data',
            'hr_current_company_id',
            'hr_disciplinary',
            'hr_disciplinary_actions',
            'hr_settlements',
            'hr_employee_documents'
        ];

        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;
            if (legacyPrefixes.some(prefix => key === prefix || key.startsWith(prefix + '_'))) {
                keys.push(key);
            }
        }

        keys.forEach(key => localStorage.removeItem(key));
    } catch (error) {
        console.warn('Unable to clear legacy HR browser data:', error);
    }
})();
