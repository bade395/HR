const SUPABASE_URL = "https://hyorhffbxqksejwfunhv.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_X_c771EZAdhB1t-F7FROlw_7ndeYWp0";

window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

// HR employee records are cloud-only. The browser storage bridge below keeps
// the existing legacy UI working while redirecting employee reads/writes to
// Supabase. It never stores employee data in localStorage.
(function installEmployeeCloudStorageBridge() {
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.removeItem;
    const employeeKey = /^hr_employees_data(?:_|$)/;
    const legacyHrKey = /^(hr_current_company_id|hr_disciplinary_data|hr_settlements_data|hr_employee_documents)(?:_|$)/;

    let lastRemoteEmployeeCodes = new Set();
    let remoteReadSucceeded = false;
    let syncInProgress = false;

    function authAccessToken() {
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key || !key.endsWith('-auth-token')) continue;
                const raw = originalGetItem.call(localStorage, key);
                if (!raw) continue;
                const parsed = JSON.parse(raw);
                if (parsed?.access_token) return parsed.access_token;
                if (parsed?.currentSession?.access_token) return parsed.currentSession.access_token;
            }
        } catch (_) {}
        return null;
    }

    function requestSync(method, url, body) {
        const token = authAccessToken();
        if (!token) return { ok: false, data: null };
        try {
            const xhr = new XMLHttpRequest();
            xhr.open(method, url, false);
            xhr.setRequestHeader('apikey', SUPABASE_PUBLISHABLE_KEY);
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.setRequestHeader('Prefer', 'return=representation');
            xhr.send(body == null ? null : JSON.stringify(body));
            let data = null;
            try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch (_) {}
            return { ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data };
        } catch (error) {
            console.warn('Supabase employee request failed:', error);
            return { ok: false, data: null };
        }
    }

    function employeeColumns(item, companyId) {
        const allowed = [
            'emp_code','full_name','national_id','nationality','gender','date_of_birth',
            'email','phone','department','job_title','profession_in_iqama','contract_type',
            'qiwa_contract_status','qiwa_contract_id','hire_date','appointment_date',
            'commencement_date','probation_period_days','contract_end_date','work_status',
            'iqama_expiry_date','passport_number','passport_expiry_date',
            'work_permit_expiry_date','medical_insurance_category','medical_insurance_company',
            'medical_insurance_expiry','basic_salary','housing_allowance','transport_allowance',
            'other_allowances','gosi_employee_deduction','net_salary','bank_name','iban','notes'
        ];
        const payload = { company_id: companyId };
        allowed.forEach(column => {
            if (item && Object.prototype.hasOwnProperty.call(item, column)) {
                payload[column] = item[column] === '' ? null : item[column];
            }
        });
        return payload;
    }

    function getCompanyId() {
        const token = authAccessToken();
        if (!token) return null;
        try {
            const userResponse = requestSync('GET', `${SUPABASE_URL}/auth/v1/user`);
            const userId = userResponse?.data?.id;
            if (!userId) return null;
            const url = `${SUPABASE_URL}/rest/v1/companies?select=id&owner_id=eq.${encodeURIComponent(userId)}&limit=1`;
            const companyResponse = requestSync('GET', url);
            return companyResponse.ok && Array.isArray(companyResponse.data) && companyResponse.data[0]?.id
                ? companyResponse.data[0].id
                : null;
        } catch (_) {
            return null;
        }
    }

    function readRemoteEmployees() {
        const token = authAccessToken();
        if (!token) return null;
        const url = `${SUPABASE_URL}/rest/v1/employees?select=*&order=emp_code.asc`;
        const response = requestSync('GET', url);
        if (!response.ok || !Array.isArray(response.data)) return null;
        remoteReadSucceeded = true;
        lastRemoteEmployeeCodes = new Set(response.data.map(row => String(row.emp_code ?? '')).filter(Boolean));
        return response.data;
    }

    function syncEmployees(items) {
        if (syncInProgress || !Array.isArray(items)) return;
        const companyId = getCompanyId();
        if (!companyId) return;
        syncInProgress = true;
        try {
            const currentCodes = new Set();
            for (const item of items) {
                if (!item?.emp_code) continue;
                const code = String(item.emp_code).trim();
                currentCodes.add(code);
                const payload = employeeColumns(item, companyId);
                const lookupUrl = `${SUPABASE_URL}/rest/v1/employees?select=id&company_id=eq.${encodeURIComponent(companyId)}&emp_code=eq.${encodeURIComponent(code)}&limit=1`;
                const existing = requestSync('GET', lookupUrl);
                if (existing.ok && Array.isArray(existing.data) && existing.data[0]?.id) {
                    requestSync('PATCH', `${SUPABASE_URL}/rest/v1/employees?id=eq.${encodeURIComponent(existing.data[0].id)}`, payload);
                } else {
                    requestSync('POST', `${SUPABASE_URL}/rest/v1/employees`, payload);
                }
            }

            // Reconcile deletions only after a successful remote read. This prevents
            // an authentication/network failure from accidentally deleting cloud data.
            if (remoteReadSucceeded) {
                for (const oldCode of lastRemoteEmployeeCodes) {
                    if (!currentCodes.has(oldCode)) {
                        requestSync('DELETE', `${SUPABASE_URL}/rest/v1/employees?company_id=eq.${encodeURIComponent(companyId)}&emp_code=eq.${encodeURIComponent(oldCode)}`);
                    }
                }
            }

            // Refresh the authoritative code set after a successful write cycle.
            const refreshed = readRemoteEmployees();
            if (refreshed) lastRemoteEmployeeCodes = new Set(refreshed.map(row => String(row.emp_code ?? '')).filter(Boolean));
        } finally {
            syncInProgress = false;
        }
    }

    Storage.prototype.getItem = function(key) {
        if (this === localStorage && employeeKey.test(String(key))) {
            const cloud = readRemoteEmployees();
            return cloud ? JSON.stringify(cloud) : null;
        }
        if (this === localStorage && legacyHrKey.test(String(key))) {
            return null;
        }
        return originalGetItem.call(this, key);
    };

    Storage.prototype.setItem = function(key, value) {
        if (this === localStorage && employeeKey.test(String(key))) {
            try {
                const parsed = JSON.parse(value || '[]');
                if (Array.isArray(parsed)) syncEmployees(parsed);
            } catch (error) {
                console.warn('Invalid employee cloud payload:', error);
            }
            return;
        }
        if (this === localStorage && legacyHrKey.test(String(key))) return;
        originalSetItem.call(this, key, value);
    };

    Storage.prototype.removeItem = function(key) {
        if (this === localStorage && (employeeKey.test(String(key)) || legacyHrKey.test(String(key)))) return;
        originalRemoveItem.call(this, key);
    };

    window.supabaseEmployeeCloud = {
        read: readRemoteEmployees,
        sync: syncEmployees
    };
})();
