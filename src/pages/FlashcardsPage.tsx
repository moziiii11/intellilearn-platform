import React, { useState, useEffect, useCallback } from "react";
import {
  Layers, Sparkles, Search, Trash2, RotateCw,
  ChevronLeft, ChevronRight, CheckCircle2, BookOpen,
  Zap, Brain, Star, Filter, X,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useUser } from "../UserContext";
import { Flashcard, getDueCards, getDueStatus, processSM2 } from "../lib/sm2";
import { FlashcardGenerator } from "../components/flashcards/FlashcardGenerator";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

type ViewMode = "browse" | "review";

export default function FlashcardsPage() {
  const { authHeaders, emitLearningEvent } = useUser();
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("browse");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSource, setFilterSource] = useState("全部");
  const [showGenerator, setShowGenerator] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [previewCard, setPreviewCard] = useState<Flashcard | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 2500);
  };

  // Fetch flashcards
  const fetchCards = useCallback(async () => {
    try {
      const res = await fetch("/api/flashcards", { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setCards(data || []);
      }
    } catch (e) {} finally {
      setIsLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  const dueCards = getDueCards(cards);
  const status = getDueStatus(cards);
  const sources = ["全部", ...new Set(cards.map(c => c.source))];

  // Filtered cards for browse view
  const filteredCards = cards
    .filter(c => !searchQuery || c.front.includes(searchQuery) || c.back.includes(searchQuery))
    .filter(c => filterSource === "全部" || c.source === filterSource);

  const reviewCards = viewMode === "review" ? dueCards : [];

  // Review mode handlers
  const startReview = () => {
    if (dueCards.length === 0) {
      showToast("暂无待复习卡片，太棒了！🎉");
      return;
    }
    setCurrentIndex(0);
    setIsFlipped(false);
    setViewMode("review");
  };

  const handleRate = async (quality: number) => {
    if (currentIndex >= reviewCards.length) return;
    const card = reviewCards[currentIndex];
    const newSM2 = processSM2(card.sm2, quality);

    try {
      await fetch("/api/flashcards/review", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ cardId: card.id, quality }),
      });

      // Update local state
      setCards(prev => prev.map(c =>
        c.id === card.id ? { ...c, sm2: newSM2 } : c
      ));

      const labels = ["忘记", "困难", "良好", "", "简单"];
      const label = labels[quality] || "完成";
      showToast(`${label}！已安排下次复习`);
      emitLearningEvent("flashcard_review", { cardId: card.id, quality });

    } catch (e) {
      showToast("保存失败，请重试");
      return;
    }

    // Move to next card
    if (currentIndex + 1 >= reviewCards.length) {
      showToast("🎉 本轮复习完成！");
      setViewMode("browse");
    } else {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
    }
  };

  const handleDelete = async (cardId: string) => {
    try {
      await fetch(`/api/flashcards/${cardId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      setCards(prev => prev.filter(c => c.id !== cardId));
      showToast("已删除");
    } catch (e) {
      showToast("删除失败");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <RotateCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-6">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-slate-800 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-4 text-sm font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          {toastMessage}
        </div>
      )}

      {/* Generator Modal */}
      {showGenerator && (
        <FlashcardGenerator
          onClose={() => setShowGenerator(false)}
          onCardsCreated={() => { fetchCards(); showToast("闪卡已保存！"); }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Layers className="w-6 h-6 text-blue-500" />
            闪卡复习
          </h1>
          <p className="text-sm text-slate-500 mt-1">基于间隔重复算法，科学巩固知识</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowGenerator(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-medium text-sm shadow-sm shadow-blue-200 hover:shadow-md hover:shadow-blue-300 transition-all"
          >
            <Sparkles className="w-4 h-4" />
            AI 生成
          </button>
          <button
            onClick={startReview}
            disabled={dueCards.length === 0}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all",
              dueCards.length > 0
                ? "bg-red-500 text-white shadow-sm shadow-red-200 hover:bg-red-600"
                : "bg-slate-100 text-slate-400 cursor-not-allowed"
            )}
          >
            <Zap className="w-4 h-4" />
            {dueCards.length > 0 ? `开始复习 (${dueCards.length})` : "全部完成"}
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "待复习", value: status.dueCount, icon: Zap, color: "text-red-500", bg: "bg-red-50" },
          { label: "新卡片", value: status.newCount, icon: Brain, color: "text-blue-500", bg: "bg-blue-50" },
          { label: "已掌握", value: status.masteredCount, icon: Star, color: "text-emerald-500", bg: "bg-emerald-50" },
          { label: "总计", value: status.totalCount, icon: Layers, color: "text-indigo-500", bg: "bg-indigo-50" },
        ].map((stat, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", stat.bg)}>
              <stat.icon className={cn("w-5 h-5", stat.color)} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
              <p className="text-xs text-slate-500">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Review Mode */}
      {viewMode === "review" && reviewCards.length > 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          {/* Progress */}
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="font-medium">{currentIndex + 1}</span>
            <span>/</span>
            <span>{reviewCards.length}</span>
            <div className="w-32 h-1.5 bg-slate-200 rounded-full ml-2 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${((currentIndex + 1) / reviewCards.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Card */}
          <div
            className="relative w-full max-w-2xl h-80 cursor-pointer perspective-1000"
            onClick={() => setIsFlipped(!isFlipped)}
          >
            <div
              className={cn(
                "relative w-full h-full transition-transform duration-500 transform-style-3d",
                isFlipped ? "rotate-y-180" : ""
              )}
              style={{
                transformStyle: "preserve-3d",
                transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
              }}
            >
              {/* Front */}
              <div
                className="absolute inset-0 bg-white rounded-3xl border-2 border-slate-200 shadow-lg flex flex-col items-center justify-center p-8 backface-hidden"
                style={{ backfaceVisibility: "hidden" }}
              >
                <p className="text-sm text-slate-400 mb-4 font-medium">点击翻转查看答案</p>
                <p className="text-xl font-bold text-slate-800 text-center leading-relaxed">
                  {reviewCards[currentIndex]?.front}
                </p>
                <p className="text-xs text-slate-300 mt-6">
                  来源：{reviewCards[currentIndex]?.source}
                </p>
              </div>

              {/* Back */}
              <div
                className="absolute inset-0 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-3xl border-2 border-blue-200 shadow-lg flex flex-col items-center justify-center p-8 overflow-y-auto backface-hidden"
                style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
              >
                <p className="text-xs text-blue-400 mb-3 font-medium">答案解析</p>
                <div className="prose prose-sm max-w-none text-slate-700 text-center">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {reviewCards[currentIndex]?.back}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </div>

          {/* Rating Buttons */}
          <div className="flex gap-3">
            {[
              { quality: 0, label: "忘记", key: "Again", color: "bg-red-500 hover:bg-red-600 text-white", shortcut: "1" },
              { quality: 2, label: "困难", key: "Hard", color: "bg-orange-500 hover:bg-orange-600 text-white", shortcut: "2" },
              { quality: 3, label: "良好", key: "Good", color: "bg-blue-500 hover:bg-blue-600 text-white", shortcut: "3" },
              { quality: 5, label: "简单", key: "Easy", color: "bg-emerald-500 hover:bg-emerald-600 text-white", shortcut: "4" },
            ].map(btn => (
              <button
                key={btn.key}
                onClick={(e) => { e.stopPropagation(); handleRate(btn.quality); }}
                className={cn(
                  "px-6 py-3 rounded-2xl font-bold text-sm shadow-sm transition-all flex flex-col items-center gap-1 min-w-20",
                  btn.color
                )}
              >
                <span>{btn.label}</span>
                <span className="text-xs opacity-70">({btn.shortcut})</span>
              </button>
            ))}
          </div>

          <button
            onClick={() => setViewMode("browse")}
            className="text-sm text-slate-500 hover:text-slate-700 font-medium"
          >
            返回浏览模式
          </button>
        </div>
      )}

      {/* Browse Mode */}
      {viewMode === "browse" && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Toolbar */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜索卡片..."
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={filterSource}
                onChange={e => setFilterSource(e.target.value)}
                className="text-sm bg-white border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 text-slate-600"
              >
                {sources.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Card Grid */}
          {filteredCards.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4">
              <BookOpen className="w-16 h-16 opacity-30" />
              <div className="text-center">
                <p className="text-lg font-medium">暂无闪卡</p>
                <p className="text-sm mt-1">点击"AI 生成"创建你的第一组闪卡</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pr-1 pb-4">
              {filteredCards.map(card => (
                <div
                  key={card.id}
                  onClick={() => setPreviewCard(card)}
                  className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-blue-300 hover:shadow-md transition-all group cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") setPreviewCard(card); }}
                >
                  <p className="font-semibold text-slate-800 mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors">{card.front}</p>
                  <p className="text-sm text-slate-500 line-clamp-2 mb-3">{card.back.replace(/[#*`\[\]()]/g, "").substring(0, 120)}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                      {card.source}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-400">
                        间隔 {card.sm2.interval} 天
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(card.id); }}
                        className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>

      {/* Card Preview Modal */}
      {previewCard && (
        <div
          className="fixed inset-0 z-[120] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setPreviewCard(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h4 className="font-bold text-slate-800 flex items-center gap-2">
                卡片详情
              </h4>
              <button
                onClick={() => setPreviewCard(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              <div className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-200">
                <p className="text-xs font-bold text-blue-400 uppercase tracking-wide mb-3">📌 问题</p>
                <p className="text-lg font-bold text-slate-800 leading-relaxed">{previewCard.front}</p>
              </div>
              <div className="p-5 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border border-emerald-200">
                <p className="text-xs font-bold text-emerald-400 uppercase tracking-wide mb-3">💡 答案解析</p>
                <div className="prose prose-sm max-w-none text-slate-700">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {previewCard.back}
                  </ReactMarkdown>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span>来源：{previewCard.source}</span>
                <span>·</span>
                <span>间隔：{previewCard.sm2.interval} 天</span>
                <span>·</span>
                <span>复习 {previewCard.sm2.repetitions} 次</span>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
              <button
                onClick={() => setPreviewCard(null)}
                className="flex-1 px-4 py-2.5 rounded-xl text-slate-600 font-medium hover:bg-slate-200/50 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
