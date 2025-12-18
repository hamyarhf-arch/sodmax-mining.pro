// supabase-service.js - نسخه ساده‌شده
class SODmAXService {
    constructor() {
        this.client = window.supabaseClient;
    }

    async signUp(email, password, fullName, referralCode = '') {
        try {
            console.log('در حال ثبت‌نام...', email);
            
            // 1. ثبت‌نام در سیستم احراز هویت
            const { data: authData, error: authError } = await this.client.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        full_name: fullName
                    }
                }
            });

            if (authError) {
                console.error('خطای احراز هویت:', authError);
                throw new Error(authError.message);
            }

            // 2. تولید کد دعوت
            const referralCodeGenerated = this.generateReferralCode();
            
            // 3. ذخیره اطلاعات کاربر در جدول users
            const { error: userError } = await this.client
                .from('users')
                .insert([
                    {
                        id: authData.user.id,
                        email: email,
                        full_name: fullName,
                        sod_balance: 1000000,
                        usdt_balance: 0,
                        mining_power: 10,
                        user_level: 1,
                        referral_code: referralCodeGenerated,
                        invited_by: referralCode || null,
                        is_admin: email === "hamyarhf@gmail.com"
                    }
                ]);

            if (userError) {
                console.error('خطای ذخیره کاربر:', userError);
                throw new Error(userError.message);
            }

            console.log('✅ کاربر ثبت شد:', authData.user.id);
            
            return {
                success: true,
                user: authData.user,
                message: 'ثبت‌نام موفق بود! ۱ میلیون SOD هدیه گرفتید.'
            };

        } catch (error) {
            console.error('❌ خطا در ثبت‌نام:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async signIn(email, password) {
        try {
            console.log('در حال ورود...', email);
            
            const { data, error } = await this.client.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) throw error;

            console.log('✅ کاربر وارد شد:', data.user.id);
            
            // دریافت اطلاعات کاربر
            const userData = await this.getUserData(data.user.id);
            
            return {
                success: true,
                user: data.user,
                data: userData
            };

        } catch (error) {
            console.error('❌ خطا در ورود:', error);
            return {
                success: false,
                error: 'ایمیل یا رمز عبور اشتباه است'
            };
        }
    }

    async getUserData(userId) {
        try {
            const { data, error } = await this.client
                .from('users')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) throw error;

            return data;

        } catch (error) {
            console.error('خطا در دریافت اطلاعات کاربر:', error);
            return null;
        }
    }

    async saveMiningResult(userId, minedAmount) {
        try {
            // 1. دریافت موجودی فعلی
            const { data: user, error: userError } = await this.client
                .from('users')
                .select('sod_balance, today_earnings, total_mined')
                .eq('id', userId)
                .single();

            if (userError) throw userError;

            // 2. محاسبه مقادیر جدید
            const newBalance = Number(user.sod_balance) + minedAmount;
            const newTodayEarnings = Number(user.today_earnings || 0) + minedAmount;
            const newTotalMined = Number(user.total_mined || 0) + minedAmount;

            // 3. آپدیت کاربر
            const { error: updateError } = await this.client
                .from('users')
                .update({
                    sod_balance: newBalance,
                    today_earnings: newTodayEarnings,
                    total_mined: newTotalMined,
                    last_mining_time: new Date().toISOString()
                })
                .eq('id', userId);

            if (updateError) throw updateError;

            // 4. ثبت تراکنش
            await this.addTransaction(userId, 'mining', minedAmount, `استخراج دستی (+${minedAmount} SOD)`);

            console.log('✅ استخراج ذخیره شد:', minedAmount);
            
            return {
                success: true,
                newBalance: newBalance,
                minedAmount: minedAmount
            };

        } catch (error) {
            console.error('❌ خطا در ذخیره استخراج:', error);
            return { success: false, error: error.message };
        }
    }

    async addTransaction(userId, type, amount, description = '') {
        try {
            const { error } = await this.client
                .from('transactions')
                .insert([
                    {
                        user_id: userId,
                        type: type,
                        amount: amount,
                        description: description,
                        status: 'completed'
                    }
                ]);

            if (error) throw error;

            return { success: true };

        } catch (error) {
            console.error('خطا در ثبت تراکنش:', error);
            return { success: false, error: error.message };
        }
    }

    async getTransactions(userId, limit = 10) {
        try {
            const { data, error } = await this.client
                .from('transactions')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;

            return { success: true, transactions: data };

        } catch (error) {
            console.error('خطا در دریافت تراکنش‌ها:', error);
            return { success: false, error: error.message };
        }
    }

    generateReferralCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 8; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    async signOut() {
        try {
            const { error } = await this.client.auth.signOut();
            if (error) throw error;
            
            console.log('✅ کاربر خارج شد');
            return { success: true };
            
        } catch (error) {
            console.error('خطا در خروج:', error);
            return { success: false, error: error.message };
        }
    }
}

// ایجاد نمونه
const sodmaxService = new SODmAXService();
window.sodmaxService = sodmaxService;
console.log('✅ SODmAX Service initialized');
