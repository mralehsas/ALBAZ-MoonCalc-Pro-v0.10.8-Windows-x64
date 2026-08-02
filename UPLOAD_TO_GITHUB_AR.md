# خطوات الرفع إلى GitHub

## 1) إنشاء المستودع

أنشئ مستودعًا جديدًا باسم:

`ALBAZ-MoonCalc-Pro`

ثم اختر **Public** للنشر العام أو **Private** للاحتفاظ به خاصًا.

## 2) رفع ملفات المستودع

ارفع محتويات ملف:

`ALBAZ_MoonCalc_Pro_GitHub_Repository_v0.10.8.zip`

إلى الفرع `main`. لا ترفع مجلدًا إضافيًا فوق الملفات؛ يجب أن يظهر `README.md` مباشرة في الصفحة الرئيسية للمستودع.

## 3) إنشاء Release

- افتح **Releases** ثم **Draft a new release**.
- Tag: `v0.10.8`
- Release title: `ALBAZ MoonCalc Pro v0.10.8 — Windows x64`
- انسخ نص `RELEASE_NOTES_v0.10.8.md` إلى وصف الإصدار.
- أرفق الملف `ALBAZ_MoonCalc_Pro_v0.10.8_Windows_x64.zip`.
- انشر الإصدار.

## 4) التحقق

بعد النشر، نزّل ملف الإصدار مرة أخرى وافحص SHA-256؛ يجب أن يساوي:

`102d3427cb36272e1bb23da39f86805294cee357df95f755279ddaa85872cd5f`

## ملاحظة

GitHub Pages لا يشغّل ملفات Windows التنفيذية. المستودع يعرض معلومات البرنامج، أما تشغيله فيكون بعد تنزيل ملف الإصدار وفك ضغطه على Windows.
