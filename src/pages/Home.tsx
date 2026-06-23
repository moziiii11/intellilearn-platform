import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  MessageSquare,
  Plus,
  Send,
  User,
  Bot,
  Sparkles,
  Menu,
  LogOut,
  Paperclip,
  Square,
  Mic,
  Trash2,
  Search,
  Copy,
  Volume2,
  VolumeX,
  Bookmark,
  Edit2,
  PenLine,
  ArrowDown,
  X,
  BookOpen,
} from "lucide-react";
import ReactECharts from "echarts-for-react";
import { cn } from "../lib/utils";
import { useUser, Message } from "../UserContext";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

const radarOption_dummy = 1;

const lineOption_dummy = 1;

const barOption_dummy = 1;

export default function Home() {
  const {
    userAvatar,
    userName,
    chats,
    setChats,
    activeChatId,
    setActiveChatId,
    favorites,
    setFavorites,
    setIsLoggedIn,
    authHeaders,
    fetchProfile
  } = useUser();
  const { userProfile, setUserProfile, notifications, markNotificationsRead } = useUser();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [resourceToast, setResourceToast] = useState<string | null>(null);
  const [chartTab, setChartTab] = useState<"radar" | "trend" | "bar">("radar");
  const [input, setInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const abilityScores = userProfile?.abilityScores || {};
  
  const radarOption = useMemo(() => ({
    tooltip: { trigger: "item" },
    radar: {
      indicator: [
        { name: "知识基础", max: 100 },
        { name: "认知风格", max: 100 },
        { name: "易错点", max: 100 },
        { name: "学习目标", max: 100 },
        { name: "专业兴趣", max: 100 },
        { name: "当前进度", max: 100 },
      ],
      splitNumber: 4,
      axisName: { color: "#64748b", fontSize: 11 },
      splitLine: {
        lineStyle: {
          color: ["#f1f5f9", "#e2e8f0", "#e2e8f0", "#e2e8f0", "#e2e8f0"],
        },
      },
      splitArea: { show: false },
      axisLine: { lineStyle: { color: "#e2e8f0" } },
    },
    series: [
      {
        name: "能力图谱",
        type: "radar",
        data: [
          {
            value: [abilityScores.knowledgeBase, abilityScores.cognitiveStyle, abilityScores.errorProneAreas, abilityScores.learningGoals, abilityScores.majorOrInterests, abilityScores.currentProgress],
            name: "当前状态",
            itemStyle: { color: "#3b82f6" },
            areaStyle: { color: "rgba(59, 130, 246, 0.2)" },
            lineStyle: { width: 2, color: "#3b82f6" },
            symbolSize: 4,
          },
        ],
      },
    ],
  }), [abilityScores]);

  const rawTrendSettings = userProfile?.trendData || [];

  const lineOption = useMemo(() => ({
    tooltip: { trigger: "axis" },
    grid: { top: 30, right: 20, bottom: 20, left: 30, containLabel: false },
    xAxis: {
      type: "category",
      data: rawTrendSettings.map((d: any, i: number) => d.name || `Day ${i + 1}`),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: "#94a3b8", fontSize: 10 },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: "#f1f5f9" } },
      axisLabel: { color: "#94a3b8", fontSize: 10 },
    },
    series: [
      {
        data: rawTrendSettings.map((d: any) => d.hours),
        type: "line",
        smooth: true,
        symbolSize: 0,
        lineStyle: { color: "#6366f1", width: 3 },
        areaStyle: {
          color: {
            type: "linear", x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(99, 102, 241, 0.3)" },
              { offset: 1, color: "rgba(99, 102, 241, 0.01)" },
            ],
          },
        },
      },
    ],
  }), [rawTrendSettings]);

  const barOption = useMemo(() => ({
    tooltip: { trigger: "axis" },
    grid: { top: 30, right: 20, bottom: 20, left: 30, containLabel: false },
    xAxis: {
      type: "category",
      data: ["知识基础", "专业/兴趣", "认知风格", "当前进度"],
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: "#94a3b8", fontSize: 10 },
    },
    yAxis: {
      type: "value",
      max: 100,
      splitLine: { lineStyle: { color: "#f1f5f9" } },
      axisLabel: { color: "#94a3b8", fontSize: 10 },
    },
    series: [
      {
        data: [
          { value: abilityScores.knowledgeBase, itemStyle: { color: "#3b82f6", borderRadius: [4, 4, 0, 0] } },
          { value: abilityScores.majorOrInterests, itemStyle: { color: "#10b981", borderRadius: [4, 4, 0, 0] } },
          { value: abilityScores.cognitiveStyle, itemStyle: { color: "#f59e0b", borderRadius: [4, 4, 0, 0] } },
          { value: abilityScores.currentProgress, itemStyle: { color: "#8b5cf6", borderRadius: [4, 4, 0, 0] } },
        ],
        type: "bar",
        barWidth: "40%",
      },
    ],
  }), [abilityScores]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [chartDetail, setChartDetail] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<{name: string, size: number, id: string}[]>([]);
  const [previewFile, setPreviewFile] = useState<{name: string, size: number, type: 'image' | 'doc'} | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeChat = chats.find((c) => c.id === activeChatId);
  const messages = activeChat ? activeChat.messages : [];

  const filteredChats = chats.filter((chat) =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (container) {
      const isAtBottom =
        container.scrollHeight - container.scrollTop <=
        container.clientHeight + 50;
      setShowScrollToBottom(
        !isAtBottom && container.scrollHeight > container.clientHeight,
      );
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newFiles = Array.from(files).map((f: File) => ({ 
        name: f.name, 
        size: f.size, 
        id: Math.random().toString(36).substring(7) 
      }));
      setStagedFiles(prev => [...prev, ...newFiles]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleSpeak = (msgId: string, text: string) => {
    if (speakingId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
    } else {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => setSpeakingId(null);
      window.speechSynthesis.speak(utterance);
      setSpeakingId(msgId);
    }
  };

  const handleDeleteMessage = (chatId: number, msgId: string) => {
    setChats((prevChats) =>
      prevChats.map((chat) => {
        if (chat.id === chatId) {
          return {
            ...chat,
            messages: chat.messages.filter((m) => m.id !== msgId),
          };
        }
        return chat;
      }),
    );
  };

  const handleEditMessage = (content: string) => {
    setInput(content);
  };

  const handleToggleFavorite = async (msg: Message) => {
    const isFav = favorites.some((f) => f.id === msg.id);
    if (isFav) {
      setFavorites(favorites.filter((f) => f.id !== msg.id));
    } else {
      const tempId = msg.id;
      // Add immediately with placeholder to feel responsive
      setFavorites((prev) => [
        ...prev,
        {
          id: tempId,
          title: "正在生成概括中...",
          desc: msg.content,
          tag: "未分类",
          folder: "全部收藏",
          createdAt: Date.now(),
        },
      ]);

      let finalTitle =
        msg.content.substring(0, 15) + (msg.content.length > 15 ? "..." : "");
      try {
        const res = await fetch("/api/generate-title", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ content: msg.content }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.title) {
            finalTitle = data.title;
          }
        }
      } catch (err) {
        console.error("Failed to generate title", err);
      }

      setFavorites((prev) =>
        prev.map((f) => (f.id === tempId ? { ...f, title: finalTitle } : f)),
      );
    }
  };

  const addHistoryItem = () => {
    const newId = Date.now();
    setChats([
      {
        id: newId,
        title: "新对话",
        messages: [
          {
            id: `msg-${newId}-start`,
            role: "assistant",
            content: "你好！我是智学助手 🎓\n\n有什么学习上的问题想和我聊聊吗？无论是具体的知识点、解题思路，还是学习规划方面的困惑，我都可以帮到你。",
          },
        ],
      },
      ...chats,
    ]);
    setActiveChatId(newId);
  };

  const deleteHistoryItem = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    const newChats = chats.filter((item) => item.id !== id);
    setChats(newChats);
    if (activeChatId === id) {
      setActiveChatId(newChats.length > 0 ? newChats[0].id : 0);
    }
  };

  const selectChat = (id: number) => {
    if (!isGenerating) {
      setActiveChatId(id);
    }
  };

  const handleSend = () => {
    if ((!input.trim() && stagedFiles.length === 0) || isGenerating || !activeChatId) return;

    const userMsg = input;
    const currentFiles = [...stagedFiles];
    setInput("");
    setStagedFiles([]);
    setIsGenerating(true);

    const userMsgId = `msg-${activeChatId}-${Date.now()}-user`;
    const aiMsgId = `msg-${activeChatId}-${Date.now()}-ai`;

    // Add user message & empty placeholder for AI
    setChats((prevChats) => {
      let found = false;
      const nextChats = prevChats.map((chat) => {
        if (chat.id === activeChatId) {
          found = true;
          const newMessages = [
            ...chat.messages,
            { id: userMsgId, role: "user" as const, content: userMsg, files: currentFiles },
            { id: aiMsgId, role: "assistant" as const, content: "" }
          ];
          let newTitle = chat.title;
          if (chat.title === "首次探索AI问答" || chat.title.includes("新对话")) {
             newTitle = userMsg.length > 10 ? userMsg.substring(0, 10) + "..." : (userMsg || "新对话");
          }
          return { ...chat, title: newTitle, messages: newMessages };
        }
        return chat;
      });
      if (!found) {
        return [{
          id: activeChatId,
          title: userMsg.length > 10 ? userMsg.substring(0, 10) + "..." : (userMsg || "新对话"),
          messages: [
            { id: userMsgId, role: "user" as const, content: userMsg, files: currentFiles },
            { id: aiMsgId, role: "assistant" as const, content: "" }
          ]
        }, ...nextChats];
      }
      return nextChats;
    });

    const callApi = async () => {
      let isFirstChunk = true;
      try {
        const activeChat = chats.find(c => c.id === activeChatId);
        const requestMessages = [...(activeChat?.messages || []), { role: "user", content: userMsg }].filter(m => !!m.content).map(m => ({ role: m.role, content: m.content }));
        const res = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ messages: requestMessages, userProfile })
        });
        
        if (!res.body) {
          setIsGenerating(false);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (let line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.substring(6));
                if (data.content !== undefined) {
                  setChats(prev => prev.map(chat => {
                    if (chat.id === activeChatId) {
                      return {
                        ...chat,
                        messages: chat.messages.map(m => m.id === aiMsgId ? { ...m, content: m.content + data.content } : m)
                      };
                    }
                    return chat;
                  }));
                }
                
                // Parse ability scores
                if (data.content && data.content.includes("```json")) {
                   // We will let a useEffect parse JSON blocks instead, or just assume the profile gets updated by AI via chat
                }

                if (data.done) {
                  setIsGenerating(false);
                  // Profile updates are now pushed in real-time via SSE (see UserContext)
                }
                if (data.error) {
                  setChats(prev => prev.map(chat => {
                    if (chat.id === activeChatId) {
                      return {
                        ...chat,
                        messages: chat.messages.map(m => m.id === aiMsgId ? { ...m, content: m.content + "\n\n**[Error]** " + data.error } : m)
                      };
                    }
                    return chat;
                  }));
                  throw new Error(data.error);
                }
              } catch (e) {}
            }
          }
        }
      } catch (e) {
        setIsGenerating(false);
      } finally {
        setIsGenerating(false);
      }
    };
    callApi();
  };

  const handleStop = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsGenerating(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Watch for new resource notifications from SSE
  useEffect(() => {
    const unread = notifications?.filter((n: any) => !n.read && n.type === "new_resources");
    if (unread && unread.length > 0) {
      setResourceToast(unread[0].message);
      setTimeout(() => {
        setResourceToast(null);
        markNotificationsRead();
      }, 6000);
    }
  }, [notifications]);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6">
      {/* Left Column: History Records */}
      <div
        className={cn(
          "bg-white/70 backdrop-blur-md rounded-3xl shadow-sm border border-slate-200/60 transition-all duration-300 flex flex-col overflow-hidden relative shrink-0",
          isSidebarOpen ? "w-64" : "w-16",
        )}
      >
        <div className="p-4 flex items-center justify-between border-b border-slate-100 shrink-0">
          {isSidebarOpen && (
            <div className="flex items-center gap-2 text-blue-600">
              <PenLine className="w-5 h-5" />
              <span className="font-bold text-[15px]">历史记录</span>
            </div>
          )}
          {isSidebarOpen && (
            <div className="flex items-center gap-3 text-slate-500">
              <Plus
                className="w-5 h-5 cursor-pointer hover:text-blue-600 transition-colors"
                onClick={addHistoryItem}
              />
              <Menu
                className="w-5 h-5 cursor-pointer hover:text-blue-600 transition-colors"
                onClick={() => setIsSidebarOpen(false)}
              />
            </div>
          )}
          {!isSidebarOpen && (
            <Menu
              className="w-5 h-5 cursor-pointer text-slate-500 mx-auto hover:text-blue-600 transition-colors"
              onClick={() => setIsSidebarOpen(true)}
            />
          )}
        </div>

        <div
          className="flex-1 overflow-y-auto p-4 cursor-pointer"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSidebarOpen) {
              setIsSidebarOpen(true);
            } else if (e.target === e.currentTarget && isSidebarOpen) {
              setIsSidebarOpen(false);
            }
          }}
        >
          {isSidebarOpen && (
            <div className="space-y-4 pointer-events-none">
              <div className="pointer-events-auto px-1">
                <div className="relative flex items-center">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3" />
                  <input
                    type="text"
                    placeholder="搜索历史记录..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all text-slate-700 placeholder-slate-400"
                  />
                </div>
              </div>

              <div className="text-xs text-slate-400 font-bold px-1">
                对话记录
              </div>

              <div className="pointer-events-auto space-y-1">
                {filteredChats.length > 0 ? (
                  filteredChats.map((chat) => (
                    <div
                      key={chat.id}
                      onClick={() => selectChat(chat.id)}
                      className={cn(
                        "w-full flex items-center justify-between p-3 rounded-xl border transition-all group cursor-pointer text-left",
                        activeChatId === chat.id
                          ? "bg-blue-50/50 border-blue-200 shadow-sm"
                          : "border-transparent hover:bg-slate-50 hover:border-slate-100",
                      )}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <MessageSquare
                          className={cn(
                            "w-4 h-4 shrink-0 transition-colors",
                            activeChatId === chat.id
                              ? "text-blue-500"
                              : "text-slate-400 group-hover:text-blue-500",
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <div
                            className={cn(
                              "text-sm truncate font-medium transition-colors",
                              activeChatId === chat.id
                                ? "text-blue-700"
                                : "text-slate-700 group-hover:text-blue-700",
                            )}
                          >
                            {chat.title}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={(e) => deleteHistoryItem(e, chat.id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-center text-slate-400 py-4">
                    无匹配的主要结果
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 shrink-0 flex flex-col gap-3">
          {isSidebarOpen ? (
            <>
              <button
                onClick={addHistoryItem}
                className="w-full bg-slate-800 hover:bg-slate-900 text-white flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                新建对话
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem('token');
                  localStorage.removeItem('currentUser');
                  setIsLoggedIn(false);
                }}
                className="w-full bg-white border border-slate-200 text-red-500 hover:bg-red-50 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                退出登录
              </button>
            </>
          ) : (
            <>
              <button
                onClick={addHistoryItem}
                className="w-full bg-slate-800 hover:bg-slate-900 text-white flex items-center justify-center py-3 rounded-xl text-sm font-medium transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem('token');
                  localStorage.removeItem('currentUser');
                  setIsLoggedIn(false);
                }}
                className="w-full bg-white border border-slate-200 text-red-500 hover:bg-red-50 flex items-center justify-center py-3 rounded-xl text-sm font-medium transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Middle Column: AI Chat Agent Area */}
      <div className="flex-1 bg-white/80 backdrop-blur-md rounded-3xl shadow-sm border border-slate-200/60 flex flex-col overflow-hidden min-w-0 relative">

        {/* Resource Generation Notification Toast */}
        {resourceToast && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-white/85 backdrop-blur-xl border border-indigo-200/40 px-4 py-2.5 rounded-2xl shadow-lg shadow-indigo-200/25 ring-1 ring-indigo-100/30 flex items-center gap-2.5 animate-in fade-in slide-in-from-top-4 cursor-pointer transition-all duration-300 hover:shadow-xl hover:shadow-indigo-200/35"
            onClick={() => {
              setResourceToast(null);
              markNotificationsRead();
              window.location.href = "/resources";
            }}
          >
            <div className="bg-gradient-to-br from-blue-400 to-indigo-500 p-1.5 rounded-xl shadow-sm shrink-0">
              <BookOpen className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-slate-800">学习资源已更新</span>
              <span className="text-xs text-slate-500">{resourceToast}</span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setResourceToast(null);
                markNotificationsRead();
              }}
              className="ml-1 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="px-6 py-4 border-b border-slate-100/60 shrink-0 flex items-center justify-between z-10">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-2.5 rounded-2xl border border-blue-100/50 shadow-sm">
              <PenLine className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-bold text-slate-800 tracking-tight">
                AI 问答智能体
              </h2>
            </div>
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 relative"
        >
          {/* Subtle background glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-50/50 rounded-full blur-3xl pointer-events-none -z-10"></div>

          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4 opacity-70">
              <div className="p-4 bg-white rounded-full shadow-sm border border-slate-100 mb-2">
                <Bot className="w-8 h-8 text-blue-400" />
              </div>
              <p className="text-slate-500 font-medium tracking-wide">
                点击左侧「新建对话」或发送消息开始与 AI 交流
              </p>
            </div>
          ) : (
            messages.map((msg, index) => {
              if (msg.role === "assistant" && !msg.content && (!msg.files || msg.files.length === 0)) return null;
              return (
              <div
                key={msg.id}
                className={`flex items-start gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""} group`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border overflow-hidden ${msg.role === "user" ? "bg-[#f2f2f2]" : "bg-blue-50 border-blue-200"}`}
                >
                  {msg.role === "user" ? (
                    userAvatar ? (
                      <img
                        src={userAvatar}
                        alt={userName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="w-4 h-4 text-slate-600" />
                    )
                  ) : (
                    <Bot className="w-4 h-4 text-blue-500" />
                  )}
                </div>
                <div
                  className={`flex flex-col gap-1 max-w-[75%] ${msg.role === "user" ? "items-end" : "items-start"}`}
                >
                  {msg.files && msg.files.length > 0 && (
                     <div className={`flex flex-wrap gap-2 mb-1 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                       {msg.files.map((file, idx) => {
                         const type = /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name) ? 'image' : 'doc';
                         return (
                         <div 
                           key={idx} 
                           onClick={() => setPreviewFile({ name: file.name, size: file.size, type })}
                           className="flex items-center gap-3 bg-white border border-slate-200/80 rounded-xl p-2.5 max-w-[240px] shadow-sm cursor-pointer hover:border-blue-300 hover:shadow-md transition-all"
                         >
                           <div className="bg-blue-50/70 p-2 rounded-lg border border-blue-50 shrink-0">
                             <Paperclip className="w-5 h-5 text-blue-500" />
                           </div>
                           <div className="min-w-0 flex-1">
                             <div className="text-xs font-semibold text-slate-700 truncate">{file.name}</div>
                             <div className="text-[10px] text-slate-400 font-medium">{(file.size / 1024).toFixed(1)} KB</div>
                           </div>
                         </div>
                       )})}
                     </div>
                  )}
                  {msg.content && (
                    <div
                      className={`p-4 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-[#f2f2f2] text-slate-800 rounded-2xl rounded-tr-sm shadow-sm"
                          : "bg-white border border-slate-200 text-slate-700 rounded-2xl rounded-tl-sm shadow-sm max-w-full"
                      }`}
                    >
                      {msg.role === "user" ? (
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      ) : (
                        <div className="markdown-body text-[15px] text-slate-800">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                            components={{
                              code({node, inline, className, children, ...props}: any) {
                                const match = /language-(\w+)/.exec(className || '');
                                return !inline && match ? (
                                  <SyntaxHighlighter
                                    {...props}
                                    style={vscDarkPlus as any}
                                    language={match[1]}
                                    PreTag="div"
                                    className="rounded-xl mx-0 my-2 shadow-sm text-[13px] custom-scrollbar"
                                  >
                                    {String(children).replace(/\n$/, '')}
                                  </SyntaxHighlighter>
                                ) : (
                                  <code {...props} className="bg-slate-100 text-rose-600 px-1 py-0.5 rounded-md font-mono text-[13px]">
                                    {children}
                                  </code>
                                )
                              }
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  )}
                  <div
                    className={`flex items-center gap-1 ${msg.role === "user" ? "flex-row-reverse opacity-0 group-hover:opacity-100 transition-opacity" : ""}`}
                  >
                    {msg.role === "assistant" ? (
                      <>
                        <button
                          onClick={() => handleCopy(msg.content)}
                          className="p-1.5 text-slate-400 hover:bg-white hover:text-blue-600 hover:shadow-sm transition-all rounded-lg"
                          title="复制文本"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleSpeak(msg.id, msg.content)}
                          className={`p-1.5 transition-all rounded-lg hover:bg-white hover:shadow-sm ${speakingId === msg.id ? "text-blue-600" : "text-slate-400 hover:text-blue-600"}`}
                          title={
                            speakingId === msg.id ? "停止朗读" : "语音朗读"
                          }
                        >
                          {speakingId === msg.id ? (
                            <VolumeX className="w-3.5 h-3.5" />
                          ) : (
                            <Volume2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => handleToggleFavorite(msg)}
                          className={`p-1.5 transition-all rounded-lg hover:bg-white hover:shadow-sm ${favorites.some((f) => f.id === msg.id) ? "text-amber-500 hover:text-amber-600" : "text-slate-400 hover:text-slate-600"}`}
                          title={
                            favorites.some((f) => f.id === msg.id)
                              ? "取消收藏"
                              : "收藏"
                          }
                        >
                          <Bookmark
                            className={`w-3.5 h-3.5 ${favorites.some((f) => f.id === msg.id) ? "fill-current" : ""}`}
                          />
                        </button>
                        <button
                          onClick={() =>
                            handleDeleteMessage(activeChatId, msg.id)
                          }
                          className="p-1.5 text-slate-400 hover:bg-white hover:text-red-500 hover:shadow-sm transition-all rounded-lg"
                          title="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleEditMessage(msg.content)}
                          className="p-1.5 text-slate-400 hover:bg-white hover:text-blue-600 hover:shadow-sm transition-all rounded-lg"
                          title="重新编辑"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() =>
                            handleDeleteMessage(activeChatId, msg.id)
                          }
                          className="p-1.5 text-slate-400 hover:bg-white hover:text-red-500 hover:shadow-sm transition-all rounded-lg"
                          title="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )})
          )}
          {isGenerating && activeChat?.messages && activeChat.messages.length > 0 && activeChat.messages[activeChat.messages.length - 1]?.content === "" && (
            <div className={`flex items-start gap-4`}>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border bg-blue-50 border-blue-200`}
              >
                <Bot className="w-4 h-4 text-blue-500" />
              </div>
              <div
                className={`max-w-[75%] p-4 text-sm leading-relaxed bg-white border border-slate-200 text-slate-700 rounded-2xl rounded-tl-sm shadow-sm flex gap-1 items-center`}
              >
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse delay-75"></span>
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse delay-150"></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {showScrollToBottom && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-[90px] left-1/2 -translate-x-1/2 bg-white text-slate-500 hover:text-blue-600 w-9 h-9 flex items-center justify-center rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.1)] border border-slate-200 transition-all z-20 animate-in fade-in zoom-in-95"
            title="滑到底部"
          >
            <ArrowDown className="w-5 h-5" />
          </button>
        )}

        <div className="p-4 shrink-0 bg-white/50 backdrop-blur-md border-t border-slate-100 z-10 relative">
          {stagedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {stagedFiles.map(file => (
                <div key={file.id} className="flex items-center gap-2 bg-white border border-slate-200 shadow-sm rounded-xl p-2 relative group animate-in slide-in-from-bottom-2">
                   <div className="bg-blue-50 p-2 rounded-lg border border-blue-100 flex-shrink-0">
                     <Paperclip className="w-5 h-5 text-blue-500" />
                   </div>
                   <div className="min-w-0 max-w-[150px] pr-4">
                     <div className="text-xs font-semibold text-slate-700 truncate">{file.name}</div>
                     <div className="text-[10px] text-slate-400">{(file.size / 1024).toFixed(1)} KB</div>
                   </div>
                   <button 
                     onClick={() => setStagedFiles(prev => prev.filter(f => f.id !== file.id))}
                     className="absolute -top-1.5 -right-1.5 bg-slate-100 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-full p-0.5 border border-slate-200 shadow-sm transition-colors opacity-0 group-hover:opacity-100"
                   >
                     <X className="w-3.5 h-3.5" />
                   </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center bg-white border border-slate-200/80 rounded-2xl p-2 gap-2 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] focus-within:ring-4 focus-within:ring-blue-50 focus-within:border-blue-300 transition-all duration-300">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              onChange={handleFileUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 text-slate-400 hover:text-blue-600 transition-colors rounded-xl hover:bg-white"
              title="上传附件"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <div className="flex-1 flex items-center">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="在此输入你要询问的问题..."
                className="w-full bg-transparent border-none focus:outline-none text-slate-700 placeholder:text-slate-400 px-2"
              />
            </div>
            <div className="flex items-center gap-1.5 pr-1">
              <button
                className="p-2 text-slate-400 hover:text-blue-600 transition-colors rounded-xl hover:bg-white"
                title="语音输入"
              >
                <Mic className="w-5 h-5" />
              </button>
              {isGenerating ? (
                <button
                  onClick={handleStop}
                  className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl flex items-center justify-center shadow-sm transition-colors border border-slate-200"
                  title="停止生成"
                >
                  <Square className="w-5 h-5" fill="currentColor" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!input.trim() && stagedFiles.length === 0}
                  className={`p-2.5 rounded-xl flex items-center justify-center shadow-sm transition-colors ${
                    input.trim() || stagedFiles.length > 0
                      ? "bg-blue-600 hover:bg-blue-700 text-white"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed"
                  }`}
                  title="发送"
                >
                  <Send className="w-5 h-5 ml-0.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Student Profile & Radar Chart */}
      <div className="w-80 shrink-0 flex flex-col gap-6 opacity-[0.98] hover:opacity-100 transition-opacity">
        {/* Region 1: Student Profile  */}
        <div className="bg-white/70 backdrop-blur-md rounded-3xl shadow-sm border border-slate-200/60 flex flex-col p-6 flex-1 w-full min-h-0">
          <h3 className="font-semibold text-slate-800 tracking-tight mb-5 flex items-center gap-2">
            <User className="w-4 h-4 text-blue-500" /> 用户画像
          </h3>
          <div className="flex-1 rounded-2xl bg-white/60 border border-slate-100/80 p-5 flex flex-col justify-center shadow-sm">
            {Object.keys(abilityScores).length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-4">
                <Bot className="w-8 h-8 text-slate-300" />
                <p className="text-[13px] text-slate-400 font-medium text-center">
                  完成首次对话后<br />AI 将为你生成专属画像
                </p>
              </div>
            ) : (
            <div className="flex flex-wrap justify-center gap-2.5">
              {abilityScores.knowledgeBase > 60 ? <span className="px-3.5 py-1.5 text-[13px] font-semibold rounded-xl bg-blue-50 text-blue-600 border border-blue-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)] cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:bg-blue-100 hover:border-blue-300 transition-all duration-300">基础扎实</span> : <span className="px-3.5 py-1.5 text-[13px] font-semibold rounded-xl bg-rose-50 text-rose-600 border border-rose-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)] cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:bg-rose-100 hover:border-rose-300 transition-all duration-300">基础薄弱</span>}
              {abilityScores.learningGoals > 70 ? <span className="px-3.5 py-1.5 text-[13px] font-semibold rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)] cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:bg-emerald-100 hover:border-emerald-300 transition-all duration-300">目标清晰</span> : null}
              {abilityScores.errorProneAreas < 60 ? <span className="px-3.5 py-1.5 text-[13px] font-semibold rounded-xl bg-[#f8fafc] text-slate-500 border border-slate-200/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)] cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:bg-slate-100 hover:border-slate-300 transition-all duration-300">计算易错</span> : null}
              <span className="px-3.5 py-1.5 text-[13px] font-semibold rounded-xl bg-sky-50 text-sky-600 border border-sky-200/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)] cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:bg-sky-100 hover:border-sky-300 transition-all duration-300">
                {userProfile?.cognitiveStyle ? `偏好：${userProfile.cognitiveStyle.substring(0,10)}` : "视觉型学习者"}
              </span>
              <span className="px-3.5 py-1.5 text-[13px] font-semibold rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)] cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:bg-indigo-100 hover:border-indigo-300 transition-all duration-300">
                {userProfile?.majorOrInterests ? userProfile.majorOrInterests.substring(0, 10) : "逻辑思维强"}
              </span>
            </div>
            )}
          </div>
        </div>

        {/* Region 2: ECharts Analysis */}
        <div className="bg-white/70 backdrop-blur-md rounded-3xl shadow-sm border border-slate-200/60 flex flex-col p-6 h-[340px] w-full shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800 tracking-tight flex items-center gap-2">
              <PenLine className="w-4 h-4 text-indigo-500" />
              {chartTab === "radar"
                ? "能力分析"
                : chartTab === "trend"
                  ? "近期学习趋势"
                  : "各科掌握程度"}
            </h3>
            <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
              <button
                onClick={() => setChartTab("radar")}
                className={cn(
                  "px-2.5 py-1 text-xs font-semibold rounded-md transition-colors",
                  chartTab === "radar"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50",
                )}
              >
                雷达图
              </button>
              <button
                onClick={() => setChartTab("trend")}
                className={cn(
                  "px-2.5 py-1 text-xs font-semibold rounded-md transition-colors",
                  chartTab === "trend"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50",
                )}
              >
                趋势
              </button>
              <button
                onClick={() => setChartTab("bar")}
                className={cn(
                  "px-2.5 py-1 text-xs font-semibold rounded-md transition-colors",
                  chartTab === "bar"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50",
                )}
              >
                掌握度
              </button>
            </div>
          </div>
          <div className="flex-1 w-full relative">
            {chartTab === "radar" && (
              <ReactECharts
                option={radarOption}
                style={{ height: "100%", width: "100%" }}
                onEvents={{
                  click: (e: any) => setChartDetail(`当前维度详情：${e.name}`),
                }}
              />
            )}
            {chartTab === "trend" && (
              <ReactECharts
                option={lineOption}
                style={{ height: "100%", width: "100%" }}
                onEvents={{
                  click: (e: any) => setChartDetail(`学习趋势节点：${e.name}`),
                }}
              />
            )}
            {chartTab === "bar" && (
              <ReactECharts
                option={barOption}
                style={{ height: "100%", width: "100%" }}
                onEvents={{
                  click: (e: any) => setChartDetail(`掌握程度数据：${e.name}`),
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* File Preview Modal */}
      {previewFile && (
        <div 
          className={`fixed inset-0 backdrop-blur-[8px] flex items-center justify-center z-[100] animate-in fade-in duration-200 ${previewFile.type === 'image' ? 'bg-black/90 p-0' : 'bg-slate-900/40 p-4 lg:p-10'}`}
          onClick={() => setPreviewFile(null)}
        >
          {previewFile.type === 'image' ? (
            <div className="relative w-full h-full flex flex-col items-center justify-center animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
               <div className="absolute top-0 inset-x-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/60 to-transparent z-10 text-white pointer-events-none">
                 <div className="flex flex-col ml-2">
                   <h3 className="font-medium text-lg blur-0 drop-shadow-md">{previewFile.name}</h3>
                   <p className="text-sm text-white/70 font-medium">预览 · {(previewFile.size / 1024).toFixed(1)} KB</p>
                 </div>
                 <button 
                   onClick={(e) => { e.stopPropagation(); setPreviewFile(null); }}
                   className="p-3 bg-black/20 hover:bg-white/20 text-white rounded-xl backdrop-blur-md transition-colors pointer-events-auto"
                 >
                   <X className="w-6 h-6" />
                 </button>
               </div>
               <img src={`https://images.unsplash.com/photo-1620121692029-d088224ddc74?auto=format&fit=crop&q=80&w=2000&h=1400`} alt={previewFile.name} className="w-full h-full object-contain" />
            </div>
          ) : (
          <div 
            className="w-full max-w-4xl h-full max-h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50 sticky top-0 z-10 shrink-0">
               <div className="flex items-center gap-3 relative">
                 <div className="bg-blue-100 p-2 rounded-lg shrink-0">
                   <Paperclip className="w-5 h-5 text-blue-600" />
                 </div>
                 <div className="min-w-0 pr-4">
                   <h3 className="font-bold text-slate-800 text-lg truncate max-w-sm" title={previewFile.name}>{previewFile.name}</h3>
                   <p className="text-xs text-slate-500 font-medium">预览 · {(previewFile.size / 1024).toFixed(1)} KB</p>
                 </div>
               </div>
               <button 
                 onClick={() => setPreviewFile(null)}
                 className="p-2 hover:bg-slate-200/50 text-slate-400 hover:text-slate-600 rounded-xl transition-colors"
               >
                 <X className="w-6 h-6" />
               </button>
            </div>
            
            <div className="overflow-auto flex-1 bg-slate-50 relative p-6 sm:p-10">
                <div className="max-w-3xl mx-auto bg-white p-8 sm:p-12 rounded-xl shadow-sm border border-slate-200 min-h-full">
                  <h1 className="text-3xl font-black text-slate-900 mb-6">{previewFile.name.replace(/\.[^/.]+$/, "")}</h1>
                  <div className="space-y-4 text-slate-700 leading-relaxed text-base sm:text-[17px]">
                    <p>这是一个模拟的文档预览。实际接入时，这里将展示完整解析后的 <strong>Markdown</strong> 或获取自后端的正文内容。</p>
                    <p>在本文档中，我们假设这包含了一些学习笔记、代码片段以及用户上传的重点资料：</p>
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 space-y-2 mt-4 font-mono">
                      <div><span className="text-blue-500 font-bold">1:</span> # {previewFile.name} 内容概要</div>
                      <div><span className="text-blue-500 font-bold">2:</span> </div>
                      <div><span className="text-blue-500 font-bold">3:</span> - 第一章：人工智能导论</div>
                      <div><span className="text-blue-500 font-bold">4:</span> - 第二章：机器学习基础原理</div>
                      <div><span className="text-blue-500 font-bold">5:</span> - 第三章：深度学习与神经网络架构</div>
                      <div><span className="text-blue-500 font-bold">6:</span> - 总结与复习提纲</div>
                    </div>
                    <p className="pt-4">支持滚动查看。这里填充一些占位文本以展示滚动效果和版式样式。</p>
                    {Array.from({length: 12}).map((_, i) => (
                      <p key={i} className="text-justify text-slate-600">
                        {i === 0 ? "人工智能（Artificial Intelligence, AI）是指由人制造出来的机器所表现出来的智能。通常人工智能是指通过普通计算机程序的手段实现的人类智能技术。" : "它通常涉及计算机科学、心理学、哲学和语言学等学科。可以说几率极高的应用场景都涉及到了这门学科。学习这些内容能够帮助我们更好地理解技术的底层。" }
                      </p>
                    ))}
                  </div>
                </div>
            </div>
          </div>
          )}
        </div>
      )}

      {/* Chart Detail Modal */}
      {chartDetail && (
        <div
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setChartDetail(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6 max-w-sm w-full transform transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-lg font-bold text-slate-800 mb-2">能力详情</h4>
            <p className="text-slate-600 mb-6">{chartDetail}</p>
            <button
              onClick={() => setChartDetail(null)}
              className="w-full py-2.5 bg-blue-50 text-blue-600 font-semibold rounded-xl hover:bg-blue-100 transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
