const SUPABASE_URL = "https://hyorhffbxqksejwfunhv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_X_c771EZAdhB1t-F7FROlw_7ndeYWp0";

window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// The current single-company build uses a legacy /api/local-auth/logout button,
// while authentication is actually handled by Supabase Auth. Intercept that
// legacy request and perform a real Supabase Auth signOut before the page reloads.
(function installSupabaseLogoutBridge(){
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function(input, init = {}) {
        const url = typeof input === 'string' ? input : (input?.url || '');
        if (url.includes('/api/local-auth/logout')) {
            try {
                const { error } = await window.supabaseClient.auth.signOut({ scope: 'local' });
                if (error) throw error;
            } catch (error) {
                console.error('Supabase logout failed:', error);
                return new Response(JSON.stringify({ error: error?.message || 'تعذر تسجيل الخروج من Supabase Auth' }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        return originalFetch(input, init);
    };
})();

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
    let syncing = false;
    function authAccessToken() { try { for (let i=0;i<localStorage.length;i++) { const key=localStorage.key(i); if(!key||!key.endsWith('-auth-token')) continue; const raw=originalGetItem.call(localStorage,key); if(!raw) continue; const parsed=JSON.parse(raw); if(parsed?.access_token)return parsed.access_token; if(parsed?.currentSession?.access_token)return parsed.currentSession.access_token; } } catch(_){} return null; }
    function requestSync(method,url,body){const token=authAccessToken();if(!token)return{ok:false,data:null};try{const xhr=new XMLHttpRequest();xhr.open(method,url,false);xhr.setRequestHeader('apikey',SUPABASE_PUBLISHABLE_KEY);xhr.setRequestHeader('Authorization',`Bearer ${token}`);xhr.setRequestHeader('Content-Type','application/json');xhr.setRequestHeader('Prefer','return=representation');xhr.send(body==null?null:JSON.stringify(body));let data=null;try{data=xhr.responseText?JSON.parse(xhr.responseText):null}catch(_){}return{ok:xhr.status>=200&&xhr.status<300,status:xhr.status,data};}catch(error){console.warn('Supabase cloud request failed:',error);return{ok:false,data:null};}}
    function getCompanyId(){const user=requestSync('GET',`${SUPABASE_URL}/auth/v1/user`);const userId=user?.data?.id;if(!userId)return null;const result=requestSync('GET',`${SUPABASE_URL}/rest/v1/companies?select=id&owner_id=eq.${encodeURIComponent(userId)}&limit=1`);return result.ok&&result.data?.[0]?.id?result.data[0].id:null;}
    function isUuid(value){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''));}
    const employeeColumns=['emp_code','full_name','national_id','nationality','gender','date_of_birth','email','phone','department','job_title','profession_in_iqama','contract_type','qiwa_contract_status','qiwa_contract_id','hire_date','appointment_date','commencement_date','probation_period_days','contract_end_date','work_status','iqama_expiry_date','passport_number','passport_expiry_date','work_permit_expiry_date','medical_insurance_category','medical_insurance_company','medical_insurance_expiry','basic_salary','housing_allowance','transport_allowance','other_allowances','gosi_employee_deduction','net_salary','bank_name','iban','notes'];
    const disciplinaryColumns=['employee_id','emp_code','employee_name','violation_date','violation_type','violation_degree','action_taken','deduction_amount','details','approved_by'];
    const settlementColumns=['employee_id','employee_name','emp_code','termination_date','reason','salary_due','leave_cash','eosb','deductions','advances','other_due','net_settlement'];
    function payload(item,companyId,columns){const p={company_id:companyId};columns.forEach(c=>{if(Object.prototype.hasOwnProperty.call(item||{},c))p[c]=item[c]===''?null:item[c]});return p;}
    function readTable(table,order='created_at.asc'){const r=requestSync('GET',`${SUPABASE_URL}/rest/v1/${table}?select=*&order=${order}`);return r.ok&&Array.isArray(r.data)?r.data:null;}
    function recordFingerprint(item,type){const fields=type==='disciplinary'?['emp_code','employee_name','violation_date','violation_type','violation_degree','action_taken','deduction_amount','details','approved_by']:['employee_id','employee_name','emp_code','termination_date','reason','salary_due','leave_cash','eosb','deductions','advances','other_due','net_settlement'];return fields.map(f=>String(item?.[f]??'')).join('|');}
    function syncCollection(items,table,type){if(!Array.isArray(items)||syncing)return;const companyId=getCompanyId();if(!companyId)return;syncing=true;try{const columns=type==='disciplinary'?disciplinaryColumns:settlementColumns;const remote=readTable(table)||[];const current=new Set(items.map(x=>recordFingerprint(x,type)));items.forEach(item=>{const p=payload(item,companyId,columns);if(p.deduction_amount!=null)p.deduction_amount=Number(p.deduction_amount)||0;['salary_due','leave_cash','eosb','deductions','advances','other_due','net_settlement'].forEach(c=>{if(p[c]!=null)p[c]=Number(p[c])||0});if(p.id&&isUuid(p.id))requestSync('PATCH',`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(p.id)}`,p);else{const match=remote.find(r=>recordFingerprint(r,type)===recordFingerprint(p,type));if(match)requestSync('PATCH',`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(match.id)}`,p);else requestSync('POST',`${SUPABASE_URL}/rest/v1/${table}`,p);}});if(remote.length)remote.forEach(r=>{if(!current.has(recordFingerprint(r,type)))requestSync('DELETE',`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(r.id)}`);});}finally{syncing=false;}}
    function readEmployees(){const d=readTable('employees','emp_code.asc');if(!d)return null;employeeCodes=new Set(d.map(r=>String(r.emp_code||'')).filter(Boolean));return d;}
    function readDisciplinary(){const d=readTable('disciplinary_actions');if(!d)return null;disciplinaryIds=new Set(d.map(r=>r.id));return d;}
    function readSettlements(){const d=readTable('settlements');if(!d)return null;settlementIds=new Set(d.map(r=>r.id));return d;}
    Storage.prototype.getItem=function(key){const n=String(key);if(this===localStorage){if(employeeKey.test(n)){const d=readEmployees();return d?JSON.stringify(d):null;}if(disciplinaryKey.test(n)){const d=readDisciplinary();return d?JSON.stringify(d):null;}if(settlementKey.test(n)){const d=readSettlements();return d?JSON.stringify(d):null;}if(documentKey.test(n)||legacyHrKey.test(n))return null;}return originalGetItem.call(this,key);};
    Storage.prototype.setItem=function(key,value){const n=String(key);if(this===localStorage){try{const parsed=JSON.parse(value||'[]');if(employeeKey.test(n)&&Array.isArray(parsed)){const c=getCompanyId();if(c){const existing=readEmployees()||[];const current=new Set(parsed.map(x=>String(x.emp_code||'')).filter(Boolean));parsed.forEach(item=>{if(!item?.emp_code)return;const p=payload(item,c,employeeColumns);const old=existing.find(r=>String(r.emp_code)===String(item.emp_code));if(old?.id)requestSync('PATCH',`${SUPABASE_URL}/rest/v1/employees?id=eq.${encodeURIComponent(old.id)}`,p);else requestSync('POST',`${SUPABASE_URL}/rest/v1/employees`,p);});existing.forEach(old=>{if(old.emp_code&&!current.has(String(old.emp_code)))requestSync('DELETE',`${SUPABASE_URL}/rest/v1/employees?emp_code=eq.${encodeURIComponent(old.emp_code)}`);});}return;}if(disciplinaryKey.test(n)&&Array.isArray(parsed)){syncCollection(parsed,'disciplinary_actions','disciplinary');return;}if(settlementKey.test(n)&&Array.isArray(parsed){syncCollection(parsed,'settlements','settlement');return;}}catch(error){console.warn('Cloud persistence parse error:',error);}if(documentKey.test(n)||legacyHrKey.test(n))return;}originalSetItem.call(this,key,value);};
    Storage.prototype.removeItem=function(key){const n=String(key);if(this===localStorage&&(employeeKey.test(n)||disciplinaryKey.test(n)||settlementKey.test(n)||documentKey.test(n)||legacyHrKey.test(n)))return;originalRemoveItem.call(this,key);};
    window.supabaseHRCloud={readEmployees,readDisciplinary,readSettlements,syncDisciplinary:items=>syncCollection(items,'disciplinary_actions','disciplinary'),syncSettlements:items=>syncCollection(items,'settlements','settlement'),getCompanyId};
})();

// Load the electronic attendance/leave module after the shared Supabase client is ready.
(function loadAttendanceModule(){const s=document.createElement('script');s.src='/attendance.js';s.defer=true;document.head.appendChild(s);})();
