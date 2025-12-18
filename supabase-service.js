// supabase-service.js
// سرویس‌های ارتباط با دیتابیس SODmAX

class SODmAXService {
    constructor() {
        this.client = window.supabaseClient;
        this.currentUser = null;
    }

    // ==================== مدیریت کاربران ====================

    // ثبت‌نام کاربر جدید
    async signUp(email, password, fullName, referralCode = '') {
        try {
            // 1. ثبت‌نام در Authentication
            const { data: authData, error: authError } = await this.client.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        full_name: fullName,
                        referral_code: referralCode
                    }
                }
            });

            if (authError) throw authError;

            // 2. ذخیره اطلاعات اضافی در جدول users
            const { error: profileError } = await this.client
                .from('users')
                .insert([
                    {
                        id: authData.user.id,
                        email: email,
                        full_name: fullName,
                        sod_balance: 1000000, // هدیه ثبت نام
                        usdt_balance: 0,
                        mining_power: 10,
                        user_level: 1,
                        referral_code: this.generateReferralCode(),
                        invited_by: referralCode || null
                    }
                ]);

            if (profileError) throw profileError;

            // 3. ایجاد رکورد اولیه در progress
            await this.initializeUserProgress(authData.user.id);

            return {
                success: true,
                user: authData.user,
                message: 'ثبت‌نام موفقیت‌آمیز بود'
            };

        } catch (error) {
            console.error('SignUp Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ورود کاربر
    async signIn(email, password) {
        try {
            const { data, error } = await this.client.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) throw error;

            this.currentUser = data.user;
            
            // بارگذاری اطلاعات کاربر از دیتابیس
            const userData = await this.getUserData(data.user.id);
            
            return {
                success: true,
                user: data.user,
                data: userData
            };

        } catch (error) {
            console.error('SignIn Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // دریافت اطلاعات کاربر
    async getUserData(userId) {
        try {
            const { data, error } = await this.client
                .from('users')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) throw error;

            // دریافت اطلاعات progress
            const progress = await this.getUserProgress(userId);

            return {
                ...data,
                progress: progress
            };

        } catch (error) {
            console.error('GetUserData Error:', error);
            return null;
        }
    }

    // خروج کاربر
    async signOut() {
        try {
            const { error } = await this.client.auth.signOut();
            if (error) throw error;
            
            this.currentUser = null;
            return { success: true };
            
        } catch (error) {
            console.error('SignOut Error:', error);
            return { success: false, error: error.message };
        }
    }

    // ==================== سیستم استخراج ====================

    // ذخیره نتیجه استخراج
    async saveMiningResult(userId, minedAmount) {
        try {
            // 1. آپدیت موجودی کاربر
            const { data: user, error: userError } = await this.client
                .from('users')
                .select('sod_balance, today_earnings')
                .eq('id', userId)
                .single();

            if (userError) throw userError;

            const newBalance = user.sod_balance + minedAmount;
            const newTodayEarnings = user.today_earnings + minedAmount;

            // 2. آپدیت موجودی
            const { error: updateError } = await this.client
                .from('users')
                .update({
                    sod_balance: newBalance,
                    today_earnings: newTodayEarnings,
                    total_mined: user.total_mined + minedAmount,
                    last_mining_time: new Date().toISOString()
                })
                .eq('id', userId);

            if (updateError) throw updateError;

            // 3. ذخیره تراکنش
            await this.addTransaction(userId, 'mining', minedAmount, `استخراج دستی (+${minedAmount} SOD)`);

            // 4. آپدیت progress
            await this.updateUSDTProgress(userId, minedAmount);

            return {
                success: true,
                newBalance: newBalance,
                minedAmount: minedAmount
            };

        } catch (error) {
            console.error('SaveMiningResult Error:', error);
            return { success: false, error: error.message };
        }
    }

    // دریافت آمار استخراج امروز
    async getTodayStats(userId) {
        try {
            const { data, error } = await this.client
                .from('mining_sessions')
                .select('sum(amount)')
                .eq('user_id', userId)
                .gte('created_at', new Date().toISOString().split('T')[0])
                .single();

            return {
                success: true,
                todayEarnings: data ? data.sum : 0
            };

        } catch (error) {
            console.error('GetTodayStats Error:', error);
            return { success: false, error: error.message };
        }
    }

    // ==================== سیستم پاداش USDT ====================

    // آپدیت progress پاداش USDT
    async updateUSDTProgress(userId, minedAmount) {
        try {
            const { data: progress, error } = await this.client
                .from('user_progress')
                .select('usdt_progress')
                .eq('user_id', userId)
                .single();

            if (error && error.code === 'PGRST116') {
                // اگر رکورد وجود نداشت، ایجاد کن
                const { error: insertError } = await this.client
                    .from('user_progress')
                    .insert([{
                        user_id: userId,
                        usdt_progress: minedAmount
                    }]);

                if (insertError) throw insertError;
                return { success: true, newProgress: minedAmount };
            }

            const newProgress = progress.usdt_progress + minedAmount;
            
            // اگر به 10 میلیون رسید
            if (newProgress >= 10000000) {
                const usdtEarned = 0.01;
                
                // اضافه کردن USDT به موجودی
                await this.addUSDTBalance(userId, usdtEarned);
                
                // ریست کردن progress
                const { error: updateError } = await this.client
                    .from('user_progress')
                    .update({ usdt_progress: newProgress - 10000000 })
                    .eq('user_id', userId);

                if (updateError) throw updateError;

                return {
                    success: true,
                    usdtEarned: usdtEarned,
                    newProgress: newProgress - 10000000
                };
            } else {
                // فقط آپدیت progress
                const { error: updateError } = await this.client
                    .from('user_progress')
                    .update({ usdt_progress: newProgress })
                    .eq('user_id', userId);

                if (updateError) throw updateError;

                return { success: true, newProgress: newProgress };
            }

        } catch (error) {
            console.error('UpdateUSDTProgress Error:', error);
            return { success: false, error: error.message };
        }
    }

    // اضافه کردن USDT به موجودی
    async addUSDTBalance(userId, amount) {
        try {
            // دریافت موجودی فعلی
            const { data: user, error: fetchError } = await this.client
                .from('users')
                .select('usdt_balance')
                .eq('id', userId)
                .single();

            if (fetchError) throw fetchError;

            const newBalance = user.usdt_balance + amount;

            // آپدیت موجودی
            const { error: updateError } = await this.client
                .from('users')
                .update({ usdt_balance: newBalance })
                .eq('id', userId);

            if (updateError) throw updateError;

            // ثبت تراکنش
            await this.addTransaction(userId, 'reward', amount, `پاداش USDT (+${amount} USDT)`);

            return { success: true, newBalance: newBalance };

        } catch (error) {
            console.error('AddUSDTBalance Error:', error);
            return { success: false, error: error.message };
        }
    }

    // دریافت پاداش USDT
    async claimUSDT(userId, amount) {
        try {
            // بررسی موجودی SOD کافی
            const { data: user, error: userError } = await this.client
                .from('users')
                .select('sod_balance, usdt_balance')
                .eq('id', userId)
                .single();

            if (userError) throw userError;

            const sodNeeded = amount * 1000000000; // تبدیل USDT به SOD

            if (user.sod_balance < sodNeeded) {
                throw new Error(`موجودی SOD کافی نیست. نیاز: ${sodNeeded} SOD`);
            }

            // انجام تراکنش
            const { error: transactionError } = await this.client.rpc('claim_usdt', {
                p_user_id: userId,
                p_usdt_amount: amount,
                p_sod_amount: sodNeeded
            });

            if (transactionError) throw transactionError;

            return {
                success: true,
                claimedAmount: amount,
                message: `${amount} USDT دریافت شد`
            };

        } catch (error) {
            console.error('ClaimUSDT Error:', error);
            return { success: false, error: error.message };
        }
    }

    // ==================== تراکنش‌ها ====================

    // اضافه کردن تراکنش جدید
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
            console.error('AddTransaction Error:', error);
            return { success: false, error: error.message };
        }
    }

    // دریافت تاریخچه تراکنش‌های کاربر
    async getTransactions(userId, limit = 20) {
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
            console.error('GetTransactions Error:', error);
            return { success: false, error: error.message };
        }
    }

    // ==================== کمکی‌ها ====================

    // تولید کد دعوت تصادفی
    generateReferralCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 8; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    // مقداردهی اولیه progress کاربر
    async initializeUserProgress(userId) {
        try {
            const { error } = await this.client
                .from('user_progress')
                .insert([
                    {
                        user_id: userId,
                        usdt_progress: 1000000, // هدیه اولیه
                        last_claim_time: null,
                        boost_expiry: null
                    }
                ]);

            if (error) throw error;

            return { success: true };

        } catch (error) {
            console.error('InitializeUserProgress Error:', error);
            return { success: false, error: error.message };
        }
    }

    // دریافت progress کاربر
    async getUserProgress(userId) {
        try {
            const { data, error } = await this.client
                .from('user_progress')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (error) throw error;

            return data;

        } catch (error) {
            console.error('GetUserProgress Error:', error);
            return null;
        }
    }

    // ==================== ادمین ====================

    // دریافت همه کاربران (فقط ادمین)
    async getAllUsers(adminId) {
        try {
            // بررسی ادمین بودن
            const { data: admin } = await this.client
                .from('users')
                .select('is_admin')
                .eq('id', adminId)
                .single();

            if (!admin || !admin.is_admin) {
                throw new Error('دسترسی غیرمجاز');
            }

            const { data, error } = await this.client
                .from('users')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            return { success: true, users: data };

        } catch (error) {
            console.error('GetAllUsers Error:', error);
            return { success: false, error: error.message };
        }
    }

    // دریافت آمار کلی سیستم
    async getSystemStats() {
        try {
            // تعداد کاربران
            const { count: userCount } = await this.client
                .from('users')
                .select('*', { count: 'exact', head: true });

            // مجموع SOD استخراج شده
            const { data: miningStats } = await this.client
                .from('users')
                .select('total_mined');

            const totalMined = miningStats.reduce((sum, user) => sum + (user.total_mined || 0), 0);

            // مجموع USDT توزیع شده
            const { data: rewardStats } = await this.client
                .from('transactions')
                .select('amount')
                .eq('type', 'reward');

            const totalRewards = rewardStats.reduce((sum, tx) => sum + tx.amount, 0);

            return {
                success: true,
                stats: {
                    totalUsers: userCount,
                    totalMined: totalMined,
                    totalRewards: totalRewards,
                    activeToday: 0 // بعداً پیاده‌سازی می‌شود
                }
            };

        } catch (error) {
            console.error('GetSystemStats Error:', error);
            return { success: false, error: error.message };
        }
    }
}

// ایجاد نمونه از سرویس
const sodmaxService = new SODmAXService();
window.sodmaxService = sodmaxService;

console.log('✅ SODmAX Service initialized');
