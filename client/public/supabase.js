const SUPABASE_URL = "https://hyorhffbxqksejwfunhv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_X_c771EZAdhB1t-F7FROlw_7ndeYWp0";

window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// Cloud persistence bridge for the legacy UI. HR records are stored in Supabase,
// not in localStorage. Auth/session keys and UI preferences are left untouched.
(function installCloudStorageBridge() {
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.removeItem;

    const employeeKey = /^hr_employees_data(?:_|$)/;
    const disciplinaryKey = /^hr_disciplinary_data(?:_|$)/;
    const settlementKey = /^hr_settlements_data(?:_|$)/;
    const documentKey = /^hr_employee_documents(?:_|$)/;
    const legacyHrKey = /^(hr_current_company_id)(?:_|$)/;

    let employeeCodes = new Set();
    let disciplinaryIds = new Set();
    let settlementIds = new Set();
    let initialized = false;
    let syncing = false;

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
            console.warn('Supabase cloud request failed:', error);
            return { ok: false, data: null };
        }
    }

    function getCompanyId() {
        const user = requestSync('GET', `${SUPABASE_URL}/auth/v1/user`);
        const userId = user?.data?.id;
        if (!userId) return null;
        const result = requestSync('GET', `${SUPABASE_URL}/rest/v1/companies?select=id&owner_id=eq.${encodeURIComponent(userId)}&limit=1`);
        return result.ok && result.data?.[0]?.id ? result.data[0].id : null;
    }

    function isUuid(value) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
    }

    function employeePayload(item, companyId) {
        const columns = ['emp_code','full_name','national_id','nationality','gender','date_of_birth','email','phone','department','job_title','profession_in_iqama','contract_type','qiwa_contract_status','qiwa_contract_id','hire_date','appointment_date','commencement_date','probation_period_days','contract_end_date','work_status','iqama_expiry_date','passport_number','passport_expiry_date','work_permit_expiry_date','medical_insurance_category','medical_insurance_company','medical_insurance_expiry','basic_salary','housing_allowance','transport_allowance','other_allowances','gosi_employee_deduction','net_salary','bank_name','iban','notes'];
        const payload = { company_id: companyId };
        columns.forEach(column => {
            if (Object.prototype.hasOwnProperty.call(item || {}, column)) payload[column] = item[column] === '' ? null : item[column];
        });
        return payload;
    }

    function disciplinaryPayload(item, companyId) {
        const columns = ['employee_id','emp_code','employee_name','violation_date','violation_type','violation_degree','action_taken','deduction_amount','details','approved_by'];
        const payload = { company_id: companyId };
        if (isUuid(item?.id)) payload.id = item.id;
        columns.forEach(column => {
            if (Object.prototype.hasOwnProperty.call(item || {}, column)) payload[column] = item[column] === '' ? null : item[column];
        });
        if (payload.deduction_amount != null) payload.deduction_amount = Number(payload.deduction_amount) || 0;
        return payload;
    }

    function settlementPayload(item, companyId) {
        const columns = ['employee_id','employee_name','emp_code','termination_date','reason','salary_due','leave_cash','eosb','deductions','advances','other_due','net_settlement'];
        const payload = { company_id: companyId };
        if (isUuid(item?.id)) payload.id = item.id;
        columns.forEach(column => {
            if (Object.prototype.hasOwnProperty.call(item || {}, column)) payload[column] = item[column] === '' ? null : item[column];
        });
        ['salary_due','leave_cash','eosb','deductions','advances','other_due','net_settlement'].forEach(column => {
            if (payload[column] != null) payload[column] = Number(payload[column]) || 0;
        });
        return payload;
    }

    function readTable(table, order = 'created_at.asc') {
        const response = requestSync('GET', `${SUPABASE_URL}/rest/v1/${table}?select=*&order=${order}`);
        return response.ok && Array.isArray(response.data) ? response.data : null;
    }

    function readEmployees() {
        const data = readTable('employees', 'emp_code.asc');
        if (!data) return null;
        employeeCodes = new Set(data.map(row => String(row.emp_code || '')).filter(Boolean));
        return data;
    }

    function recordFingerprint(item, type) {
        const fields = type === 'disciplinary'
            ? ['emp_code','employee_name','violation_date','violation_type','violation_degree','action_taken','deduction_amount','details','approved_by']
            : ['employee_id','employee_name','emp_code','termination_date','reason','salary_due','leave_cash','eosb','deductions','advances','other_due','net_settlement'];
        return fields.map(field => String(item?.[field] ?? '')).join('|');
    }

    function syncCollection(items, table, type) {
        if (!Array.isArray(items) || syncing) return;
        const companyId = getCompanyId();
        if (!companyId) return;
        syncing = true;
        try {
            const payloads = items.map(item => type === 'disciplinary' ? disciplinaryPayload(item, companyId) : settlementPayload(item, companyId));
            const currentFingerprints = new Set(payloads.map(item => recordFingerprint(item, type)));
            const remote = readTable(table);
            const remoteRows = remote || [];

            payloads.forEach(payload => {
                if (payload.id && isUuid(payload.id)) {
                    requestSync('PATCH', `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(payload.id)}`, payload);
                } else {
                    // Match an existing record by its business fields to avoid duplicates
                    // when the legacy UI generates ids such as disc-123 or settle-123.
                    const match = remoteRows.find(row => recordFingerprint(row, type) === recordFingerprint(payload, type));
                    if (match?.id) {
                        requestSync('PATCH', `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(match.id)}`, payload);
                    } else {
                        requestSync('POST', `${SUPABASE_URL}/rest/v1/${table}`, payload);
                    }
                }
            });

            // Only reconcile deletions after a successful remote read.
            if (remote) {
                remoteRows.forEach(row => {
                    if (!currentFingerprints.has(recordFingerprint(row, type))) {
                        requestSync('DELETE', `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(row.id)}`);
                    }
                });
            }
        } finally {
            syncing = false;
        }
    }

    function readDisciplinary() {
        const data = readTable('disciplinary_actions');
        if (!data) return null;
        disciplinaryIds = new Set(data.map(row => row.id));
        return data;
    }

    function readSettlements() {
        const data = readTable('settlements');
        if (!data) return null;
        settlementIds = new Set(data.map(row => row.id));
        return data;
    }

    Storage.prototype.getItem = function(key) {
        const name = String(key);
        if (this === localStorage) {
            if (employeeKey.test(name)) {
                const cloud = readEmployees();
                return cloud ? JSON.stringify(cloud) : null;
            }
            if (disciplinaryKey.test(name)) {
                const cloud = readDisciplinary();
                return cloud ? JSON.stringify(cloud) : null;
            }
            if (settlementKey.test(name)) {
                const cloud = readSettlements();
                return cloud ? JSON.stringify(cloud) : null;
            }
            if (documentKey.test(name) || legacyHrKey.test(name)) return null;
        }
        return originalGetItem.call(this, key);
    };

    Storage.prototype.setItem = function(key, value) {
        const name = String(key);
        if (this === localStorage) {
            try {
                const parsed = JSON.parse(value || '[]');
                if (employeeKey.test(name) && Array.isArray(parsed)) {
                    const companyId = getCompanyId();
                    if (companyId) {
                        const existing = readEmployees() || [];
                        const current = new Set(parsed.map(item => String(item.emp_code || '')).filter(Boolean));
                        parsed.forEach(item => {
                            if (!item?.emp_code) return;
                            const payload = employeePayload(item, companyId);
                            const old = existing.find(row => String(row.emp_code) === String(item.emp_code));
                            if (old?.id) requestSync('PATCH', `${SUPABASE_URL}/rest/v1/employees?id=eq.${encodeURIComponent(old.id)}`, payload);
                            else requestSync('POST', `${SUPABASE_URL}/rest/v1/employees`, payload);
                        });
                        existing.forEach(old => {
                            if (old.emp_code && !current.has(String(old.emp_code))) requestSync('DELETE', `${SUPABASE_URL}/rest/v1/employees?emp_code=eq.${encodeURIComponent(old.emp_code)}`);
                        });
                    }
                    return;
                }
                if (disciplinaryKey.test(name) && Array.isArray(parsed)) {
                    syncCollection(parsed, 'disciplinary_actions', 'disciplinary');
                    return;
                }
                if (settlementKey.test(name) && Array.isArray(parsed)) {
                    syncCollection(parsed, 'settlements', 'settlement');
                    return;
                }
            } catch (error) {
                console.warn('Cloud persistence parse error:', error);
            }
            if (documentKey.test(name) || legacyHrKey.test(name)) return;
        }
        originalSetItem.call(this, key, value);
    };

    Storage.prototype.removeItem = function(key) {
        const name = String(key);
        if (this === localStorage && (employeeKey.test(name) || disciplinaryKey.test(name) || settlementKey.test(name) || documentKey.test(name) || legacyHrKey.test(name))) return;
        originalRemoveItem.call(this, key);
    };

    window.supabaseHRCloud = {
        readEmployees,
        readDisciplinary,
        readSettlements,
        syncDisciplinary: items => syncCollection(items, 'disciplinary_actions', 'disciplinary'),
        syncSettlements: items => syncCollection(items, 'settlements', 'settlement')
    };
})();
