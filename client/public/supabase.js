const SUPABASE_URL = "https://hyorhffbxqksejwfunhv.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_X_c771EZAdhB1t-F7FROlw_7ndeYWp0";

window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

// Cloud persistence bridge. The existing UI can continue using localStorage as
// its working state while important HR records are mirrored to Supabase so the
// same authenticated user sees them on every device.
(function setupCloudPersistence() {
    const originalSetItem = Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.removeItem;
    const timers = new Map();
    let companyId = null;
    let ready = false;
    let hydrating = false;

    const employeeColumns = [
        'emp_code','full_name','national_id','nationality','gender','date_of_birth',
        'email','phone','department','job_title','profession_in_iqama','contract_type',
        'qiwa_contract_status','qiwa_contract_id','hire_date','appointment_date',
        'commencement_date','probation_period_days','contract_end_date','work_status',
        'iqama_expiry_date','passport_number','passport_expiry_date',
        'work_permit_expiry_date','medical_insurance_category','medical_insurance_company',
        'medical_insurance_expiry','basic_salary','housing_allowance','transport_allowance',
        'other_allowances','gosi_employee_deduction','net_salary','bank_name','iban','notes'
    ];

    const numeric = new Set([
        'probation_period_days','basic_salary','housing_allowance','transport_allowance',
        'other_allowances','gosi_employee_deduction','net_salary','deduction_amount',
        'salary_due','leave_cash','eosb','deductions','advances','other_due','net_settlement'
    ]);
    const dates = new Set([
        'date_of_birth','hire_date','appointment_date','commencement_date','contract_end_date',
        'iqama_expiry_date','passport_expiry_date','work_permit_expiry_date',
        'medical_insurance_expiry','violation_date','termination_date'
    ]);

    function parseArray(value) {
        try {
            const parsed = JSON.parse(value || '');
            return Array.isArray(parsed) ? parsed : null;
        } catch (_) {
            return null;
        }
    }

    function valueForColumn(value, column) {
        if (value === undefined || value === null || value === '') return null;
        if (dates.has(column)) return String(value).slice(0, 10);
        if (numeric.has(column)) {
            const n = Number(value);
            return Number.isFinite(n) ? n : 0;
        }
        return value;
    }

    function normalizeEmployee(item) {
        const row = { company_id: companyId };
        for (const column of employeeColumns) row[column] = valueForColumn(item?.[column], column);
        return row;
    }

    async function getCompany() {
        const { data: userData, error: userError } = await window.supabaseClient.auth.getUser();
        if (userError || !userData?.user) return null;
        const { data, error } = await window.supabaseClient
            .from('companies').select('id').eq('owner_id', userData.user.id).limit(1).maybeSingle();
        if (error) throw error;
        if (data?.id) return data.id;
        const { data: created, error: createError } = await window.supabaseClient
            .from('companies')
            .insert({ owner_id: userData.user.id, name: 'شركة النسر الثاقب', cr_number: '7054465872' })
            .select('id').single();
        if (createError) throw createError;
        return created.id;
    }

    async function employeeIdFor(item) {
        if (item?.employee_id && /^[0-9a-f-]{36}$/i.test(String(item.employee_id))) return item.employee_id;
        const code = item?.emp_code ?? item?.employee_code;
        const name = item?.employee_name ?? item?.full_name ?? item?.employeeName;
        let query = window.supabaseClient.from('employees').select('id').eq('company_id', companyId);
        if (code != null && String(code).trim()) {
            const { data } = await query.eq('emp_code', String(code).trim()).limit(1).maybeSingle();
            if (data?.id) return data.id;
        }
        if (name != null && String(name).trim()) {
            const { data } = await window.supabaseClient.from('employees').select('id')
                .eq('company_id', companyId).eq('full_name', String(name).trim()).limit(1).maybeSingle();
            if (data?.id) return data.id;
        }
        return null;
    }

    async function syncEmployees(items) {
        if (!Array.isArray(items) || !companyId) return;
        for (const item of items) {
            if (!item?.emp_code && !item?.national_id) continue;
            const payload = normalizeEmployee(item);
            const { data: existing, error: findError } = await window.supabaseClient
                .from('employees').select('id').eq('company_id', companyId)
                .eq('emp_code', String(item.emp_code || '')).limit(1).maybeSingle();
            if (findError) throw findError;
            if (existing?.id) {
                const { error } = await window.supabaseClient.from('employees').update(payload).eq('id', existing.id);
                if (error) throw error;
            } else {
                const { error } = await window.supabaseClient.from('employees').insert(payload);
                if (error) throw error;
            }
        }
    }

    async function syncDisciplinary(items) {
        if (!Array.isArray(items) || !companyId) return;
        for (const item of items) {
            if (!item || (!item.violation_type && !item.action_taken && !item.violation_date)) continue;
            const employeeId = await employeeIdFor(item);
            const payload = {
                company_id: companyId,
                employee_id: employeeId,
                emp_code: item.emp_code ?? item.employee_code ?? null,
                employee_name: item.employee_name ?? item.full_name ?? item.employeeName ?? null,
                violation_date: valueForColumn(item.violation_date ?? item.date, 'violation_date'),
                violation_type: item.violation_type ?? item.type ?? 'مخالفة',
                violation_degree: item.violation_degree ?? item.degree ?? null,
                action_taken: item.action_taken ?? item.action ?? item.penalty ?? null,
                deduction_amount: valueForColumn(item.deduction_amount ?? item.amount ?? item.deduction, 'deduction_amount'),
                details: item.details ?? item.notes ?? null,
                approved_by: item.approved_by ?? item.approvedBy ?? null
            };
            const stableId = item.id;
            if (stableId && /^[0-9a-f-]{36}$/i.test(String(stableId))) {
                const { data: existing } = await window.supabaseClient.from('disciplinary_actions').select('id')
                    .eq('id', stableId).eq('company_id', companyId).maybeSingle();
                if (existing?.id) {
                    const { error } = await window.supabaseClient.from('disciplinary_actions').update(payload).eq('id', existing.id);
                    if (error) throw error;
                    continue;
                }
            }
            const { data: existingRows, error: findError } = await window.supabaseClient
                .from('disciplinary_actions').select('id').eq('company_id', companyId)
                .eq('emp_code', payload.emp_code || '').eq('violation_date', payload.violation_date)
                .eq('violation_type', payload.violation_type).limit(1);
            if (findError) throw findError;
            if (existingRows?.[0]?.id) {
                const { error } = await window.supabaseClient.from('disciplinary_actions').update(payload).eq('id', existingRows[0].id);
                if (error) throw error;
            } else {
                const { error } = await window.supabaseClient.from('disciplinary_actions').insert(payload);
                if (error) throw error;
            }
        }
    }

    async function syncSettlements(items) {
        if (!Array.isArray(items) || !companyId) return;
        for (const item of items) {
            if (!item || (!item.employee_name && !item.emp_code && !item.employee_id)) continue;
            const employeeId = await employeeIdFor(item);
            const payload = {
                company_id: companyId,
                employee_id: employeeId,
                employee_name: item.employee_name ?? item.full_name ?? item.employeeName ?? null,
                emp_code: item.emp_code ?? item.employee_code ?? null,
                termination_date: valueForColumn(item.termination_date ?? item.date, 'termination_date'),
                reason: item.reason ?? item.termination_reason ?? null,
                salary_due: valueForColumn(item.salary_due ?? item.salary, 'salary_due'),
                leave_cash: valueForColumn(item.leave_cash ?? item.leave_encashment, 'leave_cash'),
                eosb: valueForColumn(item.eosb ?? item.end_of_service, 'eosb'),
                deductions: valueForColumn(item.deductions ?? item.deduction, 'deductions'),
                advances: valueForColumn(item.advances ?? item.advance, 'advances'),
                other_due: valueForColumn(item.other_due ?? item.other, 'other_due'),
                net_settlement: valueForColumn(item.net_settlement ?? item.net ?? item.total, 'net_settlement')
            };
            const stableId = item.id;
            if (stableId && /^[0-9a-f-]{36}$/i.test(String(stableId))) {
                const { data: existing } = await window.supabaseClient.from('settlements').select('id')
                    .eq('id', stableId).eq('company_id', companyId).maybeSingle();
                if (existing?.id) {
                    const { error } = await window.supabaseClient.from('settlements').update(payload).eq('id', existing.id);
                    if (error) throw error;
                    continue;
                }
            }
            const { data: existingRows, error: findError } = await window.supabaseClient
                .from('settlements').select('id').eq('company_id', companyId)
                .eq('emp_code', payload.emp_code || '').eq('termination_date', payload.termination_date).limit(1);
            if (findError) throw findError;
            if (existingRows?.[0]?.id) {
                const { error } = await window.supabaseClient.from('settlements').update(payload).eq('id', existingRows[0].id);
                if (error) throw error;
            } else {
                const { error } = await window.supabaseClient.from('settlements').insert(payload);
                if (error) throw error;
            }
        }
    }

    function looksLikeEmployees(items) {
        return items.some(x => x && (x.emp_code || x.national_id) && (x.full_name || x.job_title));
    }
    function looksLikeDisciplinary(items) {
        return items.some(x => x && (x.violation_type || x.action_taken || x.violation_date) &&
            (x.employee_name || x.emp_code || x.employee_id));
    }
    function looksLikeSettlement(items) {
        return items.some(x => x && (x.net_settlement != null || x.eosb != null || x.termination_date != null) &&
            (x.employee_name || x.emp_code || x.employee_id));
    }

    async function syncUnknownArray(items) {
        if (!ready || hydrating || !Array.isArray(items) || !items.length) return;
        try {
            if (looksLikeEmployees(items)) await syncEmployees(items);
            else if (looksLikeDisciplinary(items)) await syncDisciplinary(items);
            else if (looksLikeSettlement(items)) await syncSettlements(items);
        } catch (error) {
            console.error('Supabase HR cloud sync failed:', error);
        }
    }

    async function hydrateEmployees() {
        if (!companyId) return;
        const key = `hr_employees_data_${companyId}`;
        const { data: cloud, error } = await window.supabaseClient.from('employees').select('*')
            .eq('company_id', companyId).order('emp_code', { ascending: true });
        if (error) throw error;
        const local = parseArray(localStorage.getItem(key)) || [];
        if ((!cloud || cloud.length === 0) && local.length) await syncEmployees(local);
        const { data: finalRows } = await window.supabaseClient.from('employees').select('*')
            .eq('company_id', companyId).order('emp_code', { ascending: true });
        hydrating = true;
        originalSetItem.call(localStorage, 'hr_current_company_id', companyId);
        originalSetItem.call(localStorage, key, JSON.stringify(finalRows || []));
        hydrating = false;
    }

    async function scanLocalStorage() {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || key === 'hr_current_company_id') continue;
            const items = parseArray(localStorage.getItem(key));
            if (items) await syncUnknownArray(items);
        }
    }

    async function bootstrap() {
        try {
            const { data: session } = await window.supabaseClient.auth.getSession();
            if (!session?.session?.user) return;
            companyId = await getCompany();
            if (!companyId) return;
            await hydrateEmployees();
            ready = true;
            await scanLocalStorage();
        } catch (error) {
            console.error('Supabase cloud bootstrap failed:', error);
            ready = true;
        }
    }

    async function syncKey(key) {
        if (!ready || hydrating || !key) return;
        const items = parseArray(localStorage.getItem(key));
        if (items) await syncUnknownArray(items);
    }

    Storage.prototype.setItem = function(key, value) {
        originalSetItem.call(this, key, value);
        if (this === localStorage && key) {
            clearTimeout(timers.get(key));
            const timer = setTimeout(() => syncKey(key), 300);
            timers.set(key, timer);
        }
    };
    Storage.prototype.removeItem = function(key) {
        originalRemoveItem.call(this, key);
    };

    window.supabaseEmployeeCloud = {
        getCompanyId: () => companyId,
        syncNow: async () => scanLocalStorage()
    };

    window.supabaseClient.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') setTimeout(bootstrap, 0);
    });
    bootstrap();
})();
