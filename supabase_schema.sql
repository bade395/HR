-- ==============================================================================
-- نظام الموارد البشرية السعودي المتكامل (Saudi HR Management System)
-- متوافق مع أنظمة العمل في المملكة: قوى، مدد (حماية الأجور)، التأمينات الاجتماعية (GOSI)، ومقيم
-- يشمل: سجل الموظفين، مسيرات الرواتب، لائحة الجزاءات، والتصفية المالية وإنهاء العقود
-- ==============================================================================

-- 1. جدول الأقسام والإدارات (Departments)
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(20),
    manager_name VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- إدراج أقسام افتراضية
INSERT INTO departments (name, code) VALUES
('الموارد البشرية والشؤون الإدارية', 'HR'),
('تقنية المعلومات والتحول الرقمي', 'IT'),
('الإدارة المالية والمحاسبة', 'FIN'),
('المبيعات والتسويق', 'SALES'),
('العمليات والتشغيل', 'OPS'),
('الشؤون القانونية والامتثال', 'LEGAL')
ON CONFLICT (name) DO NOTHING;

-- 2. جدول الموظفين المتوافق مع متطلبات سوق العمل السعودي (Employees)
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    emp_code VARCHAR(50) NOT NULL UNIQUE, -- الرقم الوظيفي (مثل 001)
    full_name VARCHAR(150) NOT NULL, -- اسم الموظف الكامل
    national_id VARCHAR(20) NOT NULL UNIQUE, -- رقم الهوية الوطنية للسعوديين (10 أرقام) أو رقم الإقامة للمقيمين
    nationality VARCHAR(50) NOT NULL DEFAULT 'سعودي', -- الجنسية
    is_saudi BOOLEAN GENERATED ALWAYS AS (nationality = 'سعودي') STORED, -- مؤشر التوطين (نطاقات)
    gender VARCHAR(10) DEFAULT 'ذكر', -- الجنس (ذكر / أنثى)
    date_of_birth DATE, -- تاريخ الميلاد
    email VARCHAR(100), -- البريد الإلكتروني
    phone VARCHAR(20), -- رقم الجوال (مثل 05XXXXXXXX)
    
    -- البيانات الوظيفية ومنصة قوى (Qiwa)
    department VARCHAR(100), -- القسم / الإدارة
    job_title VARCHAR(100) NOT NULL, -- المسمى الوظيفي
    profession_in_iqama VARCHAR(100), -- المهنة في الإقامة / الهوية
    contract_type VARCHAR(50) DEFAULT 'محدد المدة', -- نوع العقد (محدد المدة، غير محدد المدة، عمل مرن، عن بعد)
    qiwa_contract_status VARCHAR(50) DEFAULT 'موثق ومقبول', -- حالة العقد في منصة قوى
    qiwa_contract_id VARCHAR(50), -- رقم توثيق العقد في قوى
    hire_date DATE NOT NULL, -- تاريخ التعيين / المباشرة
    probation_period_days INT DEFAULT 90, -- فترة التجربة (90 أو 180 يوم)
    contract_end_date DATE, -- تاريخ نهاية العقد
    work_status VARCHAR(30) DEFAULT 'نشط', -- الحالة (نشط، في إجازة، فترة تجربة، منتهي عقده)
    
    -- منصة مقيم والوثائق الرسمية (Muqeem & Documents)
    iqama_expiry_date DATE, -- تاريخ انتهاء الإقامة
    passport_number VARCHAR(50), -- رقم جواز السفر
    passport_expiry_date DATE, -- تاريخ انتهاء الجواز
    work_permit_expiry_date DATE, -- تاريخ انتهاء رخصة العمل
    
    -- التأمين الطبي (CCHI)
    medical_insurance_category VARCHAR(30) DEFAULT 'Class A', -- فئة التأمين (VIP, Class A, Class B, Class C)
    medical_insurance_company VARCHAR(100), -- شركة التأمين (بوبا، التعاونية، إلخ)
    medical_insurance_expiry DATE, -- تاريخ انتهاء التأمين
    
    -- البيانات المالية ونظام حماية الأجور ومنصة مدد (Mudad & WPS)
    basic_salary DECIMAL(12, 2) NOT NULL DEFAULT 0.00, -- الراتب الأساسي
    housing_allowance DECIMAL(12, 2) NOT NULL DEFAULT 0.00, -- بدل السكن
    transport_allowance DECIMAL(12, 2) NOT NULL DEFAULT 0.00, -- بدل النقل
    other_allowances DECIMAL(12, 2) NOT NULL DEFAULT 0.00, -- بدلات أخرى
    gross_salary DECIMAL(12, 2) GENERATED ALWAYS AS (basic_salary + housing_allowance + transport_allowance + other_allowances) STORED, -- إجمالي الراتب
    
    -- حساب استقطاع التأمينات الاجتماعية (GOSI)
    gosi_employee_deduction DECIMAL(12, 2) DEFAULT 0.00, -- استقطاع التأمينات
    net_salary DECIMAL(12, 2) DEFAULT 0.00, -- صافي الراتب المستحق
    
    -- البيانات البنكية (حماية الأجور WPS)
    bank_name VARCHAR(100), -- اسم البنك (الراجحي، الأهلي، الإنماء، الرياض، إلخ)
    iban VARCHAR(34), -- رقم الآيبان (يبدأ بـ SA)
    
    notes TEXT, -- ملاحظات إضافية
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. جدول مسيرات الرواتب الشهرية (Payroll Records)
CREATE TABLE IF NOT EXISTS payroll_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    month_year VARCHAR(7) NOT NULL, -- مثل 2026-08
    basic_salary DECIMAL(12, 2) NOT NULL,
    housing_allowance DECIMAL(12, 2) NOT NULL,
    transport_allowance DECIMAL(12, 2) NOT NULL,
    other_allowances DECIMAL(12, 2) NOT NULL,
    overtime_amount DECIMAL(12, 2) DEFAULT 0.00,
    deductions DECIMAL(12, 2) DEFAULT 0.00,
    gosi_deduction DECIMAL(12, 2) NOT NULL,
    net_salary DECIMAL(12, 2) NOT NULL,
    payment_status VARCHAR(30) DEFAULT 'بانتظار الصرف',
    wps_file_generated BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. جدول لائحة الجزاءات والعقوبات والمخالفات (Disciplinary Actions)
CREATE TABLE IF NOT EXISTS disciplinary_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    emp_code VARCHAR(50) NOT NULL,
    employee_name VARCHAR(150) NOT NULL,
    violation_date DATE NOT NULL,
    violation_type VARCHAR(100) NOT NULL, -- نوع المخالفة (تأخر، غياب بدون إذن، إهمال في العمل، مخالفة تعليمات السلامة، عدم الانضباط)
    violation_degree VARCHAR(50) DEFAULT 'المرة الأولى', -- درجة المخالفة (المرة الأولى، الثانية، الثالثة، الرابعة)
    action_taken VARCHAR(100) NOT NULL, -- الجزاء الموقع (إنذار كتابي ولفت نظر، حسم يوم، حسم يومين، حسم 3 أيام، إيقاف عن العمل، فصل بموجب م 80)
    deduction_amount DECIMAL(12, 2) DEFAULT 0.00, -- المبلغ المخصوم من الراتب (ر.س)
    details TEXT, -- تفاصيل ومسببات المخالفة
    approved_by VARCHAR(100), -- المدير أو المسؤول المعتمد
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. جدول إنهاء العقود والتصفية المالية والمخالصة النهائية (Settlements)
CREATE TABLE IF NOT EXISTS settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    emp_code VARCHAR(50) NOT NULL,
    employee_name VARCHAR(150) NOT NULL,
    termination_date DATE NOT NULL,
    reason VARCHAR(100) NOT NULL, -- سبب الإنهاء (انتهاء العقد، استقالة م 85، إنهاء م 77، إنهاء م 80، اتفاق الطرفين، تقاعد)
    service_years INT DEFAULT 0, -- سنوات الخدمة
    service_months INT DEFAULT 0, -- شهور الخدمة
    service_days INT DEFAULT 0, -- أيام الخدمة
    salary_due DECIMAL(12, 2) DEFAULT 0.00, -- أجر أيام العمل الأخيرة
    leave_balance_cash DECIMAL(12, 2) DEFAULT 0.00, -- بدل رصيد الإجازات
    eosb_amount DECIMAL(12, 2) DEFAULT 0.00, -- مكافأة نهاية الخدمة
    deductions_due DECIMAL(12, 2) DEFAULT 0.00, -- خصومات أو سلف مستردة
    net_settlement DECIMAL(12, 2) NOT NULL, -- صافي المستحق النهائي للصرف
    clearance_status VARCHAR(50) DEFAULT 'تمت المخالصة وإبراء الذمة',
    payment_method VARCHAR(50) DEFAULT 'تحويل بنكي',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. تفعيل Row Level Security (RLS)
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE disciplinary_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon all on departments" ON departments FOR ALL USING (true);
CREATE POLICY "Allow anon all on employees" ON employees FOR ALL USING (true);
CREATE POLICY "Allow anon all on payroll_records" ON payroll_records FOR ALL USING (true);
CREATE POLICY "Allow anon all on disciplinary_actions" ON disciplinary_actions FOR ALL USING (true);
CREATE POLICY "Allow anon all on settlements" ON settlements FOR ALL USING (true);

-- 7. بيانات تجريبية أولية للجزاءات والتصفيات
INSERT INTO disciplinary_actions (emp_code, employee_name, violation_date, violation_type, violation_degree, action_taken, deduction_amount, details, approved_by)
VALUES 
('002', 'محمد إبراهيم الشناوي', '2026-07-10', 'تأخر متكرر عن مواعيد العمل الرسمية', 'المرة الأولى', 'إنذار كتابي ولفت نظر', 0.00, 'التأخر عن مواعيد العمل الصباحية لأكثر من 3 مرات خلال الشهر', 'أحمد بن عبد الله السعيد'),
('004', 'راجيش كومار باتيل', '2026-08-01', 'غياب بدون إذن مسبق أو عذر مقبول', 'المرة الأولى', 'حسم أجر يوم واحد', 150.00, 'الغياب عن وردية العمل ليوم الأحد بدون إشعار المشرف المباشر', 'أحمد بن عبد الله السعيد')
ON CONFLICT DO NOTHING;
