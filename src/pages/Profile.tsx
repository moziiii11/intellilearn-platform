import React, { useState, useMemo, useEffect } from "react";
import { Bookmark, Star, ExternalLink, User, Lock, Upload, Key, Loader2, CheckCircle2, X, Search, Folder, Plus, Edit2, Trash2, FolderEdit, ChevronLeft, ChevronRight, Sparkles, Calendar } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from "recharts";
import { cn } from "../lib/utils";
import { useUser } from "../UserContext";
import ReactECharts from "echarts-for-react";

export default function Profile() {
  const { userName, setUserName, userAvatar, setUserAvatar, favorites, setFavorites, folders, setFolders, userProfile } = useUser();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFolder, setActiveFolder] = useState("全部收藏");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [isFavoritesDrawerOpen, setIsFavoritesDrawerOpen] = useState(false);
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingPwd, setIsEditingPwd] = useState(false);
  const [editNameValue, setEditNameValue] = useState(userName);
  const [toastMessage, setToastMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  
  const [viewingResource, setViewingResource] = useState<{title: string, desc: string} | null>(null);
  
  const [timeRange, setTimeRange] = useState<4 | 12 | 26>(12);

  const heatmapData = userProfile?.calendar?.data || [];
  const trendData = userProfile?.trendData || [];
  const abilityScores = userProfile?.abilityScores || { knowledgeBase: 0, cognitiveStyle: 0, errorProneAreas: 0, learningGoals: 0, majorOrInterests: 0, currentProgress: 0 };
  const totalActive = userProfile?.calendar?.totalActive || 0;
  const maxStreak = userProfile?.calendar?.maxStreak || 0;
  const thisWeekData = heatmapData.slice(-7);
  const thisWeekHours = thisWeekData.reduce((acc: number, obj: any) => acc + parseFloat(obj.hours), 0);
  const avgThisWeek = (thisWeekHours / 7).toFixed(1);

  const [selectedHeatmapDay, setSelectedHeatmapDay] = useState<any | null>(null);

  const filteredFavorites = favorites
    .filter(fav => (activeFolder === "全部收藏" || fav.folder === activeFolder))
    .filter(fav => !searchQuery || fav.title.includes(searchQuery) || fav.desc.includes(searchQuery) || fav.tag.includes(searchQuery));
  const totalPages = Math.ceil(filteredFavorites.length / pageSize) || 1;

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3000);
  };

  const handleAvatarClick = () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        setIsUploading(true);
        const reader = new FileReader();
        reader.onload = (event) => {
          setTimeout(() => {
            setUserAvatar(event.target?.result as string);
            setIsUploading(false);
            showToast("头像更新成功");
          }, 800);
        };
        reader.readAsDataURL(file);
      }
    };
    fileInput.click();
  };

  const openFullscreenResource = (e: React.MouseEvent, item: any) => {
    e.preventDefault();
    setViewingResource(item);
  };

  const calendarOption = useMemo(() => {
    const currentData = heatmapData.slice(-timeRange * 7);
    const colors = ['#f8fafc', '#d1fae5', '#6ee7b7', '#34d399', '#10b981'];

    const series = [];
    
    // Outer ring for months (approximate months based on weeks)
    const monthData = [];
    let remainingWeeks = timeRange;
    let m = new Date().getMonth() + 1;
    const monthCount = Math.ceil(timeRange / 4.33);
    const months = Array.from({length: monthCount}, (_, i) => {
        let x = m - monthCount + i + 1;
        while (x <= 0) x += 12;
        return x;
    });

    for(let i=0; i<months.length; i++) {
        const w = (i === months.length - 1) ? remainingWeeks : Math.min(remainingWeeks, Math.round(4.33));
        if (w <= 0) break;
        monthData.push({
            value: w,
            name: `${months[i]}月`,
            itemStyle: { color: 'transparent' },
            label: { show: true, position: 'inside', color: '#94a3b8', fontSize: 11, fontWeight: 'bold' }
        });
        remainingWeeks -= w;
    }
    
    series.push({
        type: 'pie',
        radius: ['85%', '95%'],
        center: ['50%', '50%'],
        startAngle: 90,
        clockwise: false,
        labelLine: { show: false },
        silent: true,
        data: monthData
    });

    for (let i = 0; i < 7; i++) {
      const ringData = [];
      for (let w = 0; w < timeRange; w++) {
           const dayData = currentData[w * 7 + i];
           ringData.push({
               value: 1,
               name: dayData ? dayData.date : '',
               itemStyle: {
                   color: dayData ? colors[dayData.intensity] : colors[0],
                   borderColor: '#fff',
                   borderWidth: Math.max(1, 4 - Math.floor(timeRange / 8))
               },
               payload: dayData
           });
      }
      series.push({
          type: 'pie',
          radius: [`${25 + i * (60/7)}%`, `${25 + (i+1) * (60/7) - Number.EPSILON}%`],
          center: ['50%', '50%'],
          startAngle: 90,
          clockwise: false,
          label: { show: false },
          emphasis: { scale: false, itemStyle: { borderColor: '#10b981', shadowBlur: 10, shadowColor: 'rgba(16, 185, 129, 0.4)', borderWidth: 2 } },
          data: ringData
      });
    }

    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e2e8f0',
        padding: [12, 16],
        textStyle: { color: '#334155' },
        formatter: (params: any) => {
          if (!params.data.payload) return '';
          const d = params.data.payload;
          if (d.intensity === 0) return `<div style="font-weight:bold;color:#1e293b;margin-bottom:4px;">${d.date}</div><div style="color:#64748b;font-size:13px;">今日未打卡学习</div>`;
          return `
            <div style="font-weight:bold;color:#1e293b;border-bottom:1px solid #f1f5f9;padding-bottom:8px;margin-bottom:8px;">${d.date}</div>
            <div style="font-size:13px;color:#475569;line-height:1.6;">
              <div><span style="color:#94a3b8;display:inline-block;width:80px;">学习时长：</span><span style="font-weight:600;color:#059669;">${d.hours} 小时</span></div>
              <div><span style="color:#94a3b8;display:inline-block;width:80px;">学习科目：</span><span style="font-weight:500;color:#334155;">${d.subject}</span></div>
              <div><span style="color:#94a3b8;display:inline-block;width:80px;">完结知识点：</span><span style="font-weight:500;color:#334155;">${d.tasks} 个</span></div>
            </div>
          `;
        }
      },
      series
    };
  }, [timeRange]);

  const onEvents = {
    click: (params: any) => {
      if (params.data && params.data.payload && params.data.payload.intensity > 0) {
        setSelectedHeatmapDay(params.data.payload);
      }
    }
  };

  return (
    <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-7.5rem)] gap-6 relative lg:overflow-hidden">
      {/* Fullscreen Modal Viewer */}
      {viewingResource && (
        <div className="fixed inset-0 z-[100] bg-transparent flex items-center justify-center p-4 sm:p-8 animate-in fade-in" onClick={() => setViewingResource(null)}>
          <div className="bg-white rounded-3xl p-8 sm:p-12 max-w-3xl w-full text-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-200 relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setViewingResource(null)} className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
              <X className="w-6 h-6" />
            </button>
            <h1 className="text-2xl font-bold mb-4 pr-12">{viewingResource.title}</h1>
            <p className="text-slate-600 leading-relaxed text-lg mb-8">{viewingResource.desc}</p>
            <div className="aspect-video bg-slate-100 rounded-xl border-dashed border-2 border-slate-300 flex items-center justify-center">
               <span className="text-slate-400 font-medium">资源内容展示区</span>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-4 right-4 z-50 bg-slate-800 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Left Column: User Basic Info */}
      <div className="w-full lg:w-[320px] xl:w-[340px] shrink-0 bg-white/80 backdrop-blur-xl rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200/50 p-6 xl:p-8 flex flex-col lg:h-full relative overflow-y-auto overflow-x-hidden custom-scrollbar">
        {/* Subtle background glow */}
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex items-start mb-10 z-10 shrink-0">
           <h3 className="font-bold text-slate-800 text-xl tracking-tight">个人信息</h3>
        </div>

        <div className="flex flex-col items-center mb-12 z-10 w-full relative shrink-0">
          <div 
            onClick={handleAvatarClick}
            className="w-32 h-32 rounded-full bg-gradient-to-tr from-slate-100 to-slate-50 flex items-center justify-center border-[6px] border-white shadow-[0_12px_40px_rgb(0,0,0,0.08)] mb-5 relative group cursor-pointer overflow-hidden transition-transform duration-300 hover:scale-105 hover:shadow-[0_16px_50px_rgb(0,0,0,0.12)]"
          >
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
              <Upload className="w-6 h-6 text-white mb-1.5 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300" />
              <span className="text-white text-xs font-semibold tracking-wide transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300 delay-75">更改头像</span>
            </div>
            {isUploading ? (
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin relative z-10" />
            ) : userAvatar ? (
              <img src={userAvatar} alt={userName} className="w-full h-full object-cover" />
            ) : (
              <User className="w-10 h-10 text-slate-300" />
            )}
          </div>
          
          <div className="flex flex-col items-center gap-1.5 w-full text-center px-2">
            <div className="text-2xl font-bold text-slate-800 tracking-tight xl:max-w-[280px] break-words">{userName}</div>
            <div className="flex flex-wrap justify-center gap-2 mt-2 px-2">
              {abilityScores.knowledgeBase > 60 ? <span className="px-3 py-1 text-[13px] font-semibold rounded-xl bg-blue-50 text-blue-600 border border-blue-200/80 shadow-sm">基础扎实</span> : <span className="px-3 py-1 text-[13px] font-semibold rounded-xl bg-rose-50 text-rose-600 border border-rose-200/80 shadow-sm">基础薄弱</span>}
              {abilityScores.learningGoals > 70 ? <span className="px-3 py-1 text-[13px] font-semibold rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/80 shadow-sm">目标清晰</span> : null}
              {abilityScores.errorProneAreas < 60 ? <span className="px-3 py-1 text-[13px] font-semibold rounded-xl bg-slate-50 text-slate-600 border border-slate-200 shadow-sm">计算易错</span> : null}
              {userProfile?.cognitiveStyle ? <span className="px-3 py-1 text-[13px] font-semibold rounded-xl bg-sky-50 text-sky-600 border border-sky-200/80 shadow-sm">偏好：{userProfile.cognitiveStyle.substring(0, 10)}</span> : <span className="px-3 py-1 text-[13px] font-semibold rounded-xl bg-sky-50 text-sky-600 border border-sky-200/80 shadow-sm">视觉型学习者</span>}
              {userProfile?.majorOrInterests ? <span className="px-3 py-1 text-[13px] font-semibold rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200/80 shadow-sm">{userProfile.majorOrInterests.substring(0, 10)}</span> : <span className="px-3 py-1 text-[13px] font-semibold rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200/80 shadow-sm">探索中</span>}
            </div>
          </div>
        </div>

        <div className="space-y-4 flex-1 z-10 shrink-0 pb-4">
           <div 
             className={`flex flex-col bg-white/50 backdrop-blur-sm rounded-2xl border-2 transition-all duration-300 overflow-hidden ${isEditingName ? 'border-blue-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] bg-white/80' : 'border-slate-100 hover:border-blue-100 cursor-pointer shadow-[0_2px_10px_rgb(0,0,0,0.02)]'}`}
           >
              <div 
                className={`flex items-center gap-2 px-5 py-4 ${isEditingName ? 'cursor-pointer' : ''}`}
                onClick={() => {
                  if (!isEditingName) {
                    setEditNameValue(userName);
                    setIsEditingName(true);
                  } else {
                    setIsEditingName(false);
                  }
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                <span className="text-[15px] font-bold text-slate-800 tracking-wide w-full select-none">修改名称</span>
              </div>
              
              {isEditingName && (
                <div className="flex flex-col gap-4 px-5 pb-5 animate-in fade-in zoom-in-95 duration-200">
                  <input 
                    type="text" 
                    value={editNameValue} 
                    autoFocus
                    onChange={e => setEditNameValue(e.target.value)} 
                    className="text-base p-3 rounded-xl border border-blue-200 outline-none focus:ring-4 focus:ring-blue-50 focus:border-blue-300 bg-white transition-all font-medium text-slate-800" 
                    placeholder="输入新的名称"
                  />
                  <div className="flex items-center gap-3 justify-end mt-1">
                     <button onClick={() => setIsEditingName(false)} className="text-sm text-slate-700 hover:text-slate-900 px-5 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 font-bold transition-colors">取消</button>
                     <button onClick={() => { setUserName(editNameValue); setIsEditingName(false); showToast("名称修改成功"); }} className="text-sm text-white hover:bg-blue-700 px-5 py-2.5 rounded-xl bg-blue-600 shadow-sm font-bold transition-all">保存更改</button>
                  </div>
                </div>
              )}
           </div>
           
           <div 
             className={`flex flex-col bg-white/50 backdrop-blur-sm rounded-2xl border-2 transition-all duration-300 overflow-hidden ${isEditingPwd ? 'border-blue-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] bg-white/80' : 'border-slate-100 hover:border-blue-100 cursor-pointer shadow-[0_2px_10px_rgb(0,0,0,0.02)] mt-2'}`}
           >
              <div 
                className={`flex items-center gap-2 px-5 py-4 ${isEditingPwd ? 'cursor-pointer' : ''}`}
                onClick={() => {
                  if (!isEditingPwd) {
                    setIsEditingPwd(true);
                  } else {
                    setIsEditingPwd(false);
                  }
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                <span className="text-[15px] font-bold text-slate-800 tracking-wide w-full select-none">修改密码</span>
              </div>

              {isEditingPwd && (
                <div className="flex flex-col gap-4 px-5 pb-5 animate-in fade-in zoom-in-95 duration-200">
                  <input type="password" placeholder="原密码" className="text-base p-3 rounded-xl border border-slate-200 outline-none focus:ring-4 focus:ring-blue-50 focus:border-blue-300 bg-white transition-all font-medium placeholder:text-slate-400" />
                  <input type="password" placeholder="新密码" className="text-base p-3 rounded-xl border border-slate-200 outline-none focus:ring-4 focus:ring-blue-50 focus:border-blue-300 bg-white transition-all font-medium placeholder:text-slate-400" />
                  <div className="flex items-center gap-3 justify-end mt-1">
                     <button onClick={() => setIsEditingPwd(false)} className="text-sm text-slate-700 hover:text-slate-900 px-5 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 font-bold transition-colors">取消</button>
                     <button onClick={() => { setIsEditingPwd(false); showToast("密码修改成功"); }} className="text-sm text-white hover:bg-emerald-600 px-5 py-2.5 rounded-xl bg-emerald-500 shadow-sm font-bold transition-all">更新密码</button>
                  </div>
                </div>
              )}
           </div>
           
           <div className="flex items-center gap-4 p-4 mt-6 bg-slate-50/80 rounded-2xl border border-slate-100/50">
             <div className="w-10 h-10 rounded-xl bg-slate-200/50 flex items-center justify-center shrink-0"><Lock className="w-5 h-5 text-slate-400" /></div>
             <div className="flex flex-col">
               <span className="text-[13px] text-slate-500 font-medium">账号保护</span>
               <span className="text-[15px] font-bold text-slate-700 tracking-tight mt-0.5 flex items-center">
                 状态：安全
                 <div className="w-2 h-2 rounded-full bg-emerald-400 ml-2 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]"></div>
               </span>
             </div>
           </div>
        </div>
      </div>

      {/* Middle Column: AI Learning Summary & Charts */}
      <div className="w-full lg:flex-[1.2] shrink-0 bg-white/80 backdrop-blur-md rounded-3xl shadow-sm border border-slate-200/60 p-6 flex flex-col relative overflow-hidden group lg:h-full min-h-[400px] lg:min-h-0">
         <div className="absolute -top-10 -right-10 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity duration-500 pointer-events-none">
           <Sparkles className="w-48 h-48 text-blue-600" />
         </div>
         <h3 className="font-semibold text-slate-800 tracking-tight mb-4 flex items-center gap-2 shrink-0">
           <Sparkles className="w-5 h-5 text-blue-500" /> 学情综合看板
         </h3>
         
         <div className="flex-1 w-full flex flex-col gap-6 overflow-y-auto z-10 custom-scrollbar pr-2 pb-2">
            
            {/* Top row: Analysis Text */}
            <div className="bg-gradient-to-br from-blue-50/50 to-indigo-50/50 rounded-2xl p-5 border border-blue-100/50 flex flex-col gap-4 shrink-0">
               <p className="text-[14px] text-slate-700 leading-relaxed font-medium">
                 <span className="font-bold text-slate-900 flex items-center gap-1.5 mb-1.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> 学科数据洞察</span>
                 {userProfile?.knowledgeBaseText || `近一周你在平台总计沉浸 ${avgThisWeek} 小时，整体状态极佳。你的知识基础评分达到 ${abilityScores.knowledgeBase} 分。`}
                 {userProfile?.currentProgress ? ` 当前进度：${userProfile.currentProgress}` : ''}
               </p>
               <div className="h-px bg-slate-200/50 w-full" />
               <p className="text-[14px] text-slate-700 leading-relaxed font-medium">
                 <span className="font-bold text-slate-900 flex items-center gap-1.5 mb-1.5"><span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span> 核心提升建议</span>
                 {userProfile?.errorProneAreasText || `根据薄弱点靶向追踪，你的易错点评分 ${abilityScores.errorProneAreas}。建议下阶段通过“疑问模块”针对性攻克薄弱环节，理清知识脉络。`}
               </p>
               <div className="h-px bg-slate-200/50 w-full" />
               <p className="text-[14px] text-slate-700 leading-relaxed font-medium">
                  <span className="font-bold text-slate-900 flex items-center gap-1.5 mb-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> 下阶段目标预测</span>
                  {userProfile?.learningGoalsText || `按照当前调整策略，结合你的学习目标（${abilityScores.learningGoals} 分），模型预测你在下阶段能够成功攻克难点。继续保持专注！`}
               </p>
            </div>

            {/* Bottom row: Charts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-[240px] shrink-0">
               {/* Radar Chart */}
               <div className="bg-white rounded-2xl p-4 border border-slate-100 flex flex-col items-center justify-center shadow-sm relative overflow-hidden group/chart cursor-default transition-all hover:border-blue-200 hover:shadow-md">
                 <h4 className="absolute top-4 left-4 text-[13px] font-bold text-slate-700 flex items-center gap-1.5 z-10"><span className="w-1 h-3 bg-blue-500 rounded-full"></span>能力模型雷达</h4>
                 <div className="w-full h-full pt-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="65%" data={[
                        { subject: '知识基础', A: abilityScores.knowledgeBase || 60, fullMark: 100 },
                        { subject: '目标感', A: abilityScores.learningGoals || 50, fullMark: 100 },
                        { subject: '抗错率', A: abilityScores.errorProneAreas || 40, fullMark: 100 },
                        { subject: '学习进度', A: abilityScores.currentProgress || 30, fullMark: 100 },
                        { subject: '专注度', A: abilityScores.majorOrInterests || 70, fullMark: 100 },
                        { subject: '探索力', A: abilityScores.cognitiveStyle || 65, fullMark: 100 }
                      ]}>
                        <PolarGrid stroke="#e2e8f0" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }} />
                        <Radar name="能力评分" dataKey="A" stroke="#3b82f6" strokeWidth={2} fill="#60a5fa" fillOpacity={0.3} />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: '12px', fontWeight: 'bold' }} />
                      </RadarChart>
                    </ResponsiveContainer>
                 </div>
               </div>

               {/* Line Chart */}
               <div className="bg-white rounded-2xl p-4 border border-slate-100 flex flex-col items-center justify-center shadow-sm relative overflow-hidden group/chart cursor-default transition-all hover:border-emerald-200 hover:shadow-md">
                 <h4 className="absolute top-4 left-4 text-[13px] font-bold text-slate-700 flex items-center gap-1.5 z-10"><span className="w-1 h-3 bg-emerald-500 rounded-full"></span>近七日学习趋势</h4>
                 <div className="w-full h-full pt-8 pl-1 pr-4 pb-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={thisWeekData.length > 0 ? thisWeekData : [
                        { name: '周一', hours: 1 }, { name: '周二', hours: 2 }, { name: '周三', hours: 1.5 },
                        { name: '周四', hours: 3 }, { name: '周五', hours: 2 }, { name: '周六', hours: 4 }, { name: '周日', hours: 3.5 }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(val: string) => val ? val.slice(-5) : ''} />
                        <YAxis hide />
                        <Tooltip 
                          cursor={{ fill: '#f8fafc' }}
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: '12px' }}
                          formatter={(value: any) => [`${value} 小时`, '学习时长']}
                          labelFormatter={(label: any) => `日期: ${label}`}
                        />
                        <Bar 
                          dataKey="hours" 
                          fill="#34d399" 
                          radius={[4, 4, 0, 0]} 
                          barSize={20}
                          animationDuration={1500}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                 </div>
               </div>
            </div>
         </div>
      </div>

      {/* Right Column: Calendar + Favorites */}
      <div className="w-full lg:flex-1 xl:max-w-[500px] shrink-0 flex flex-col gap-6 lg:h-full lg:overflow-hidden">
        
        {/* Right Top: Learning Heatmap Calendar */}
        <div className="bg-white/80 backdrop-blur-md rounded-3xl shadow-sm border border-slate-200/60 p-5 xl:p-6 flex flex-col relative shrink-0 flex-1 min-h-[300px]">
           <h3 className="font-semibold text-slate-800 tracking-tight mb-2 flex items-center justify-between z-10 relative">
             <span className="flex items-center gap-2">
               <Calendar className="w-5 h-5 text-emerald-500" /> 学习打卡日历
             </span>
             <div className="flex bg-slate-100/80 p-1 rounded-xl">
               {[4, 12, 26].map(t => (
                 <button 
                   key={t}
                   onClick={() => setTimeRange(t as any)}
                   className={`text-[10px] xl:text-xs px-2 xl:px-3 py-1.5 rounded-lg transition-colors font-medium ${timeRange === t ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                 >
                   {t === 4 ? '4周' : t === 12 ? '12周' : '半年'}
                 </button>
               ))}
             </div>
           </h3>
           
           <div className="flex items-center justify-between text-[11px] xl:text-xs text-slate-500 mb-4 bg-slate-50/80 p-3 rounded-xl border border-slate-100 z-10 relative">
             <div className="flex flex-col"><span className="text-slate-400 mb-0.5">累计打卡</span><span className="font-bold text-slate-700 text-sm">{totalActive} 天</span></div>
             <div className="flex flex-col border-l border-slate-200 pl-3 xl:pl-4"><span className="text-slate-400 mb-0.5">最长连续</span><span className="font-bold text-slate-700 text-sm">{maxStreak} 天</span></div>
             <div className="flex flex-col border-l border-slate-200 pl-3 xl:pl-4"><span className="text-slate-400 mb-0.5">本周平均</span><span className="font-bold text-slate-700 text-sm">{avgThisWeek} h</span></div>
           </div>

           <div className="flex-1 flex flex-col justify-center relative min-h-[160px] xl:min-h-[180px]">
              <div className="absolute inset-x-0 inset-y-0">
                <ReactECharts 
                  option={calendarOption} 
                  onEvents={onEvents} 
                  style={{height: '100%', width: '100%'}} 
                  opts={{ renderer: 'svg' }}
                />
              </div>
              <div className="flex justify-end items-center gap-1.5 text-[10px] text-slate-400 mt-auto pt-2 relative z-10 bg-white/50 backdrop-blur-sm px-2 py-1 rounded-full self-end border border-slate-100 shadow-sm opacity-80 hover:opacity-100 transition-opacity">
                <span>无</span>
                <div className="w-2.5 h-2.5 rounded-sm bg-slate-100"></div>
                <div className="w-2.5 h-2.5 rounded-sm bg-emerald-200"></div>
                <div className="w-2.5 h-2.5 rounded-sm bg-emerald-300"></div>
                <div className="w-2.5 h-2.5 rounded-sm bg-emerald-400"></div>
                <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></div>
                <span>高频</span>
              </div>
           </div>

           {selectedHeatmapDay && (
             <div className="absolute inset-2 sm:inset-4 bg-white/95 backdrop-blur-md rounded-2xl p-5 shadow-2xl border border-slate-200/80 flex flex-col z-20 animate-in fade-in zoom-in-95">
               <div className="flex justify-between items-start mb-4">
                 <div>
                   <h4 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                     <Calendar className="w-4 h-4 text-emerald-500" />
                     {selectedHeatmapDay.date}
                   </h4>
                   <div className="flex flex-wrap gap-2 mt-2">
                     <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-md text-[11px] font-semibold">时长: {selectedHeatmapDay.hours}h</span>
                     <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md text-[11px] font-semibold">科目: {selectedHeatmapDay.subject}</span>
                   </div>
                 </div>
                 <button onClick={() => setSelectedHeatmapDay(null)} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors">
                   <X className="w-5 h-5" />
                 </button>
               </div>
               
               <div className="bg-slate-50/80 p-4 rounded-xl text-slate-700 text-sm leading-relaxed flex-1 border border-slate-100/50 overflow-y-auto custom-scrollbar">
                 <p className="font-semibold text-slate-600 mb-2 pb-2 border-b border-slate-200/60">学习明细</p>
                 {selectedHeatmapDay.details && selectedHeatmapDay.details.length > 0 ? (
                   <ul className="space-y-2">
                     {selectedHeatmapDay.details.map((detail, idx) => (
                        <li key={idx} className="flex gap-2.5 items-start p-2.5 bg-white border border-slate-100 rounded-lg shadow-sm">
                          <span className="mt-0.5 text-slate-400 shrink-0">
                             {detail.type === 'exercise' ? <Edit2 className="w-3.5 h-3.5 text-orange-400" /> : 
                              detail.type === 'doc' ? <Folder className="w-3.5 h-3.5 text-blue-400" /> :
                              <Sparkles className="w-3.5 h-3.5 text-purple-400" />}
                          </span>
                          <span className="text-slate-700 font-medium text-[13px]">{detail.content}</span>
                        </li>
                     ))}
                   </ul>
                 ) : (
                   <p className="text-slate-400 italic text-[13px]">今日没有详细的学习记录。</p>
                 )}
               </div>
             </div>
           )}
        </div>

        {/* Right Bottom: Favorites Button (Simplified) */}
        <div 
          onClick={() => setIsFavoritesDrawerOpen(true)}
          className="bg-white/80 backdrop-blur-md rounded-3xl shadow-sm border border-slate-200/60 p-5 flex flex-col justify-center items-center cursor-pointer hover:bg-white hover:border-blue-200 hover:shadow-md transition-all group shrink-0"
        >
           <div className="w-12 h-12 bg-blue-50/50 rounded-2xl flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-300">
             <Bookmark className="w-6 h-6 text-blue-500" />
           </div>
           <h3 className="font-bold text-slate-700 text-sm">我的收藏夹</h3>
           <p className="text-xs text-slate-400 mt-0.5">共 {favorites.length} 条收藏</p>
        </div>

      </div>

      {/* Favorites Drawer Overlay */}
      {isFavoritesDrawerOpen && (
        <div 
          className="fixed inset-0 z-40 bg-transparent transition-opacity"
          onClick={() => setIsFavoritesDrawerOpen(false)}
        />
      )}

      {/* Favorites Drawer Panel */}
      <div className={`fixed top-0 right-0 bottom-0 w-full sm:w-[500px] lg:w-[38%] bg-white/95 backdrop-blur-xl shadow-2xl border-l border-slate-200/60 z-50 transform transition-transform duration-500 ease-out flex flex-col ${isFavoritesDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-6 shrink-0 flex items-center justify-between border-b border-slate-100/80">
          <h3 className="font-semibold text-slate-800 tracking-tight flex items-center gap-2 text-lg">
             <Bookmark className="w-5 h-5 text-blue-500" /> 收藏夹
          </h3>
          <button onClick={() => setIsFavoritesDrawerOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 flex flex-col gap-4 overflow-hidden h-full">
           <div className="relative w-full shrink-0">
             <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
             <input 
               type="text" 
               value={searchQuery}
               onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
               placeholder="搜索标题、内容或标签..." 
               className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all placeholder:text-slate-400"
             />
           </div>

           <div className="flex flex-col h-full overflow-hidden min-h-0 pt-2">
             {/* Folders Tab Row */}
             <div className="flex gap-2 overflow-x-auto pb-3 shrink-0 custom-scrollbar hide-scrollbar-arrows">
               {folders.map(folder => (
                 <button 
                   key={folder}
                   onClick={() => { setActiveFolder(folder); setCurrentPage(1); }}
                   className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-medium whitespace-nowrap transition-colors border ${activeFolder === folder ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                 >
                   <Folder className={`w-3.5 h-3.5 ${activeFolder === folder ? 'text-blue-500 fill-current opacity-20' : 'text-slate-400'}`} />
                   <span>{folder}</span>
                 </button>
               ))}
               
               {isAddingFolder ? (
                 <div className="flex items-center gap-1 bg-slate-50 rounded-[10px] border border-slate-200 pl-1 pr-1.5 py-1">
                   <input 
                     type="text" 
                     value={newFolderName}
                     onChange={e => setNewFolderName(e.target.value)}
                     className="w-24 px-2 py-0.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white"
                     placeholder="新名称"
                     autoFocus
                   />
                   <div className="flex gap-1 ml-1">
                     <button onClick={() => setIsAddingFolder(false)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"><X className="w-3 h-3" /></button>
                     <button 
                       onClick={() => {
                         if(newFolderName.trim() && !folders.includes(newFolderName)) {
                           setFolders([...folders, newFolderName.trim()]);
                           setNewFolderName("");
                           setIsAddingFolder(false);
                         }
                       }} 
                       className="p-1 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                     >
                       <CheckCircle2 className="w-3 h-3" />
                     </button>
                   </div>
                 </div>
               ) : (
                 <button onClick={() => setIsAddingFolder(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-medium text-slate-500 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-300 transition-colors whitespace-nowrap">
                   <Plus className="w-3.5 h-3.5" />
                   新建分类
                 </button>
               )}
             </div>

             {/* Favorites List */}
             <div className="flex-1 overflow-y-auto pr-2 flex flex-col custom-scrollbar mt-1 pb-4">
               <div className="flex flex-col gap-3">
                 {filteredFavorites
                   .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                   .map((item) => (
                    <div 
                      key={item.id} 
                      className="p-4 bg-white hover:bg-[#eef4ff] rounded-[16px] border border-slate-100 hover:border-blue-200 shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_20px_rgba(37,99,235,0.08)] transition-all duration-300 group flex gap-3.5 cursor-pointer shrink-0"
                      onClick={(e) => {
                        openFullscreenResource(e, item)
                      }}
                    >
                     <div className="w-[42px] h-[42px] bg-[#dbe8fe]/60 rounded-xl flex items-center justify-center shrink-0">
                       <Bookmark className="w-4 h-4 text-blue-600" />
                     </div>
                     <div className="flex-1 min-w-0 flex flex-col">
                        <div className="flex items-center gap-2 mb-1.5">
                          <h4 
                            className="font-bold text-slate-700 group-hover:text-blue-700 text-[14px] transition-colors leading-tight line-clamp-1 truncate"
                            title={item.title}
                          >
                            {item.title}
                          </h4>
                          <select 
                             value={item.folder}
                             onChange={(e) => {
                                e.stopPropagation();
                                setFavorites(favorites.map(f => f.id === item.id ? {...f, folder: e.target.value} : f));
                             }}
                             onClick={e => e.stopPropagation()}
                             className="text-[11px] font-medium text-slate-500 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md px-1.5 py-0.5 cursor-pointer outline-none focus:border-blue-400 min-w-0 max-w-[90px] truncate transition-colors ml-auto"
                           >
                             {folders.map(f => <option key={f} value={f}>{f}</option>)}
                           </select>
                        </div>
                        <p className="text-[12px] text-slate-500 line-clamp-2 leading-relaxed mb-2">{item.desc}</p>
                        <div className="flex justify-end mt-auto opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setFavorites(favorites.filter(f => f.id !== item.id));
                              // Total pages will automatically recalculate. 
                              // If current page becomes empty, we should probably reset to 1 somewhere else, but standard behavior usually keeps current page unless out of bounds.
                              // Actually, the `Math.ceil` for totalPages happens on render, so if we decrement currentPage to respect out of bounds later on it'll work if handled.
                              showToast("已取消收藏");
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            title="取消收藏"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                     </div>
                  </div>
                 ))}
                 
                 {filteredFavorites.length === 0 && (
                   <div className="flex flex-col items-center justify-center py-10 opacity-60">
                      <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-3 border border-slate-100">
                        <Bookmark className="w-5 h-5 text-slate-300" />
                      </div>
                      <p className="text-[13px] font-semibold text-slate-600 mb-0.5">这里还是空的</p>
                      <p className="text-[11px] text-slate-400">去添加一些收藏吧</p>
                   </div>
                 )}
               </div>
               
               {/* Pagination Component in Drawer */}
               {filteredFavorites.length > 0 && (
                 <div className="flex items-center justify-between mt-auto pt-4 pb-2 shrink-0">
                   <div className="flex items-center gap-2">
                     <span className="text-[11px] text-slate-400">每页展现:</span>
                     <select 
                       value={pageSize}
                       onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                       className="text-[11px] font-medium text-slate-600 bg-white border border-slate-200 hover:border-slate-300 rounded px-1.5 py-0.5 outline-none cursor-pointer"
                     >
                       <option value={4}>4 条</option>
                       <option value={6}>6 条</option>
                       <option value={8}>8 条</option>
                       <option value={10}>10 条</option>
                     </select>
                   </div>
                   <div className="flex items-center gap-3">
                     <button 
                       onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                       disabled={currentPage === 1}
                       className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 disabled:opacity-40 disabled:bg-slate-50 disabled:hover:border-slate-200 disabled:hover:text-slate-500 disabled:cursor-not-allowed transition-colors shadow-sm"
                     >
                       <ChevronLeft className="w-3.5 h-3.5" />
                     </button>
                     <span className="text-[13px] text-slate-500 tabular-nums">
                       <span className="font-semibold text-slate-700">{currentPage}</span> / {totalPages}
                     </span>
                     <button 
                       onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                       disabled={currentPage === totalPages}
                       className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 disabled:opacity-40 disabled:bg-slate-50 disabled:hover:border-slate-200 disabled:hover:text-slate-500 disabled:cursor-not-allowed transition-colors shadow-sm"
                     >
                       <ChevronRight className="w-3.5 h-3.5" />
                     </button>
                   </div>
                 </div>
               )}
             </div>
           </div>
        </div>
      </div>

    </div>
  );
}
