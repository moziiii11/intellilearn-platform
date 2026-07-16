import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';

export type Message = { id: string; role: "user" | "assistant"; content: string; files?: { name: string; size: number }[] };
export type Chat = { id: number; title: string; messages: Message[] };
export type Favorite = { id: string; title: string; desc: string; tag: string; folder: string; createdAt: number };

type UserContextType = {
  userName: string;
  setUserName: (name: string) => void;
  userAvatar: string | null;
  setUserAvatar: (avatar: string | null) => void;
  chats: Chat[];
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
  activeChatId: number;
  setActiveChatId: (id: number) => void;
  favorites: Favorite[];
  setFavorites: React.Dispatch<React.SetStateAction<Favorite[]>>;
  folders: string[];
  setFolders: React.Dispatch<React.SetStateAction<string[]>>;
  isLoggedIn: boolean;
  setIsLoggedIn: (value: boolean) => void;
  role: string;
  setRole: (role: string) => void;
  isAdmin: boolean;
  userProfile: any;
  setUserProfile: React.Dispatch<React.SetStateAction<any>>;
  fetchProfile: () => void;
  fetchAvatar: () => void;
  authHeaders: { Authorization: string };
  emitLearningEvent: (eventType: string, payload: Record<string, any>) => void;
  chapterProgress: any;
  setChapterProgress: React.Dispatch<React.SetStateAction<any>>;
  notifications: any[];
  setNotifications: React.Dispatch<React.SetStateAction<any[]>>;
  markNotificationsRead: () => void;
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem('token'));
  const [userName, setUserName] = useState(() => localStorage.getItem('currentUser') || "AI探险家");
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>(() => {
    try {
      const saved = localStorage.getItem('chats');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });
  const [activeChatId, setActiveChatId] = useState<number>(() => {
    const saved = localStorage.getItem('activeChatId');
    return saved ? parseInt(saved, 10) : 1;
  });
  const [folders, setFolders] = useState<string[]>(['全部收藏', '默认分类']);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [chapterProgress, setChapterProgress] = useState<any>({ chapters: [] });
  const [notifications, setNotifications] = useState<any[]>([]);
  const [role, setRole] = useState<string>(() => localStorage.getItem('role') || 'user');
  const isAdmin = role === 'admin';
  // Track which user's data is currently loaded to prevent cross-account leakage
  const [currentUser, setCurrentUser] = useState<string>(() => localStorage.getItem('currentUser') || '');
  // Ref for latest chats — used by beforeunload handler to guarantee flush
  const chatsRef = useRef<Chat[]>(chats);
  useEffect(() => { chatsRef.current = chats; }, [chats]);

  // Persist activeChatId to localStorage on change
  useEffect(() => {
    if (activeChatId && activeChatId !== 1) {
      localStorage.setItem('activeChatId', String(activeChatId));
    }
  }, [activeChatId]);

  const getToken = () => {
    const rawToken = localStorage.getItem('token') || '';
    try {
      if (rawToken && rawToken.startsWith('token_')) {
        const username = rawToken.replace('token_', '');
        return 'token_' + encodeURIComponent(username);
      }
    } catch(e) {}
    return encodeURIComponent(rawToken);
  };
  const authHeaders = { Authorization: `Bearer ${getToken()}` };

  // ============= Clear all user state (prevents cross-account data leakage) =============
  const clearAllState = () => {
    setChats([]);
    setActiveChatId(1);
    localStorage.removeItem('activeChatId');
    localStorage.removeItem('chats');
    setFavorites([]);
    setFolders(['全部收藏', '默认分类']);
    setUserProfile(null);
    setChapterProgress({ chapters: [] });
    setNotifications([]);
    setUserAvatar(null);
  };

  const fetchProfile = async () => {
    if (!isLoggedIn) return;
    try {
      const res = await fetch("/api/user-profile", { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setUserProfile(data);
        // 同时加载头像
        if (data.avatar) {
          setUserAvatar(data.avatar);
        }
      }
    } catch(e) {}
  };

  const fetchAvatar = async () => {
    if (!isLoggedIn) return;
    try {
      const res = await fetch("/api/user/avatar", { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        if (data.avatar) setUserAvatar(data.avatar);
      }
    } catch(e) {}
  };

  const fetchChats = async () => {
    if (!isLoggedIn) return;
    try {
      const res = await fetch("/api/chats", { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          setChats(data);
          // Restore last active chat if it still exists in loaded data
          const savedActiveId = localStorage.getItem('activeChatId');
          if (savedActiveId) {
            const parsedId = parseInt(savedActiveId, 10);
            if (data.some((c: Chat) => c.id === parsedId)) {
              setActiveChatId(parsedId);
              return;
            }
          }
          setActiveChatId(data[0].id);
          return;
        }
        // Server has no data — fall back to localStorage
        try {
          const localChats = localStorage.getItem('chats');
          if (localChats) {
            const parsed = JSON.parse(localChats);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setChats(parsed);
              const savedActiveId = localStorage.getItem('activeChatId');
              if (savedActiveId) {
                const parsedId = parseInt(savedActiveId, 10);
                if (parsed.some((c: Chat) => c.id === parsedId)) {
                  setActiveChatId(parsedId);
                  return;
                }
              }
              setActiveChatId(parsed[0].id);
              return;
            }
          }
        } catch {}
        // 新用户：创建欢迎对话（仅在本地，不发消息不存服务器）
        const welcomeChat: Chat = {
          id: Date.now(),
          title: "欢迎来到智慧优学",
          messages: [{
            id: `msg-welcome-${Date.now()}`,
            role: "assistant",
            content: "你好！我是智学助手 🎓\n\n在开始学习之前，我想先了解一下你的情况，这样才能为你定制专属的学习计划。\n\n**请告诉我：**\n- 你目前的学习阶段？（初中 / 高中 / 大学 / 在职学习）\n- 你想重点提升哪个学科或技能？\n- 你在学习中遇到的最大困难是什么？\n\n不用紧张，就像和朋友聊天一样，说说你的想法吧~",
          }],
        };
        setChats([welcomeChat]);
        setActiveChatId(welcomeChat.id);
      }
    } catch(e) {}
  };

  const fetchFavorites = async () => {
    if (!isLoggedIn) return;
    try {
      const res = await fetch("/api/favorites", { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setFavorites(data.favorites || []);
        if (data.folders && data.folders.length > 0) setFolders(data.folders);
      }
    } catch(e) {}
  };

  // ============= State lifecycle: clear on logout, fetch on login =============
  useEffect(() => {
    const storedUser = localStorage.getItem('currentUser') || '';
    if (isLoggedIn) {
      // Check if a DIFFERENT user logged in — clear old data first to prevent leakage
      if (storedUser && currentUser && storedUser !== currentUser) {
        clearAllState();
      }
      setCurrentUser(storedUser);
      // Always fetch fresh data for the logged-in user
      fetchChats();
      fetchFavorites();
      fetchProfile();
      fetchAvatar();
    } else {
      // User logged out — clear all state immediately
      clearAllState();
      setCurrentUser('');
    }
  }, [isLoggedIn]);

  // ============= Explicit save functions (replacing auto-sync effects) =============
  // Only save when explicitly called, preventing accidental cross-account data writes
  const saveChatsToServer = async (newChats: Chat[]) => {
    if (!isLoggedIn) return;
    try {
      await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(newChats),
      });
    } catch(e) {}
  };

  const saveFavoritesToServer = async (newFavorites: Favorite[], newFolders: string[]) => {
    if (!isLoggedIn) return;
    try {
      await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ favorites: newFavorites, folders: newFolders }),
      });
    } catch(e) {}
  };

  const saveProfileToServer = async (profile: any) => {
    if (!isLoggedIn || !profile) return;
    try {
      await fetch("/api/user-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(profile),
      });
    } catch(e) {}
  };

  // Auto-save chats: localStorage immediately (sync, survives refresh), server debounced 2s
  useEffect(() => {
    if (!isLoggedIn || chats.length === 0) return;
    const storedUser = localStorage.getItem('currentUser') || '';
    if (storedUser !== currentUser) return; // Safety: don't save if user mismatch
    // Write to localStorage synchronously — survives page refresh
    try { localStorage.setItem('chats', JSON.stringify(chats)); } catch {}
    // Also debounce server save for cross-device persistence
    const timer = setTimeout(() => saveChatsToServer(chats), 2000);
    return () => clearTimeout(timer);
  }, [chats]);

  // Guaranteed flush on page unload / tab hidden (beforeunload + visibilitychange)
  useEffect(() => {
    const flushChats = () => {
      const latestChats = chatsRef.current;
      if (!isLoggedIn || latestChats.length === 0) return;
      const storedUser = localStorage.getItem('currentUser') || '';
      if (storedUser !== currentUser) return;
      // Filter valid chats client-side (same logic as server POST /api/chats)
      const validChats = latestChats.filter(
        (c) => c.messages && c.messages.some((m) => m.role === 'user')
      );
      if (validChats.length === 0) return;
      // fetch with keepalive: true guarantees the request completes even on page unload
      fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify(validChats),
        keepalive: true,
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushChats();
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', flushChats);
    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', flushChats);
    };
  }, [isLoggedIn, currentUser]);

  // Auto-save favorites on change
  useEffect(() => {
    if (!isLoggedIn) return;
    const storedUser = localStorage.getItem('currentUser') || '';
    if (storedUser !== currentUser) return;
    const timer = setTimeout(() => saveFavoritesToServer(favorites, folders), 500);
    return () => clearTimeout(timer);
  }, [favorites, folders]);

  // ============= Learning Event Emitter (buffered, debounced) =============
  const eventBufferRef = useRef<{ eventType: string; payload: Record<string, any> }[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushEvents = async () => {
    if (eventBufferRef.current.length === 0) return;

    const events = [...eventBufferRef.current];
    eventBufferRef.current = [];
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    try {
      await fetch("/api/learning-events", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ events }),
      });
    } catch (e) {
      console.error("[LearningEvents] Failed to flush events:", e);
      // Re-queue on failure (up to buffer size limit)
      eventBufferRef.current = [...events, ...eventBufferRef.current].slice(0, 100);
    }
  };

  const emitLearningEvent = (eventType: string, payload: Record<string, any>) => {
    eventBufferRef.current.push({ eventType, payload });

    // Flush immediately if buffer reaches 10, otherwise debounce 2s
    if (eventBufferRef.current.length >= 10) {
      flushEvents();
    } else if (!flushTimerRef.current) {
      flushTimerRef.current = setTimeout(flushEvents, 2000);
    }
  };

  const markNotificationsRead = () => {
    setNotifications((prev: any[]) => prev.map((n: any) => ({ ...n, read: true })));
  };

  // Flush events on unmount
  useEffect(() => {
    return () => {
      flushEvents();
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, []);

  // ============= SSE Subscription for Real-Time Profile Updates =============
  const sseRef = useRef<EventSource | null>(null);

  const subscribeToProfileUpdates = () => {
    if (!isLoggedIn) return;

    // Close existing connection
    if (sseRef.current) {
      sseRef.current.close();
    }

    const rawToken = localStorage.getItem('token') || '';
    const tokenParam = encodeURIComponent(rawToken);
    const es = new EventSource(`/api/profile/stream?token=${tokenParam}`);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "profile_updated" && data.profile) {
          setUserProfile(data.profile);
          if (data.chapterProgress) setChapterProgress(data.chapterProgress);
          if (data.notifications) setNotifications(data.notifications);
          console.log("[Profile] Real-time update received at", data.timestamp);
        } else if (data.type === "profile_connected" && data.profile) {
          // Initial profile data on connection
          setUserProfile((prev: any) => prev || data.profile);
          if (data.chapterProgress) setChapterProgress(data.chapterProgress);
          if (data.notifications) setNotifications(data.notifications);
        }
      } catch (e) {
        // Ignore parse errors for keepalive comments
      }
    };

    es.onerror = () => {
      es.close();
      sseRef.current = null;
      // Reconnect after 5 seconds
      setTimeout(subscribeToProfileUpdates, 5000);
    };

    sseRef.current = es;
  };

  useEffect(() => {
    if (isLoggedIn) {
      subscribeToProfileUpdates();
    }
    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, [isLoggedIn]);

  return (
    <UserContext.Provider value={{ userName, setUserName, userAvatar, setUserAvatar, chats, setChats, activeChatId, setActiveChatId, favorites, setFavorites, folders, setFolders, isLoggedIn, setIsLoggedIn, role, setRole, isAdmin, userProfile, setUserProfile, fetchProfile, fetchAvatar, authHeaders, emitLearningEvent, chapterProgress, setChapterProgress, notifications, setNotifications, markNotificationsRead }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) throw new Error('useUser must be used within a UserProvider');
  return context;
}
