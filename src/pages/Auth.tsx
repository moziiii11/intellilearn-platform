import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { useUser } from '../UserContext';
import { Bot, Lock, User as UserIcon, ArrowRight, Eye, EyeOff, Smartphone, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);

  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotPhone, setForgotPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  const { setIsLoggedIn, setUserName, setRole } = useUser();
  const navigate = useNavigate();

  // 验证手机号是否为11位数字
  const validatePhone = (value: string): boolean => {
    if (!/^\d{11}$/.test(value)) {
      setPhoneError('手机号必须为11位数字');
      return false;
    }
    setPhoneError('');
    return true;
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      if (isLogin) {
        const res = await fetch("/api/auth/login", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: name, password })
        });
        const data = await res.json();
        if (data.success) {
          setUserName(data.username);
          setIsLoggedIn(true);
          localStorage.setItem('token', data.token);
          localStorage.setItem('currentUser', data.username);
          const userRole = data.role || 'user';
          setRole(userRole);
          localStorage.setItem('role', userRole);
          navigate('/');
        } else {
          setErrorMsg(data.message || '用户名或密码错误');
        }
      } else {
        // 注册时校验手机号
        if (!validatePhone(phone)) return;
        // 密码最少8位
        if (password.length < 8) {
          setErrorMsg('密码长度不能少于8位');
          return;
        }
        const res = await fetch("/api/auth/register", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: name, password, phone })
        });
        const data = await res.json();
        if (data.success) {
          setShowSuccessToast(true);
        } else {
          setErrorMsg(data.message || '注册失败');
        }
      }
    } catch (e: any) {
      setErrorMsg('网络请求失败');
    }
  };

  const handleForgotStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!forgotUsername || !forgotPhone) return;
    setForgotStep(2);
  };

  const handleForgotStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: forgotUsername, phone: forgotPhone, newPassword })
      });
      const data = await res.json();
      if (data.success) {
        setIsForgotPassword(false);
        setIsLogin(true);
        setPassword('');
        setForgotPhone('');
        setForgotStep(1);
      } else {
        setErrorMsg(data.message || '密码重置失败，验证信息错误');
      }
    } catch (e: any) {
      setErrorMsg('网络请求失败');
    }
  };

  const resetState = () => {
    setErrorMsg('');
    setName('');
    setPassword('');
    setPhone('');
    setForgotUsername('');
    setForgotPhone('');
    setNewPassword('');
    setForgotStep(1);
    setShowPassword(false);
  };

  // Render Forgot Password Flow
  if (isForgotPassword) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#eff6ff] to-white flex flex-col font-sans relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-32 -mt-32 w-[600px] h-[600px] bg-blue-400/5 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '8s' }}></div>
        <div className="absolute bottom-0 left-0 -ml-32 -mb-32 w-[600px] h-[600px] bg-indigo-400/5 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }}></div>

        <div className="flex-1 flex items-center justify-center p-6 relative z-10">
          <div className="w-full max-w-md">
            <div className="flex flex-col items-center justify-center mb-10">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-[1.25rem] flex items-center justify-center shadow-lg shadow-blue-500/25 transform -rotate-3 hover:rotate-0 transition-transform duration-500">
                <Lock className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-[2rem] font-black text-slate-800 tracking-tight mt-5">找回密码</h1>
              <p className="text-slate-400 font-medium text-[13px] tracking-widest mt-2">
                {forgotStep === 1 && '请输入您的用户名和手机号'}
                {forgotStep === 2 && '请设置新密码'}
              </p>
            </div>

            <div className="bg-white/80 backdrop-blur-2xl rounded-3xl shadow-[0_8px_40px_rgb(0,0,0,0.04)] border border-slate-100 p-8 sm:p-10 transition-shadow duration-500 hover:shadow-[0_12px_50px_rgb(0,0,0,0.06)] relative overflow-hidden">
              {errorMsg && (
                <div className="mb-6 p-3 bg-red-50/80 border border-red-100 rounded-xl flex items-center gap-2 text-red-600 text-sm font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {errorMsg}
                </div>
              )}
              
              {forgotStep === 1 && (
                <form onSubmit={handleForgotStep1} className="space-y-6 relative z-10">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2 ml-1">用户名</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-blue-500/70 group-focus-within:text-blue-600 transition-colors">
                        <UserIcon className="w-[1.125rem] h-[1.125rem]" />
                      </div>
                      <input
                        type="text"
                        required
                        value={forgotUsername}
                        onChange={(e) => setForgotUsername(e.target.value)}
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50/50 border border-slate-200 hover:border-slate-300 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 text-[15px] font-medium text-slate-700"
                        placeholder="请输入用户名"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2 ml-1">手机号</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-blue-500/70 group-focus-within:text-blue-600 transition-colors">
                        <Smartphone className="w-[1.125rem] h-[1.125rem]" />
                      </div>
                      <input
                        type="tel"
                        required
                        value={forgotPhone}
                        onChange={(e) => setForgotPhone(e.target.value)}
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50/50 border border-slate-200 hover:border-slate-300 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 text-[15px] font-medium text-slate-700"
                        placeholder="请输入手机号"
                      />
                    </div>
                  </div>
                  <div className="pt-2">
                    <button type="submit" className="group w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-2xl font-bold text-[15px] shadow-[0_4px_20px_0_rgba(59,130,246,0.3)] hover:shadow-[0_8px_25px_rgba(59,130,246,0.4)] hover:scale-[1.02] transition-all duration-300 outline-none focus:ring-4 focus:ring-blue-500/30">
                      下一步验证
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
                    </button>
                  </div>
                </form>
              )}

              {forgotStep === 2 && (
                <form onSubmit={handleForgotStep2} className="space-y-6 relative z-10">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2 ml-1">新密码</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-blue-500/70 group-focus-within:text-blue-600 transition-colors">
                        <Lock className="w-[1.125rem] h-[1.125rem]" />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full pl-11 pr-12 py-3.5 bg-slate-50/50 border border-slate-200 hover:border-slate-300 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 text-[15px] font-medium text-slate-700"
                        placeholder="请输入新密码"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-blue-500 transition-colors focus:outline-none"
                      >
                        {showPassword ? <EyeOff className="w-[1.125rem] h-[1.125rem]" /> : <Eye className="w-[1.125rem] h-[1.125rem]" />}
                      </button>
                    </div>
                    {newPassword.length > 0 && <PasswordStrength password={newPassword} />}
                  </div>
                  <div className="pt-2">
                    <button type="submit" className="group w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-2xl font-bold text-[15px] shadow-[0_4px_20px_0_rgba(59,130,246,0.3)] hover:shadow-[0_8px_25px_rgba(59,130,246,0.4)] hover:scale-[1.02] transition-all duration-300 outline-none focus:ring-4 focus:ring-blue-500/30">
                      重置密码并登录
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
                    </button>
                  </div>
                </form>
              )}
            </div>

            <p className="mt-10 text-center text-[13px] text-slate-500 font-medium">
              想起密码了？{' '}
              <button onClick={() => { setIsForgotPassword(false); resetState(); }} className="text-blue-600 hover:text-blue-700 font-bold hover:underline transition-all">
                返回登录
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eff6ff] to-white flex flex-col font-sans relative overflow-hidden">
      {/* Background breathing decoration */}
      <div className="absolute top-0 right-0 -mr-32 -mt-32 w-[600px] h-[600px] bg-blue-400/5 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '8s' }}></div>
      <div className="absolute bottom-0 left-0 -ml-32 -mb-32 w-[600px] h-[600px] bg-indigo-400/5 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }}></div>

      <div className="flex-1 flex items-center justify-center p-6 relative z-10 w-full overflow-y-auto">
        <div className="w-full max-w-md my-auto">
          {/* Logo */}
          <div className="flex flex-col items-center justify-center mb-10">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-[1.25rem] flex items-center justify-center shadow-lg shadow-blue-500/25 transform -rotate-3 hover:rotate-0 transition-transform duration-500">
              <Bot className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-[2rem] font-black text-slate-800 tracking-tight mt-5">AI 问答助手</h1>
            <p className="text-slate-400 font-medium text-[13px] tracking-widest mt-2">
              {isLogin ? '欢迎回来，请登录您的账号' : '创建您的账号，开始探索之旅'}
            </p>
          </div>

          {/* Form Card */}
          <div className="bg-white/80 backdrop-blur-2xl rounded-3xl shadow-[0_8px_40px_rgb(0,0,0,0.04)] border border-slate-100 p-8 sm:p-10 transition-shadow duration-500 hover:shadow-[0_12px_50px_rgb(0,0,0,0.06)] relative overflow-hidden">
            {errorMsg && (
              <div className="mb-6 p-3 bg-red-50/80 border border-red-100 rounded-xl flex items-center gap-2 text-red-600 text-sm font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {errorMsg}
              </div>
            )}
            
            <form onSubmit={handleLoginSubmit} className="space-y-6 relative z-10">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 ml-1">用户名</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-blue-500/70 group-focus-within:text-blue-600 transition-colors">
                    <UserIcon className="w-[1.125rem] h-[1.125rem]" />
                  </div>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-11 pr-4 py-3.5 bg-slate-50/50 border border-slate-200 hover:border-slate-300 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 text-[15px] font-medium text-slate-700"
                    placeholder={isLogin ? "请输入用户名" : "请输入您的用户名 / 昵称"}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2 ml-1 pr-1">
                  <label className="block text-sm font-bold text-slate-700">密码</label>
                  {isLogin && (
                    <button type="button" onClick={() => { setIsForgotPassword(true); resetState(); }} className="text-sm font-semibold text-blue-500 hover:text-blue-600 transition-colors focus:outline-none">忘记密码?</button>
                  )}
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-blue-500/70 group-focus-within:text-blue-600 transition-colors">
                    <Lock className="w-[1.125rem] h-[1.125rem]" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-11 pr-12 py-3.5 bg-slate-50/50 border border-slate-200 hover:border-slate-300 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 text-[15px] font-medium text-slate-700"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-blue-500 transition-colors focus:outline-none"
                    aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  >
                    {showPassword ? (
                      <EyeOff className="w-[1.125rem] h-[1.125rem]" />
                    ) : (
                      <Eye className="w-[1.125rem] h-[1.125rem]" />
                    )}
                  </button>
                </div>
              </div>

              {/* 密码强度提示 — 仅注册时显示 */}
              {!isLogin && password.length > 0 && (
                <PasswordStrength password={password} />
              )}

              {/* Phone Field during Registration */}
              {!isLogin && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2 ml-1">手机号</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-blue-500/70 group-focus-within:text-blue-600 transition-colors">
                      <Smartphone className="w-[1.125rem] h-[1.125rem]" />
                    </div>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        if (phoneError) validatePhone(e.target.value);
                      }}
                      className={`w-full pl-11 pr-4 py-3.5 bg-slate-50/50 border rounded-2xl focus:ring-4 focus:ring-blue-100 focus:bg-white outline-none transition-all placeholder:text-slate-400 text-[15px] font-medium text-slate-700 ${phoneError ? 'border-red-300 focus:border-red-500 focus:ring-red-100' : 'border-slate-200 hover:border-slate-300 focus:border-blue-500'}`}
                      placeholder="请输入手机号"
                    />
                  </div>
                  {phoneError && (
                    <p className="mt-1.5 ml-1 text-[12px] text-red-500 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {phoneError}
                    </p>
                  )}
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  className="group w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-2xl font-bold text-[15px] shadow-[0_4px_20px_0_rgba(59,130,246,0.3)] hover:shadow-[0_8px_25px_rgba(59,130,246,0.4)] hover:scale-[1.02] transition-all duration-300 outline-none focus:ring-4 focus:ring-blue-500/30"
                >
                  {isLogin ? '立即登录' : '注册账号'}
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
                </button>
              </div>
            </form>
          </div>

          <p className="mt-10 text-center text-[13px] text-slate-500 font-medium">
            {isLogin ? (
              <>
                还没有账号？{' '}
                <button
                  type="button"
                  onClick={() => { setIsLogin(false); resetState(); }}
                  className="text-blue-600 hover:text-blue-700 font-bold hover:underline transition-all"
                >
                  免费注册
                </button>
              </>
            ) : (
              <>
                已有账号？{' '}
                <button
                  type="button"
                  onClick={() => { setIsLogin(true); resetState(); }}
                  className="text-blue-600 hover:text-blue-700 font-bold hover:underline transition-all"
                >
                  直接登录
                </button>
              </>
            )}
          </p>
        </div>
      </div>

      {/* 注册成功提示弹窗 */}
      {showSuccessToast && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.12)] border border-slate-100 w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            {/* 顶部装饰条 */}
            <div className="h-1.5 bg-gradient-to-r from-blue-400 via-blue-500 to-indigo-500"></div>
            <div className="px-8 py-8 text-center">
              {/* 成功图标 */}
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-full flex items-center justify-center mb-5 ring-4 ring-blue-50/50">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/25">
                  <CheckCircle2 className="w-6 h-6 text-white" />
                </div>
              </div>
              {/* 提示文字 */}
              <h3 className="text-lg font-bold text-slate-800 mb-2">注册成功</h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed">
                请重新登录
              </p>
              {/* 按钮 */}
              <button
                onClick={() => {
                  setShowSuccessToast(false);
                  setIsLogin(true);
                  setPassword('');
                  setPhone('');
                }}
                className="mt-7 w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-2xl font-bold text-[15px] shadow-[0_4px_20px_0_rgba(59,130,246,0.3)] hover:shadow-[0_8px_25px_rgba(59,130,246,0.4)] hover:scale-[1.02] transition-all duration-300 outline-none focus:ring-4 focus:ring-blue-500/30"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 密码强度检测组件 */
function PasswordStrength({ password }: { password: string }) {
  const checks = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };
  const score = Object.values(checks).filter(Boolean).length;

  const levels = [
    { min: 0, label: "太弱", color: "bg-red-400", text: "text-red-500", width: "w-1/5" },
    { min: 1, label: "弱", color: "bg-orange-400", text: "text-orange-500", width: "w-2/5" },
    { min: 3, label: "一般", color: "bg-yellow-400", text: "text-yellow-600", width: "w-3/5" },
    { min: 4, label: "强", color: "bg-green-400", text: "text-green-500", width: "w-4/5" },
    { min: 5, label: "很强", color: "bg-emerald-500", text: "text-emerald-600", width: "w-full" },
  ];
  const level = [...levels].reverse().find(l => score >= l.min)!;

  const tips = [
    { key: "length", label: "至少8位" },
    { key: "upper", label: "大写字母" },
    { key: "lower", label: "小写字母" },
    { key: "number", label: "数字" },
    { key: "special", label: "特殊符号" },
  ];

  return (
    <div className="mt-2 ml-1">
      {/* 强度条 */}
      <div className="flex items-center gap-2 mb-1.5">
        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-300 ${level.color} ${level.width}`}></div>
        </div>
        <span className={`text-xs font-bold ${level.text}`}>{level.label}</span>
      </div>
      {/* 详细提示 */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {tips.map(t => {
          const ok = checks[t.key as keyof typeof checks];
          return (
            <span key={t.key} className={`text-[11px] ${ok ? "text-green-600" : "text-slate-400"}`}>
              {ok ? "✅" : "○"} {t.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

