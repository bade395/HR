const SUPABASE_URL = "https://hyorhffbxqksejwfunhv.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_X_c771EZAdhB1t-F7FROlw_7ndeYWp0";

window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

// -----------------------------------------------------------------------------
// Employee cloud persistence
// The current UI still uses localStorage for its React state. This bridge keeps
// that UI intact while making employees persistent in Supabase across devices.
// -----------------------------------------------------------------------------
(function setupEmployeeCloudPersistence() {
    const originalSetItem = Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.removeItem;
    const employeeKeyPattern = /^hr_employees_data(?:_.+)?$/;
    let companyId = null;
    let bootstrapFinished = false;
    let syncTimer = null;
    let hydrating = false;

    const employeeColumns = [
        'emp_code', 'full_name', 'national_id', 'nationality', 'gender',
        'date_of_birth', 'email', 'phone', 'department', 'job_title',
        'profession_in_iqama', 'contract_type', 'qiwa_contract_status',
        'qiwa_contract_id', 'hire_date', 'appointment_date', 'commencement_date',
        'probation_period_days', 'contract_end_date', 'work_status',
        'iqama_expiry_date', 'passport_number', 'passport_expiry_date',
        'work_permit_expiry_date', 'medical_insurance_category',
        'medical_insurance_company', 'medical_insurance_expiry', 'basic_salary',
        'housing_allowance', 'transport_allowance', 'other_allowances',
        'gosi_employee_deduction', 'net_salary', 'bank_name', 'iban', 'notes'
    ];

    const numericColumns = new Set([
        'probation_period_days', 'basic_salary', 'housing_allowance',
        'transport_allowance', 'other_allowances', 'gosi_employee_deduction',
        'net_salary'
    ]);

    const dateColumns = new Set([
        'date_of_birth', 'hire_date', 'appointment_date', 'commencement_date',
        'contract_end_date', 'iqama_expiry_date', 'passport_expiry_date',
        'work_permit_expiry_date', 'medical_insurance_expiry'
    ]);

    function safeJson(value, fallback = []) {
        try {
            const parsed = JSON.parse(value || '');
            return Array.isArray(parsed) ? parsed : fallback;
        } catch (_) {
            return fallback;
        }
    }

    function normalizeForDatabase(employee) {
        const row = { company_id: companyId };
        for (const column of employeeColumns) {
            let value = employee?.[column];
            if (dateColumns.has(column)) {
                value = value ? String(value).slice(0, 10) : null;
            } else if (numericColumns.has(column)) {
                value = value === '' || value == null ? 0 : Number(value);
                if (!Number.isFinite(value)) value = 0;
            }
            row[column] = value === '' || value === undefined ? null : value;
        }
        return row;
    }

    async function ensureCompany() {
        const { data: userData, error: userError } =
            await window.supabaseClient.auth.getUser();
        if (userError || !userData?.user) return null;

        const userId = userData.user.id;
        const { data: existing, error: readError } = await window.supabaseClient
            .from('companies')
            .select('id, name, cr_number')
            .eq('owner_id', userId)
            .limit(1)
            .maybeSingle();

        if (readError) throw readError;
        if (existing?.id) return existing.id;

        const { data: created, error: createError } = await window.supabaseClient
            .from('companies')
            .insert({
                owner_id: userId,
                name: 'شركة النسر الثاقب',
                cr_number: '7054465872'
            })
            .select('id')
            .single();

        if (createError) throw createError;
        return created.id;
    }

    async function readCloudEmployees() {
        if (!companyId) return [];
        const { data, error } = await window.supabaseClient
            .from('employees')
            .select('*')
            .eq('company_id', companyId)
            .order('emp_code', { ascending: true });
        if (error) throw error;
        return data || [];
    }

    async function upsertEmployee(employee) {
        if (!companyId || !employee?.emp_code) return;
        const payload = normalizeForDatabase(employee);

        const { data: existing, error: findError } = await window.supabaseClient
            .from('employees')
            .select('id')
            .eq('company_id', companyId)
            .eq('emp_code', String(employee.emp_code))
            .limit(1)
            .maybeSingle();

        if (findError) throw findError;

        if (existing?.id) {
            const { error } = await window.supabaseClient
                .from('employees')
                .update(payload)
                .eq('id', existing.id);
            if (error) throw error;
        } else {
            const { error } = await window.supabaseClient
                .from('employees')
                .insert(payload);
            if (error) throw error;
        }
    }

    async function syncEmployeesFromLocal(localEmployees) {
        if (!companyId || !Array.isArray(localEmployees)) return;
        for (const employee of localEmployees) {
            if (employee?.emp_code) await upsertEmployee(employee);
        }
    }

    async function hydrateEmployees() {
        if (!companyId) return;
        const key = `hr_employees_data_${companyId}`;
        const cloudEmployees = await readCloudEmployees();
        const localEmployees = safeJson(localStorage.getItem(key));

        // If this device already has local employees and the cloud is empty,
        // preserve them by uploading them first rather than overwriting them.
        if (cloudEmployees.length === 0 && localEmployees.length > 0) {
            await syncEmployeesFromLocal(localEmployees);
        }

        const finalEmployees = await readCloudEmployees();
        hydrating = true;
        originalSetItem.call(localStorage, 'hr_current_company_id', companyId);
        originalSetItem.call(
            localStorage,
            key,
            JSON.stringify(finalEmployees)
        );
        hydrating = false;

        // The React state reads localStorage during initial render. If the
        // company scope/data changed asynchronously, reload once so React starts
        // with the cloud-backed company scope and records.
        if (localStorage.getItem('hr_current_company_id') !== companyId) {
            location.reload();
        }
    }

    async function bootstrap() {
        try {
            const { data: sessionData } =
                await window.supabaseClient.auth.getSession();
            if (!sessionData?.session?.user) return;

            const resolvedCompanyId = await ensureCompany();
            if (!resolvedCompanyId) return;
            companyId = resolvedCompanyId;

            const previousCompanyId = localStorage.getItem('hr_current_company_id');
            await hydrateEmployees();
            bootstrapFinished = true;

            if (previousCompanyId !== companyId) {
                location.reload();
            }
        } catch (error) {
            console.error('Supabase employee bootstrap failed:', error);
            bootstrapFinished = true;
        }
    }

    async function syncFromStorageKey(key) {
        if (!bootstrapFinished || hydrating || !employeeKeyPattern.test(key)) return;
        if (!companyId) return;

        const employees = safeJson(localStorage.getItem(key));
        try {
            await syncEmployeesFromLocal(employees);

            // Reconcile deletions after a deliberate local save. Only rows that
            // belong to the current company are considered.
            const localCodes = new Set(
                employees.map(e => String(e?.emp_code || '')).filter(Boolean)
            );
            const cloud = await readCloudEmployees();
            const idsToDelete = cloud
                .filter(row => row.emp_code && !localCodes.has(String(row.emp_code)))
                .map(row => row.id);

            if (idsToDelete.length) {
                const { error } = await window.supabaseClient
                    .from('employees')
                    .delete()
                    .in('id', idsToDelete);
                if (error) throw error;
            }
        } catch (error) {
            console.error('Supabase employee sync failed:', error);
        }
    }

    Storage.prototype.setItem = function(key, value) {
        originalSetItem.call(this, key, value);
        if (this === localStorage && employeeKeyPattern.test(key)) {
            clearTimeout(syncTimer);
            syncTimer = setTimeout(() => syncFromStorageKey(key), 250);
        }
    };

    // Keep removeItem behavior unchanged; employee deletion is already persisted
    // through the normal React state -> setItem flow.
    Storage.prototype.removeItem = function(key) {
        originalRemoveItem.call(this, key);
    };

    window.supabaseEmployeeCloud = {
        getCompanyId: () => companyId,
        syncNow: async () => {
            const key = companyId ? `hr_employees_data_${companyId}` : null;
            if (key) await syncFromStorageKey(key);
        }
    };

    window.supabaseClient.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            setTimeout(bootstrap, 0);
        }
    });

    bootstrap();
})();
