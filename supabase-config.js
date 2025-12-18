// supabase-config.js
// الان از متغیرهای محیطی استفاده می‌کنه

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// بررسی که کلیدها وجود دارن
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ خطا: کلیدهای Supabase پیدا نشد!');
    console.error('لطفا فایل .env رو بررسی کنید');
}

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.supabaseClient = supabaseClient;
console.log('✅ Supabase client initialized');
