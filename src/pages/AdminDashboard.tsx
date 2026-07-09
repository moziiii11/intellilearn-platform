import React, { useEffect, useState } from "react";
import { useUser } from "../UserContext";
import { Users, MessageSquare, Brain, TrendingUp, Activity, Shield, ShieldOff, Search, X, ChevronRight, RefreshCw } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];

interface Stats {
  totalUsers: number;
  eventsLast7Days: number;
  eventsToday: number;
  totalChats: number;
  totalCards: number;
  totalWrong: number;
  totalReviews: number;
  avgAccuracy: number;
  dailyEvents: { date: string; count: number }[];
  eventTypes: { event_type: string; count: number }[];
}

export default function AdminDashboard() {
  const { authHeaders } = useUser();
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [detailType, setDetailType] = useState<string | null>(null);
  const [detailTitle, setDetailTitle] = useState("");
  const [detailData, setDetailData] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [userPage, setUserPage] = useState(1);
  const PAGE_SIZE = 20;

  useEffect(() => {
    fetchStats();
    fetchUsers();
    // 每 30 秒自动刷新
    const timer = setInterval(() => {
      fetchStats();
      fetchUsers();
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  async function fetchStats() {
    try {
      const res = await fetch("/api/admin/stats", { headers: authHeaders });
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error("Failed to fetch stats:", e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchUsers() {
    try {
      const res = await fetch("/api/admin/users", { headers: authHeaders });
      const data = await res.json();
      setUsers(data);
    } catch (e) {
      console.error("Failed to fetch users:", e);
    }
  }

  async function fetchDetail(type: string, title: string) {
    setDetailType(type);
    setDetailTitle(title);
    if (type === "users") {
      // 直接使用已加载的用户数据
      setDetailData(users);
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/details?type=${type}`, { headers: authHeaders });
      const result = await res.json();
      setDetailData(result.data || []);
    } catch (e) {
      console.error("Failed to fetch detail:", e);
    } finally {
      setDetailLoading(false);
    }
  }

  async function toggleRole(username: string, currentRole: string) {
    const newRole = currentRole === "admin" ? "user" : "admin";
    try {
      const res = await fetch("/api/admin/users/role", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ username, role: newRole }),
      });
      const data = await res.json();
      if (data.success) {
        setUsers(prev =>
          prev.map(u => (u.username === username ? { ...u, role: newRole } : u))
        );
      }
    } catch (e) {
      console.error("Failed to toggle role:", e);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-500">
        加载统计数据失败
      </div>
    );
  }

  // 格式化每日事件数据
  const dailyData = stats.dailyEvents?.map((d: any) => ({
    date: String(d.date).slice(5), // MM-DD
    count: d.count,
  })) || [];

  const eventTypeData = stats.eventTypes?.map((e: any) => ({
    name: eventTypeLabel(e.event_type),
    value: e.count,
  })) || [];

  // 用户分页
  const filteredUsers = users.filter(u => !searchTerm || u.username.toLowerCase().includes(searchTerm.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const pagedUsers = filteredUsers.slice((userPage - 1) * PAGE_SIZE, userPage * PAGE_SIZE);

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-6">
      {/* 标题 */}
      <div>
        <h1 className="text-2xl font-black text-slate-800">📊 数据看板</h1>
        <p className="text-slate-500 text-sm mt-1">全平台数据概览 · 每30秒自动刷新</p>
      </div>

      {/* 统计卡片 — 点击查看详情 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Users className="w-5 h-5" />} label="总用户" value={stats.totalUsers} color="blue" onClick={() => fetchDetail("users", "用户列表")} />
        <StatCard icon={<Activity className="w-5 h-5" />} label="今日事件" value={stats.eventsToday} color="green" onClick={() => fetchDetail("events", "今日学习事件")} />
        <StatCard icon={<MessageSquare className="w-5 h-5" />} label="总对话" value={stats.totalChats} color="purple" onClick={() => fetchDetail("chats", "对话记录")} />
        <StatCard icon={<TrendingUp className="w-5 h-5" />} label="平均正确率" value={`${stats.avgAccuracy}%`} color="amber" onClick={() => fetchDetail("reviews", "复习记录")} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Brain className="w-5 h-5" />} label="闪卡数" value={stats.totalCards} color="indigo" onClick={() => fetchDetail("cards", "闪卡列表")} />
        <StatCard icon={<Shield className="w-5 h-5" />} label="错题数" value={stats.totalWrong} color="red" onClick={() => fetchDetail("wrong", "错题记录")} />
        <StatCard icon={<Activity className="w-5 h-5" />} label="7日事件" value={stats.eventsLast7Days} color="cyan" onClick={() => fetchDetail("events", "近7日事件")} />
        <StatCard icon={<TrendingUp className="w-5 h-5" />} label="复习次数" value={stats.totalReviews} color="emerald" onClick={() => fetchDetail("reviews", "复习记录")} />
      </div>

      {/* 详情面板 */}
      {detailType && (
        <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-700 flex items-center gap-2">
              <ChevronRight className="w-4 h-4 text-blue-500" />
              {detailTitle}
              <span className="text-sm font-normal text-slate-400">({detailData.length} 条)</span>
            </h3>
            <button onClick={() => setDetailType(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
            </div>
          ) : detailData.length === 0 ? (
            <p className="text-slate-400 text-sm py-4 text-center">暂无数据</p>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <DetailTable type={detailType} data={detailData} onToggleRole={toggleRole} />
            </div>
          )}
        </div>
      )}

      {/* 图表区域 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 每日活跃趋势 */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h3 className="font-bold text-slate-700 mb-4">📈 近7日活跃趋势</h3>
          {dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" fontSize={12} stroke="#94a3b8" />
                <YAxis fontSize={12} stroke="#94a3b8" allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ fill: "#3b82f6" }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-400 text-sm py-8 text-center">暂无数据</p>
          )}
        </div>

        {/* 事件类型分布 */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h3 className="font-bold text-slate-700 mb-4">🥧 事件类型分布</h3>
          {eventTypeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={eventTypeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {eventTypeData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-400 text-sm py-8 text-center">暂无数据</p>
          )}
        </div>
      </div>

      {/* 用户管理 */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-700">👥 用户管理 ({filteredUsers.length} 人)</h3>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜索用户名..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setUserPage(1); }}
              className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500 focus:bg-white outline-none transition-all w-56"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-500">
                <th className="pb-3 font-medium">用户名</th>
                <th className="pb-3 font-medium">手机号</th>
                <th className="pb-3 font-medium">角色</th>
                <th className="pb-3 font-medium">注册时间</th>
                <th className="pb-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {pagedUsers.map(u => (
                <tr key={u.username} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="py-3 font-medium text-slate-700">{u.username}</td>
                  <td className="py-3 text-slate-500">{u.phone || "-"}</td>
                  <td className="py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.role === "admin" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                      {u.role === "admin" ? "管理员" : "用户"}
                    </span>
                  </td>
                  <td className="py-3 text-slate-400 text-xs">{u.created_at ? new Date(u.created_at).toLocaleDateString("zh-CN") : "-"}</td>
                  <td className="py-3">
                    <button
                      onClick={() => toggleRole(u.username, u.role)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
                        u.role === "admin"
                          ? "bg-red-50 text-red-600 hover:bg-red-100"
                          : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                      }`}
                    >
                      {u.role === "admin" ? <ShieldOff className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                      {u.role === "admin" ? "降级" : "升管理员"}
                    </button>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">{searchTerm ? "未找到匹配用户" : "暂无用户数据"}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* 分页控件 — 始终显示 */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
            <span className="text-sm text-slate-500 font-medium">
              共 {filteredUsers.length} 条，第 {userPage} / {totalPages} 页
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setUserPage(1)}
                disabled={userPage === 1}
                className="w-9 h-9 text-sm rounded-lg border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 font-medium"
              >«</button>
              <button
                onClick={() => setUserPage(p => Math.max(1, p - 1))}
                disabled={userPage === 1}
                className="w-9 h-9 text-sm rounded-lg border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 font-medium"
              >‹</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - userPage) <= 2)
                .map((p, idx, arr) => (
                  <React.Fragment key={p}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && <span className="text-slate-300 text-sm px-1">…</span>}
                    <button
                      onClick={() => setUserPage(p)}
                      className={`w-9 h-9 text-sm rounded-lg font-medium transition-colors ${
                        p === userPage
                          ? "bg-blue-500 text-white shadow-sm"
                          : "border border-slate-200 hover:bg-slate-50 text-slate-600"
                      }`}
                    >{p}</button>
                  </React.Fragment>
                ))}
              <button
                onClick={() => setUserPage(p => Math.min(totalPages, p + 1))}
                disabled={userPage === totalPages}
                className="w-9 h-9 text-sm rounded-lg border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 font-medium"
              >›</button>
              <button
                onClick={() => setUserPage(totalPages)}
                disabled={userPage === totalPages}
                className="w-9 h-9 text-sm rounded-lg border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 font-medium"
              >»</button>
            </div>
            <button
              onClick={() => { fetchStats(); fetchUsers(); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-bold hover:bg-blue-600 transition-colors shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
              刷新数据
            </button>
          </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color, onClick }: { icon: React.ReactNode; label: string; value: string | number; color: string; onClick: () => void }) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    amber: "bg-amber-50 text-amber-600",
    indigo: "bg-indigo-50 text-indigo-600",
    red: "bg-red-50 text-red-600",
    cyan: "bg-cyan-50 text-cyan-600",
    emerald: "bg-emerald-50 text-emerald-600",
  };
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl border border-slate-100 p-5 flex items-center gap-4 text-left hover:border-blue-200 hover:shadow-md transition-all duration-200 cursor-pointer w-full"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorMap[color] || colorMap.blue}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-slate-400 font-medium">{label}</p>
        <p className="text-xl font-bold text-slate-800">{value}</p>
      </div>
    </button>
  );
}

/** 根据类型渲染不同的详情表格 */
function DetailTable({ type, data, onToggleRole }: { type: string; data: any[]; onToggleRole?: (username: string, role: string) => void }) {
  if (type === "users") {
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-slate-500">
            <th className="pb-3 font-medium">用户名</th>
            <th className="pb-3 font-medium">手机号</th>
            <th className="pb-3 font-medium">角色</th>
            <th className="pb-3 font-medium">注册时间</th>
            <th className="pb-3 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {data.map(u => (
            <tr key={u.username} className="border-b border-slate-50 hover:bg-slate-50/50">
              <td className="py-2 font-medium text-slate-700">{u.username}</td>
              <td className="py-2 text-slate-500">{u.phone || "-"}</td>
              <td className="py-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.role === "admin" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                  {u.role === "admin" ? "管理员" : "用户"}
                </span>
              </td>
              <td className="py-2 text-slate-400 text-xs">{u.created_at ? new Date(u.created_at).toLocaleDateString("zh-CN") : "-"}</td>
              <td className="py-2">
                <button
                  onClick={() => onToggleRole?.(u.username, u.role)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
                    u.role === "admin"
                      ? "bg-red-50 text-red-600 hover:bg-red-100"
                      : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                  }`}
                >
                  {u.role === "admin" ? <ShieldOff className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                  {u.role === "admin" ? "降级" : "升管理员"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (type === "events") {
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-slate-500">
            <th className="pb-3 font-medium">时间</th>
            <th className="pb-3 font-medium">用户</th>
            <th className="pb-3 font-medium">事件类型</th>
            <th className="pb-3 font-medium">详情</th>
          </tr>
        </thead>
        <tbody>
          {data.map((e, i) => (
            <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
              <td className="py-2 text-slate-500 text-xs">{e.created_at ? new Date(e.created_at).toLocaleString("zh-CN") : "-"}</td>
              <td className="py-2 font-medium text-slate-700">{e.username}</td>
              <td className="py-2">
                <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-600">{eventTypeLabel(e.event_type)}</span>
              </td>
              <td className="py-2 text-slate-500 text-xs max-w-xs truncate">{JSON.stringify(e.payload).substring(0, 100)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (type === "chats") {
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-slate-500">
            <th className="pb-3 font-medium">用户</th>
            <th className="pb-3 font-medium">对话标题</th>
            <th className="pb-3 font-medium">消息数</th>
            <th className="pb-3 font-medium">时间</th>
          </tr>
        </thead>
        <tbody>
          {data.map((c, i) => (
            <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
              <td className="py-2 font-medium text-slate-700">{c.username}</td>
              <td className="py-2 text-slate-600 max-w-xs truncate">{c.title}</td>
              <td className="py-2 text-slate-500">{c.messageCount}</td>
              <td className="py-2 text-slate-500 text-xs">{c.updated_at ? new Date(c.updated_at).toLocaleString("zh-CN") : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (type === "wrong") {
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-slate-500">
            <th className="pb-3 font-medium">用户</th>
            <th className="pb-3 font-medium">题目</th>
            <th className="pb-3 font-medium">分类</th>
            <th className="pb-3 font-medium">难度</th>
            <th className="pb-3 font-medium">错误次数</th>
          </tr>
        </thead>
        <tbody>
          {data.map((w, i) => (
            <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
              <td className="py-2 font-medium text-slate-700">{w.username}</td>
              <td className="py-2 text-slate-600 max-w-xs truncate">{w.questionTitle}</td>
              <td className="py-2 text-slate-500">{w.category}</td>
              <td className="py-2">
                <span className={`px-2 py-0.5 rounded-full text-xs ${w.difficulty === "难" ? "bg-red-50 text-red-600" : w.difficulty === "中" ? "bg-yellow-50 text-yellow-600" : "bg-green-50 text-green-600"}`}>{w.difficulty}</span>
              </td>
              <td className="py-2 font-bold text-red-500">{w.errCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (type === "cards") {
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-slate-500">
            <th className="pb-3 font-medium">用户</th>
            <th className="pb-3 font-medium">正面 (问题)</th>
            <th className="pb-3 font-medium">反面 (答案)</th>
            <th className="pb-3 font-medium">创建时间</th>
          </tr>
        </thead>
        <tbody>
          {data.map((c, i) => (
            <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
              <td className="py-2 font-medium text-slate-700">{c.username}</td>
              <td className="py-2 text-slate-600 max-w-xs truncate">{c.front}</td>
              <td className="py-2 text-slate-500 max-w-xs truncate">{c.back}</td>
              <td className="py-2 text-slate-500 text-xs">{c.created_at ? new Date(c.created_at).toLocaleString("zh-CN") : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (type === "reviews") {
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-slate-500">
            <th className="pb-3 font-medium">用户</th>
            <th className="pb-3 font-medium">试卷名称</th>
            <th className="pb-3 font-medium">总题数</th>
            <th className="pb-3 font-medium">正确数</th>
            <th className="pb-3 font-medium">正确率</th>
            <th className="pb-3 font-medium">时间</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
              <td className="py-2 font-medium text-slate-700">{r.username}</td>
              <td className="py-2 text-slate-600 max-w-xs truncate">{r.paperTitle}</td>
              <td className="py-2 text-slate-500">{r.totalCount}</td>
              <td className="py-2 text-green-600 font-medium">{r.correctCount}</td>
              <td className="py-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.accuracy >= 80 ? "bg-green-50 text-green-600" : r.accuracy >= 60 ? "bg-yellow-50 text-yellow-600" : "bg-red-50 text-red-600"}`}>{r.accuracy}%</span>
              </td>
              <td className="py-2 text-slate-500 text-xs">{r.created_at ? new Date(r.created_at).toLocaleString("zh-CN") : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return <p className="text-slate-400 text-sm">未知类型</p>;
}

function eventTypeLabel(type: string): string {
  const map: Record<string, string> = {
    exercise_answer: "答题",
    document_read: "阅读文档",
    document_highlight: "标注",
    code_run: "代码实操",
    mindmap_view: "思维导图",
    extended_view: "拓展材料",
    pomodoro_session: "番茄钟",
    flashcard_review: "闪卡复习",
    chat: "AI对话",
    chat_stream: "AI对话(流)",
    chat_enhanced: "增强对话",
  };
  return map[type] || type;
}
