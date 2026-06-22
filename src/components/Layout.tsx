import React, { useState, useRef } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { User, BookOpen, MessageSquare, LayoutDashboard, LogOut, X, Upload, CheckCircle2 } from "lucide-react";
import { cn } from "../lib/utils";
import { useUser } from "../UserContext";

export default function Layout() {
  const { userName, setUserName, userAvatar, setUserAvatar, setIsLoggedIn } = useUser();
  const navigate = useNavigate();
  
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState(userName);
  const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(userAvatar);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
    setIsLoggedIn(false);
    navigate('/auth');
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = () => {
    setUserName(editName);
    setUserAvatar(editAvatarPreview);
    setShowEditModal(false);
  };
  
  const openEditModal = () => {
    setEditName(userName);
    setEditAvatarPreview(userAvatar);
    setShowEditModal(true);
  };

  const navItems = [
    { name: "智能问答", path: "/", icon: MessageSquare },
    { name: "学习资源", path: "/resources", icon: BookOpen },
    { name: "个人中心", path: "/profile", icon: LayoutDashboard },
  ];

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col font-sans">
      {/* Edit Profile Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-lg">编辑个人资料</h3>
              <button 
                onClick={() => setShowEditModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* Avatar Edit */}
              <div className="flex flex-col items-center gap-4">
                <div className="relative group cursor-pointer w-24 h-24 rounded-full" onClick={() => fileInputRef.current?.click()}>
                  {editAvatarPreview ? (
                    <img src={editAvatarPreview} alt="Avatar Preview" className="w-full h-full rounded-full object-cover border-4 border-slate-50 shadow-sm" />
                  ) : (
                    <div className="w-full h-full rounded-full bg-slate-100 border-4 border-slate-50 flex items-center justify-center shadow-sm">
                      <User className="w-10 h-10 text-slate-400" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Upload className="w-6 h-6 text-white" />
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*" 
                    onChange={handleAvatarUpload}
                  />
                </div>
                <div className="text-center">
                  <p className="text-[13px] text-slate-500 font-medium">点击上方图片修改头像</p>
                </div>
              </div>
              
              {/* Name Edit */}
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700 ml-1">昵称</label>
                <input 
                  type="text" 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all text-slate-700 font-medium"
                  placeholder="请输入您的昵称"
                />
              </div>
            </div>
            <div className="px-6 py-5 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button 
                onClick={() => setShowEditModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl text-slate-600 font-medium hover:bg-slate-200/50 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleSaveProfile}
                disabled={!editName.trim()}
                className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm shadow-blue-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="w-4 h-4" /> 保存修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Navigation */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-200/70 bg-white/80 backdrop-blur-md shadow-sm">
        <div className="flex h-16 items-center px-6 max-w-screen-2xl mx-auto w-full">
          {/* Logo / Title */}
          <div className="flex items-center gap-2 mr-8">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-1.5 rounded-lg shadow-sm">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-800">
              智慧优学
            </span>
          </div>

          {/* Spacer */}
          <div className="flex-1 flex justify-center">
            <nav className="flex items-center gap-1 bg-slate-100/50 p-1 rounded-xl">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-white text-blue-600 shadow-sm ring-1 ring-slate-900/5"
                        : "text-slate-600 hover:text-blue-600 hover:bg-white/60"
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </NavLink>
              ))}
            </nav>
          </div>

          {/* Right Section: Actions & Avatar */}
          <div className="flex items-center pl-8 gap-4 border-l border-slate-200">
            <div className="flex items-center gap-3 ml-2 p-1.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer pr-4" onClick={openEditModal}>
              {userAvatar ? (
                <img src={userAvatar} alt={userName} className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                  <User className="w-4 h-4 text-slate-500" />
                </div>
              )}
              <span className="text-sm font-semibold text-slate-700">
                {userName}
              </span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
              title="退出登录"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-screen-2xl mx-auto w-full p-6 pt-8">
        <Outlet />
      </main>
    </div>
  );
}
