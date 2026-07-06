import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Timer, Play, Pause, SkipForward, RotateCcw,
  X, Volume2, Coffee, Brain, Moon, Settings, Check, Minus, Plus,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useUser } from "../UserContext";

const DEFAULT_DURATIONS = { focus: 25, shortBreak: 5, longBreak: 15 };
const MIN_MINUTES = 1;
const MAX_MINUTES = 120;

type SessionType = "focus" | "shortBreak" | "longBreak";

interface SessionConfig {
  duration: number;
  label: string;
  icon: React.ReactNode;
}

function loadDurations(): Record<SessionType, number> {
  try {
    const saved = localStorage.getItem("pomodoro_durations");
    if (saved) return { ...DEFAULT_DURATIONS, ...JSON.parse(saved) };
  } catch {}
  return { ...DEFAULT_DURATIONS };
}

function saveDurations(d: Record<SessionType, number>) {
  try { localStorage.setItem("pomodoro_durations", JSON.stringify(d)); } catch {}
}

const ICONS: Record<SessionType, React.ReactNode> = {
  focus: <Brain className="w-4 h-4" />,
  shortBreak: <Coffee className="w-4 h-4" />,
  longBreak: <Moon className="w-4 h-4" />,
};

const LABELS: Record<SessionType, string> = {
  focus: "专注",
  shortBreak: "短休",
  longBreak: "长休",
};

const WHITE_NOISE_OPTIONS = [
  { id: "none", label: "无" },
  { id: "rain", label: "🌧️ 雨声" },
  { id: "cafe", label: "☕ 咖啡馆" },
  { id: "fire", label: "🔥 篝火" },
  { id: "white", label: "📡 白噪音" },
];

export default function PomodoroTimer() {
  const { authHeaders, emitLearningEvent } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const [sessionType, setSessionType] = useState<SessionType>("focus");
  const [durations, setDurations] = useState<Record<SessionType, number>>(loadDurations);
  const [isEditing, setIsEditing] = useState(false);

  const sessionDuration = durations[sessionType] * 60; // 秒
  const [timeLeft, setTimeLeft] = useState(sessionDuration);
  const [isRunning, setIsRunning] = useState(false);
  const [whiteNoise, setWhiteNoise] = useState("none");
  const [todaySessions, setTodaySessions] = useState(0);
  const [toastMessage, setToastMessage] = useState("");

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimestampRef = useRef<number>(0);
  const totalDurationRef = useRef(sessionDuration);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionTypeRef = useRef<SessionType>("focus");
  const isRunningRef = useRef(false);

  // Keep refs in sync
  useEffect(() => { sessionTypeRef.current = sessionType; }, [sessionType]);
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);

  const totalSeconds = sessionDuration;
  const progress = ((totalSeconds - timeLeft) / totalSeconds) * 100;
  const circumference = 2 * Math.PI * 90;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3000);
  };

  // Define stopTimer first
  const stopTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
  };

  // Define handleSessionComplete before it's used
  const handleSessionComplete = async () => {
    const type = sessionTypeRef.current;
    const duration = durations[type];
    setTodaySessions(prev => prev + 1);
    showToast(`🎉 ${LABELS[type]}完成！(${duration}分钟)`);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    try {
      await fetch("/api/pomodoro-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ duration: Math.round(duration), type, completed: true }),
      });
    } catch (e) {}

    emitLearningEvent("pomodoro_complete", { duration, type, completed: true });

    setTimeLeft(durations.shortBreak * 60);
    setSessionType("shortBreak");
    setIsRunning(false);
  };

  // Timer tick function (uses refs to avoid stale closures)
  const tick = () => {
    const elapsed = Math.floor((Date.now() - startTimestampRef.current) / 1000);
    const remaining = Math.max(0, totalDurationRef.current - elapsed);
    setTimeLeft(remaining);
    if (remaining <= 0) {
      stopTimer();
      handleSessionComplete();
    }
  };

  const startTimer = () => {
    if (isRunningRef.current) return;
    startTimestampRef.current = Date.now();
    totalDurationRef.current = sessionDuration;
    setIsRunning(true);
    intervalRef.current = setInterval(tick, 500);
  };

  // Adjust timer when switching session type while not running
  useEffect(() => {
    if (!isRunning) {
      setTimeLeft(sessionDuration);
    }
  }, [sessionType, isRunning]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Handle visibility change (tab switch)
  useEffect(() => {
    const handleVisibility = () => {
      if (!isRunningRef.current || document.hidden) return;
      const elapsed = Math.floor((Date.now() - startTimestampRef.current) / 1000);
      const remaining = Math.max(0, totalDurationRef.current - elapsed);
      setTimeLeft(remaining);
      if (remaining <= 0) {
        stopTimer();
        handleSessionComplete();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const handleSkip = async () => {
    stopTimer();
    const duration = sessionDuration / 60;
    try {
      await fetch("/api/pomodoro-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ duration: Math.round(duration), type: sessionType, completed: false }),
      });
    } catch (e) {}
    setTimeLeft(sessionDuration);
    showToast("已跳过当前番茄钟");
  };

  const handleReset = () => {
    stopTimer();
    setTimeLeft(sessionDuration);
  };

  const handleToggle = () => {
    if (isRunning) {
      stopTimer();
    } else {
      startTimer();
    }
  };

  const handleWhiteNoise = (id: string) => {
    setWhiteNoise(id);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (id !== "none") {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const bufferSize = 2 * audioCtx.sampleRate;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * 0.1;
        }
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = 0.3;
        source.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        source.start();
        audioRef.current = { pause: () => { source.stop(); audioCtx.close(); } } as any;
      } catch (e) {}
    }
  };

  return (
    <>
      {/* Mini Button in layout header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "relative flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-all",
          isRunning
            ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
            : "bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200"
        )}
        title="番茄钟"
      >
        <Timer className="w-4 h-4" />
        {isRunning ? (
          <span className="hidden lg:inline">{formatTime(timeLeft)}</span>
        ) : (
          <span className="hidden lg:inline">番茄钟</span>
        )}
        {isRunning && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
        )}
      </button>

      {/* Popover Panel — Portal 到 body 避免 header backdrop-filter 截断 fixed 定位 */}
      {isOpen && createPortal(
        <div className="fixed inset-0 z-[90]" onClick={() => setIsOpen(false)}>
          <div
            className="absolute top-16 right-6 z-[91] bg-white rounded-3xl shadow-xl border border-slate-200 w-[360px] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Timer className="w-5 h-5 text-red-500" /> 番茄钟
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 flex flex-col items-center gap-5">
              {/* Circular Progress */}
              <div className="relative w-48 h-48">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 200 200">
                  <circle cx="100" cy="100" r="90" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                  <circle
                    cx="100" cy="100" r="90" fill="none"
                    stroke={isRunning ? "#ef4444" : "#3b82f6"}
                    strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    className="transition-all duration-500"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-bold text-slate-800 tabular-nums tracking-tight">
                    {formatTime(timeLeft)}
                  </span>
                  <span className="text-xs text-slate-400 mt-1">
                    {isRunning ? "进行中..." : "准备就绪"}
                  </span>
                </div>
              </div>

              {/* Mode Selector */}
              <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                {(Object.keys(LABELS) as SessionType[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => { if (!isRunning) setSessionType(key); }}
                    disabled={isRunning}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all",
                      sessionType === key
                        ? "bg-white text-slate-800 shadow-sm ring-1 ring-slate-900/5"
                        : "text-slate-500 hover:text-slate-700",
                      isRunning && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {ICONS[key]}
                    <span>{LABELS[key]}</span>
                    <span className="text-[10px] opacity-60">{durations[key]}min</span>
                  </button>
                ))}
              </div>

              {/* Custom Time Editor */}
              <div className="w-full">
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  disabled={isRunning}
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-medium transition-colors mx-auto",
                    isEditing
                      ? "text-blue-600"
                      : "text-slate-400 hover:text-slate-600",
                    isRunning && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <Settings className="w-3.5 h-3.5" />
                  {isEditing ? "完成设置" : "自定义时长"}
                </button>

                {isEditing && (
                  <div className="mt-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-150">
                    {(Object.keys(LABELS) as SessionType[]).map((key) => (
                      <div key={key} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
                        <div className="flex items-center gap-2 text-sm text-slate-700">
                          {ICONS[key]}
                          <span className="font-medium">{LABELS[key]}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              const v = Math.max(MIN_MINUTES, durations[key] - 5);
                              const updated = { ...durations, [key]: v };
                              setDurations(updated);
                              saveDurations(updated);
                              if (sessionType === key && !isRunning) setTimeLeft(v * 60);
                            }}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-10 text-center text-sm font-bold text-slate-800 tabular-nums">
                            {durations[key]}
                          </span>
                          <button
                            onClick={() => {
                              const v = Math.min(MAX_MINUTES, durations[key] + 5);
                              const updated = { ...durations, [key]: v };
                              setDurations(updated);
                              saveDurations(updated);
                              if (sessionType === key && !isRunning) setTimeLeft(v * 60);
                            }}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-[10px] text-slate-400 w-8 text-right">分钟</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleReset}
                  className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                  title="重置"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
                <button
                  onClick={handleToggle}
                  className={cn(
                    "w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all",
                    isRunning
                      ? "bg-amber-100 text-amber-600 hover:bg-amber-200 shadow-amber-200/50"
                      : "bg-red-500 text-white hover:bg-red-600 shadow-red-200/50"
                  )}
                >
                  {isRunning ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
                </button>
                <button
                  onClick={handleSkip}
                  className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                  title="跳过"
                >
                  <SkipForward className="w-5 h-5" />
                </button>
              </div>

              {/* White Noise Selector */}
              <div className="w-full">
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-2">
                  <Volume2 className="w-3.5 h-3.5" /> 背景音
                </label>
                <div className="flex gap-1 flex-wrap">
                  {WHITE_NOISE_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => handleWhiteNoise(opt.id)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-medium transition-all",
                        whiteNoise === opt.id
                          ? "bg-blue-50 text-blue-600 border border-blue-200"
                          : "bg-slate-50 text-slate-500 border border-slate-100 hover:bg-slate-100"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Session Counter */}
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>今日已完成</span>
                <span className="font-bold text-slate-700">{todaySessions}</span>
                <span>个番茄 🍅</span>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
