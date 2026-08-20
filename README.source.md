# نظام الموارد البشرية | HR.NISR.SA

نسخة جاهزة للرفع على GitHub ثم النشر على Vercel، مع دعم ربط Supabase.

## ملفات المشروع

- `index.html` — التطبيق كاملًا.
- `supabase_schema.sql` — إنشاء جداول قاعدة البيانات والسياسات الحالية.
- `sample_hr_sheet_saudi.csv` — ملف تجريبي للاستيراد.
- `start.bat` — تشغيل محلي سريع على Windows.
- `vercel.json` — إعدادات بسيطة للنشر على Vercel.
- `.gitignore` — ملفات لا يتم رفعها إلى Git.

## 1) GitHub

أنشئ Repository جديدًا، ثم ارفع الملفات الموجودة في هذا المجلد إلى جذر الـ Repository، بحيث يكون `index.html` في المستوى الرئيسي.

مثال:

```text
hr-nisr/
├── index.html
├── supabase_schema.sql
├── sample_hr_sheet_saudi.csv
├── start.bat
├── vercel.json
└── .gitignore
```

## 2) Vercel

من Vercel اختر **Add New Project** ثم اربط مستودع GitHub.

لا يحتاج المشروع إلى Build Command أو Framework؛ فهو تطبيق HTML/React يعمل من خلال CDN.

بعد النشر ستحصل على رابط مثل:

`https://your-project.vercel.app`

## 3) ربط النطاق hr.nisr.sa

داخل مشروع Vercel:

**Settings → Domains → Add Domain**

أضف:

`hr.nisr.sa`

ثم في DNS الخاص بالنطاق `nisr.sa` أضف سجلًا من النوع **CNAME**:

- Name/Host: `hr`
- Target: القيمة التي يعرضها Vercel للنطاق الفرعي

لا تضع IP من عندك إذا كان Vercel يعرض CNAME؛ استخدم القيمة التي تظهر في لوحة Vercel.

بعد اكتمال DNS سيقوم Vercel بإصدار SSL تلقائيًا، ويصبح الموقع متاحًا عبر:

`https://hr.nisr.sa`

## 4) Supabase

1. أنشئ Project في Supabase.
2. افتح **SQL Editor**.
3. نفّذ محتوى `supabase_schema.sql`.
4. من **Project Settings → API** خذ:
   - Project URL
   - anon/public key
5. داخل الموقع افتح إعدادات قاعدة البيانات وأدخل القيمتين ثم نفّذ فحص الاتصال.
6. استخدم زر المزامنة لحفظ البيانات في Supabase.

### مهم جدًا قبل استخدام بيانات موظفين حقيقية

ملف `supabase_schema.sql` الحالي يحتوي على سياسات RLS تسمح بالوصول العام `anon` إلى الجداول. هذا مناسب للاختبار فقط، وليس مناسبًا لبيانات الموارد البشرية الحقيقية.

قبل الإنتاج يجب إضافة تسجيل دخول Supabase Auth وربط سياسات RLS بالمستخدم/الشركة المصرح لها، ثم إزالة سياسات `anon all` المفتوحة.

لا تضع `service_role` key داخل `index.html` أو GitHub أو Vercel؛ المفتاح المسموح للواجهة هو `anon/public` فقط بعد ضبط RLS بشكل صحيح.

## 5) الطباعة وPDF

تم تجهيز محرك التصدير على أساس A4 ثابت `210 × 297 mm` بدل الاعتماد على أبعاد شاشة الجوال. كما أن وضع الطباعة يستخدم نفس هندسة A4، مع إخفاء عناصر التحكم أثناء الطباعة والحفاظ على الخلفيات والألوان.

لأفضل نتيجة من نافذة طباعة المتصفح اختر:

- Paper: A4
- Orientation: Portrait
- Margins: None / 0
- Background graphics: On
- Scale: 100%

## 6) ملاحظة عن الاعتماد على CDN

التطبيق الحالي يستخدم مكتبات من CDN مثل React وTailwind وSupabase JS وSheetJS وChart.js وhtml2canvas وjsPDF. لذلك يجب أن يكون المتصفح متصلًا بالإنترنت عند تشغيل النسخة المنشورة.
