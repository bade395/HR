(function () {
  const supabase = window.supabaseClient;
  if (!supabase) return;

  const style = document.createElement('style');
  style.textContent = `
    #hr-attendance-fab{position:fixed;bottom:22px;left:22px;z-index:99990;border:0;border-radius:14px;padding:12px 16px;background:#1e3a8a;color:#fff;font-family:Cairo,Tajawal,sans-serif;font-weight:800;box-shadow:0 8px 24px #0002;cursor:pointer}
    #hr-attendance-panel{position:fixed;inset:0;z-index:99991;background:#0007;display:none;align-items:center;justify-content:center;padding:18px;font-family:Cairo,Tajawal,sans-serif}
    #hr-attendance-card{width:min(980px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:18px;padding:22px;box-shadow:0 20px 60px #0004;direction:rtl}
    #hr-attendance-card h2{margin:0 0 14px;color:#1e3a8a} .hr-a-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    #hr-attendance-card input,#hr-attendance-card select,#hr-attendance-card textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:9px;padding:9px;font:inherit}
    .hr-a-actions{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.hr-a-btn{border:0;border-radius:9px;padding:9px 14px;font:inherit;font-weight:800;cursor:pointer}.hr-a-primary{background:#1e3a8a;color:#fff}.hr-a-success{background:#15803d;color:#fff}.hr-a-danger{background:#b91c1c;color:#fff}.hr-a-muted{background:#e2e8f0;color:#0f172a}
    .hr-a-table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}.hr-a-table th,.hr-a-table td{border:1px solid #e2e8f0;padding:7px;text-align:right}.hr-a-table th{background:#deebf9}
    .hr-a-tabs{display:flex;gap:8px;border-bottom:1px solid #e2e8f0;margin-bottom:14px}.hr-a-tab{background:none;border:0;padding:9px 12px;font:inherit;font-weight:800;cursor:pointer}.hr-a-tab.active{color:#1e3a8a;border-bottom:3px solid #1e3a8a}
    @media(max-width:700px){.hr-a-grid{grid-template-columns:1fr}.hr-a-table{font-size:11px}}
  `;
  document.head.appendChild(style);

  const fab=document.createElement('button'); fab.id='hr-attendance-fab'; fab.textContent='🕘 الحضور والانصراف'; document.body.appendChild(fab);
  const panel=document.createElement('div'); panel.id='hr-attendance-panel'; panel.innerHTML=`<div id="hr-attendance-card"><div style="display:flex;justify-content:space-between;align-items:center"><h2>سجل الحضور والانصراف والإجازات</h2><button id="hr-a-close" class="hr-a-btn hr-a-muted">إغلاق</button></div><div class="hr-a-tabs"><button class="hr-a-tab active" data-tab="attendance">الحضور والانصراف</button><button class="hr-a-tab" data-tab="leave">الإجازات</button></div><div id="hr-a-content"></div></div>`; document.body.appendChild(panel);

  let employees=[], companyId=null, tab='attendance';
  const esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  async function init(){
    const {data:{user}}=await supabase.auth.getUser(); if(!user) return;
    const c=await supabase.from('companies').select('id').eq('owner_id',user.id).limit(1).maybeSingle(); companyId=c.data?.id; if(!companyId)return;
    const e=await supabase.from('employees').select('id,emp_code,full_name,job_title').eq('company_id',companyId).order('emp_code'); employees=e.data||[]; render();
  }
  const employeeOptions=()=>employees.map(e=>`<option value="${esc(e.id)}">${esc(e.emp_code)} - ${esc(e.full_name)}</option>`).join('');
  function render(){ document.querySelectorAll('.hr-a-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab)); document.getElementById('hr-a-content').innerHTML=tab==='attendance'?attendanceView():leaveView(); loadRows(); }
  function attendanceView(){return `<div class="hr-a-grid"><label>الموظف<select id="hr-a-emp"><option value="">اختر الموظف</option>${employeeOptions()}</select></label><label>التاريخ<input id="hr-a-date" type="date" value="${new Date().toISOString().slice(0,10)}"></label><label>الحالة<select id="hr-a-status"><option value="present">حاضر</option><option value="late">متأخر</option><option value="absent">غائب</option><option value="leave">إجازة</option><option value="off">عطلة</option></select></label><label>وقت الدخول<input id="hr-a-in" type="datetime-local"></label><label>وقت الخروج<input id="hr-a-out" type="datetime-local"></label><label>ملاحظات<input id="hr-a-notes"></label></div><div class="hr-a-actions"><button class="hr-a-btn hr-a-success" id="hr-a-save">حفظ سجل الحضور</button><button class="hr-a-btn hr-a-primary" id="hr-a-in-now">تسجيل دخول الآن</button><button class="hr-a-btn hr-a-primary" id="hr-a-out-now">تسجيل خروج الآن</button><button class="hr-a-btn hr-a-muted" id="hr-a-refresh">تحديث</button></div><div id="hr-a-table"></div>`}
  function leaveView(){return `<div class="hr-a-grid"><label>الموظف<select id="hr-l-emp"><option value="">اختر الموظف</option>${employeeOptions()}</select></label><label>نوع الإجازة<select id="hr-l-type"><option>سنوية</option><option>مرضية</option><option>اضطرارية</option><option>بدون راتب</option><option>أخرى</option></select></label><label>الحالة<select id="hr-l-status"><option value="pending">قيد المراجعة</option><option value="approved">موافق</option><option value="rejected">مرفوض</option><option value="cancelled">ملغي</option></select></label><label>من<input id="hr-l-start" type="date"></label><label>إلى<input id="hr-l-end" type="date"></label><label>السبب<input id="hr-l-reason"></label></div><div class="hr-a-actions"><button class="hr-a-btn hr-a-success" id="hr-l-save">حفظ طلب الإجازة</button><button class="hr-a-btn hr-a-muted" id="hr-l-refresh">تحديث</button></div><div id="hr-a-table"></div>`}
  async function loadRows(){
    if(!companyId)return; const box=document.getElementById('hr-a-table'); if(!box)return;
    if(tab==='attendance'){const r=await supabase.from('attendance_records').select('id,work_date,check_in,check_out,status,notes,employees(full_name,emp_code)').eq('company_id',companyId).order('work_date',{ascending:false}).limit(100); box.innerHTML=`<table class="hr-a-table"><tr><th>الموظف</th><th>التاريخ</th><th>الدخول</th><th>الخروج</th><th>الحالة</th><th>ملاحظات</th></tr>${(r.data||[]).map(x=>`<tr><td>${esc(x.employees?.full_name)}</td><td>${esc(x.work_date)}</td><td>${esc(x.check_in)}</td><td>${esc(x.check_out)}</td><td>${esc(x.status)}</td><td>${esc(x.notes)}</td></tr>`).join('')}</table>`}
    else {const r=await supabase.from('leave_requests').select('id,leave_type,start_date,end_date,days,reason,status,employees(full_name,emp_code)').eq('company_id',companyId).order('start_date',{ascending:false}).limit(100); box.innerHTML=`<table class="hr-a-table"><tr><th>الموظف</th><th>النوع</th><th>من</th><th>إلى</th><th>الأيام</th><th>الحالة</th><th>السبب</th></tr>${(r.data||[]).map(x=>`<tr><td>${esc(x.employees?.full_name)}</td><td>${esc(x.leave_type)}</td><td>${esc(x.start_date)}</td><td>${esc(x.end_date)}</td><td>${esc(x.days)}</td><td>${esc(x.status)}</td><td>${esc(x.reason)}</td></tr>`).join('')}</table>`}
  }
  function wire(){
    panel.querySelector('#hr-a-close').onclick=()=>panel.style.display='none';
    panel.querySelectorAll('.hr-a-tab').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render()});
    const c=document.getElementById('hr-a-content'); if(tab==='attendance'){
      c.querySelector('#hr-a-in-now').onclick=()=>c.querySelector('#hr-a-in').value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
      c.querySelector('#hr-a-out-now').onclick=()=>c.querySelector('#hr-a-out').value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
      c.querySelector('#hr-a-save').onclick=async()=>{const employee_id=c.querySelector('#hr-a-emp').value;if(!employee_id||!companyId)return alert('اختر الموظف أولاً');const p={company_id:companyId,employee_id,work_date:c.querySelector('#hr-a-date').value,check_in:c.querySelector('#hr-a-in').value?new Date(c.querySelector('#hr-a-in').value).toISOString():null,check_out:c.querySelector('#hr-a-out').value?new Date(c.querySelector('#hr-a-out').value).toISOString():null,status:c.querySelector('#hr-a-status').value,notes:c.querySelector('#hr-a-notes').value||null};const r=await supabase.from('attendance_records').upsert(p,{onConflict:'company_id,employee_id,work_date'});if(r.error)alert(r.error.message);else{alert('تم حفظ سجل الحضور والانصراف');loadRows()}}; c.querySelector('#hr-a-refresh').onclick=loadRows;
    } else {c.querySelector('#hr-l-save').onclick=async()=>{const employee_id=c.querySelector('#hr-l-emp').value,start=c.querySelector('#hr-l-start').value,end=c.querySelector('#hr-l-end').value;if(!employee_id||!start||!end)return alert('أكمل الموظف والتاريخ');const days=Math.round((new Date(end)-new Date(start))/86400000)+1;const p={company_id:companyId,employee_id,leave_type:c.querySelector('#hr-l-type').value,start_date:start,end_date:end,days,reason:c.querySelector('#hr-l-reason').value||null,status:c.querySelector('#hr-l-status').value};const r=await supabase.from('leave_requests').insert(p);if(r.error)alert(r.error.message);else{alert('تم حفظ طلب الإجازة');loadRows()}};c.querySelector('#hr-l-refresh').onclick=loadRows}
  }
  const oldRender=render; render=function(){oldRender();wire()};
  fab.onclick=()=>{panel.style.display='flex';init()}; panel.addEventListener('click',e=>{if(e.target===panel)panel.style.display='none'});
})();
