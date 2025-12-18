// supabase-config.js
// تنظیمات اتصال به Supabase

const SUPABASE_URL = "https://enecyqmrpobmdixqtocn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVuZWN5cW1ycG9ibWRpeHF0b2NuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjg4MDQsImV4cCI6MjA4MTY0NDgwNH0.3zXTwFxmkPlIwy8w1Ocoxu9f7qGKkxiaFpb7o-CKo_A";

// ایجاد کلاینت Supabase
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// برای دسترسی در کل پروژه
window.supabaseClient = supabaseClient;

console.log('✅ Supabase client initialized');
