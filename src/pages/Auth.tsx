import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { useUser } from '../UserContext';
import { Bot, Lock, User as UserIcon, ArrowRight, Eye, EyeOff, Calendar, School, AlertCircle } from 'lucide-react';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2 | 3>(1);
  
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [birthday, setBirthday] = useState('');
  const [primarySchool, setPrimarySchool] = useState('');
  
  const [forgotName, setForgotName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const { setIsLoggedIn, setUserName } = useUser();
  const navigate = useNavigate();

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
          navigate('/');
        } else {
          setErrorMsg(data.message || '用户名或密码错误');
        }
      } else {
        const res = await fetch("/api/auth/register", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: name, password, birthday, primarySchool })
        });
        const data = await res.json();
        if (data.success) {
          alert('注册成功，请重新登录');
          setIsLogin(true);
          setPassword('');
          setBirthday('');
          setPrimarySchool('');
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
    if (!forgotName) return;
    setForgotStep(2); // Since we only verify at the end, just proceed
  };

  const handleForgotStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!birthday || !primarySchool) return;
    setForgotStep(3); // Wait to check the backend
  };

  const handleForgotStep3 = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: forgotName, birthday, primarySchool, newPassword })
      });
      const data = await res.json();
      if (data.success) {
        setIsForgotPassword(false);
        setIsLogin(true);
        setName(forgotName);
        setPassword('');
        setForgotName('');
        setBirthday('');
        setPrimarySchool('');
        setForgotStep(1);
      } else {
        setErrorMsg(data.message || '密码重置失败，请检查密保答案');
        setForgotStep(2); // kick back to step 2 if failed
      }
    } catch (e: any) {
      setErrorMsg('网络请求失败');
    }
  };

  const resetState = () => {
    setErrorMsg('');
    setName('');
    setPassword('');
    setBirthday('');
    setPrimarySchool('');
    setForgotName('');
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
                {forgotStep === 1 && '请输入您的用户名'}
                {forgotStep === 2 && '请回答密保问题'}
                {forgotStep === 3 && '请设置新密码'}
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
                        value={forgotName}
                        onChange={(e) => setForgotName(e.target.value)}
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50/50 border border-slate-200 hover:border-slate-300 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 text-[15px] font-medium text-slate-700"
                        placeholder="请输入需要找回密码的用户名"
                      />
                    </div>
                  </div>
                  <div className="pt-2">
                    <button type="submit" className="group w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-2xl font-bold text-[15px] shadow-[0_4px_20px_0_rgba(59,130,246,0.3)] hover:shadow-[0_8px_25px_rgba(59,130,246,0.4)] hover:scale-[1.02] transition-all duration-300 outline-none focus:ring-4 focus:ring-blue-500/30">
                      下一步
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
                    </button>
                  </div>
                </form>
              )}

              {forgotStep === 2 && (
                <form onSubmit={handleForgotStep2} className="space-y-6 relative z-10">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2 ml-1">你的生日是什么时候？</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-blue-500/70 group-focus-within:text-blue-600 transition-colors">
                        <Calendar className="w-[1.125rem] h-[1.125rem]" />
                      </div>
                      <input
                        type="text"
                        required
                        value={birthday}
                        onChange={(e) => setBirthday(e.target.value)}
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50/50 border border-slate-200 hover:border-slate-300 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 text-[15px] font-medium text-slate-700"
                        placeholder="请输入生日（格式：年-月-日）"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2 ml-1">你的小学学校是什么？</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-blue-500/70 group-focus-within:text-blue-600 transition-colors">
                        <School className="w-[1.125rem] h-[1.125rem]" />
                      </div>
                      <input
                        type="text"
                        required
                        value={primarySchool}
                        onChange={(e) => setPrimarySchool(e.target.value)}
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50/50 border border-slate-200 hover:border-slate-300 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 text-[15px] font-medium text-slate-700"
                        placeholder="请输入你的小学学校名称"
                      />
                    </div>
                  </div>
                  <div className="pt-2">
                    <button type="submit" className="group w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-2xl font-bold text-[15px] shadow-[0_4px_20px_0_rgba(59,130,246,0.3)] hover:shadow-[0_8px_25px_rgba(59,130,246,0.4)] hover:scale-[1.02] transition-all duration-300 outline-none focus:ring-4 focus:ring-blue-500/30">
                      验证密保
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
                    </button>
                  </div>
                </form>
              )}

              {forgotStep === 3 && (
                <form onSubmit={handleForgotStep3} className="space-y-6 relative z-10">
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

              {/* Security Questions during Registration */}
              {!isLogin && (
                <>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2 ml-1">你的生日是什么时候？</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-blue-500/70 group-focus-within:text-blue-600 transition-colors">
                        <Calendar className="w-[1.125rem] h-[1.125rem]" />
                      </div>
                      <input
                        type="text"
                        required
                        value={birthday}
                        onChange={(e) => setBirthday(e.target.value)}
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50/50 border border-slate-200 hover:border-slate-300 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 text-[15px] font-medium text-slate-700"
                        placeholder="请输入生日（格式：年-月-日）"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2 ml-1">你的小学学校是什么？</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-blue-500/70 group-focus-within:text-blue-600 transition-colors">
                        <School className="w-[1.125rem] h-[1.125rem]" />
                      </div>
                      <input
                        type="text"
                        required
                        value={primarySchool}
                        onChange={(e) => setPrimarySchool(e.target.value)}
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50/50 border border-slate-200 hover:border-slate-300 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 text-[15px] font-medium text-slate-700"
                        placeholder="请输入你的小学学校名称"
                      />
                    </div>
                  </div>
                </>
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
    </div>
  );
}

