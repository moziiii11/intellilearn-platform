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
  userProfile: any;
  setUserProfile: React.Dispatch<React.SetStateAction<any>>;
  fetchProfile: () => void;
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
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<number>(1);
  const [folders, setFolders] = useState<string[]>(['全部收藏', '默认分类']);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [chapterProgress, setChapterProgress] = useState<any>({ chapters: [] });
  const [notifications, setNotifications] = useState<any[]>([]);

  const getToken = () => {
    const rawToken = localStorage.getItem('token') || '';
    // If the token contains non-ASCII characters directly, encode it to prevent network errors
    try {
      if (rawToken && rawToken.startsWith('token_')) {
        const username = rawToken.replace('token_', '');
        return 'token_' + encodeURIComponent(username);
      }
    } catch(e) {}
    return encodeURIComponent(rawToken);
  };
  const authHeaders = { Authorization: `Bearer ${getToken()}` };

  const fetchProfile = async () => {
    if (!isLoggedIn) return;
    try {
      const res = await fetch("/api/user-profile", { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setUserProfile(data);
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
          setActiveChatId(data[0].id);
        } else {
          setChats([]);
          setActiveChatId(1);
        }
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

  useEffect(() => {
    if (isLoggedIn) {
      fetchChats();
      fetchFavorites();
      fetchProfile();
    }
  }, [isLoggedIn]);

  // Synchronize state when it changes
  useEffect(() => {
    if (isLoggedIn && chats.length > 0) {
      fetch("/api/chats", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders }, body: JSON.stringify(chats) }).catch(() => {});
    }
  }, [chats, isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn) {
      fetch("/api/favorites", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders }, body: JSON.stringify({ favorites, folders }) }).catch(() => {});
    }
  }, [favorites, folders, isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn && userProfile) {
      fetch("/api/user-profile", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders }, body: JSON.stringify(userProfile) }).catch(() => {});
    }
  }, [userProfile, isLoggedIn]);

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
    <UserContext.Provider value={{ userName, setUserName, userAvatar, setUserAvatar, chats, setChats, activeChatId, setActiveChatId, favorites, setFavorites, folders, setFolders, isLoggedIn, setIsLoggedIn, userProfile, setUserProfile, fetchProfile, authHeaders, emitLearningEvent, chapterProgress, setChapterProgress, notifications, setNotifications, markNotificationsRead }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) throw new Error('useUser must be used within a UserProvider');
  return context;
}
