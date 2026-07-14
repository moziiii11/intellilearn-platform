import React, { useState, useMemo } from "react";
import { Sparkles, Loader2, Plus, X, Check, BookOpen, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";
import { useUser } from "../../UserContext";
import { createFlashcard } from "../../lib/sm2";

interface GeneratedCard {
  front: string;
  back: string;
}

interface Props {
  onClose: () => void;
  onCardsCreated: () => void;
}

interface TopicOption {
  label: string;
  source: string;   // e.g. "学习路径", "章节", "习题", "文档"
  icon: string;     // emoji
}

export function FlashcardGenerator({ onClose, onCardsCreated }: Props) {
  const { authHeaders, userProfile, chapterProgress } = useUser();
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [customTopic, setCustomTopic] = useState("");
  const [count, setCount] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCards, setGeneratedCards] = useState<GeneratedCard[]>([]);
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [showAllTopics, setShowAllTopics] = useState(false);
  const [previewCard, setPreviewCard] = useState<GeneratedCard | null>(null);

  // Build available topics from user data
  const topicOptions = useMemo<TopicOption[]>(() => {
    const options: TopicOption[] = [];
    const seen = new Set<string>();

    // From learning path
    const learningPath = userProfile?.learningPath || [];
    for (const phase of learningPath) {
      for (const item of (phase.items || [])) {
        const key = item.trim();
        if (key && !seen.has(key)) {
          seen.add(key);
          options.push({ label: key, source: "学习路径", icon: "🎯" });
        }
      }
    }

    // From chapter progress
    const chapters = chapterProgress?.chapters || [];
    for (const ch of chapters) {
      const key = ch.title?.trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        const icon = ch.status === "completed" ? "✅" : ch.status === "current" ? "📖" : "🔒";
        options.push({ label: key, source: "章节", icon });
      }
    }

    // From exercise categories
    const categories = userProfile?.resources?.exercises?.categories || [];
    for (const cat of categories) {
      const key = cat.name?.trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        options.push({ label: key, source: "习题", icon: "📝" });
      }
    }

    // From document titles
    const docs = userProfile?.resources?.docs || [];
    for (const doc of docs) {
      const key = doc.title?.trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        options.push({ label: key, source: "文档", icon: "📄" });
      }
    }

    return options;
  }, [userProfile, chapterProgress]);

  const suggestedTopic = userProfile?.majorOrInterests || "";

  const toggleTopic = (label: string) => {
    const next = new Set(selectedTopics);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    setSelectedTopics(next);
  };

  const handleGenerate = async () => {
    // Build topic string from selections
    const topicParts: string[] = [];
    if (selectedTopics.size > 0) {
      topicParts.push(...Array.from(selectedTopics));
    }
    if (customTopic.trim()) {
      topicParts.push(customTopic.trim());
    }
    // Fallback to suggested topic
    if (topicParts.length === 0 && suggestedTopic) {
      topicParts.push(suggestedTopic);
    }

    if (topicParts.length === 0) {
      setError("请至少选择一个学习主题，或输入自定义主题");
      return;
    }

    const genTopic = topicParts.join("、");

    setError("");
    setIsGenerating(true);
    setGeneratedCards([]);
    setSelectedCards(new Set());

    try {
      const docs = userProfile?.resources?.docs || [];
      const docSnippets = docs.slice(0, 3).map((d: any) =>
        (d.content || "").substring(0, 800)
      ).join("\n\n");

      const exercises = userProfile?.resources?.exercises;
      const exerciseTopics = exercises?.categories?.map((c: any) => c.name).join("、") || "";

      let contentContext = docSnippets;
      if (exerciseTopics) {
        contentContext += `\n\n已练习的知识分类：${exerciseTopics}`;
      }

      const learningPath = userProfile?.learningPath || [];
      if (learningPath.length > 0) {
        const currentPhase = learningPath.find((p: any) => p.status === "current");
        if (currentPhase) {
          contentContext += `\n\n当前学习阶段：${currentPhase.title}（${currentPhase.items?.join("、")}）`;
        }
      }

      const res = await fetch("/api/flashcards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ topic: genTopic, count, content: contentContext }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "生成失败");
      }

      const data = await res.json();
      if (data.cards && data.cards.length > 0) {
        setGeneratedCards(data.cards);
        setSelectedCards(new Set(data.cards.map((_: any, i: number) => i)));
      } else {
        setError("AI 未生成有效卡片，请重试");
      }
    } catch (e: any) {
      setError(e.message || "生成失败，请检查网络连接");
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleCard = (index: number) => {
    const next = new Set(selectedCards);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelectedCards(next);
  };

  const handleSave = async () => {
    if (selectedCards.size === 0) return;
    setIsSaving(true);

    const topicStr = selectedTopics.size > 0 ? Array.from(selectedTopics).join("、") : (customTopic || suggestedTopic);
    const cardsToSave = Array.from(selectedCards)
      .filter(i => i < generatedCards.length)
      .map(i => createFlashcard(generatedCards[i].front, generatedCards[i].back, `AI生成: ${topicStr}`));

    try {
      const res = await fetch("/api/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ cards: cardsToSave }),
      });
      if (res.ok) {
        onCardsCreated();
        onClose();
      } else {
        setError("保存失败");
      }
    } catch (e) {
      setError("保存失败，请检查网络连接");
    } finally {
      setIsSaving(false);
    }
  };

  const hasTopics = topicOptions.length > 0;
  const displayTopics = showAllTopics ? topicOptions : topicOptions.slice(0, 8);

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-500" />
            AI 生成闪卡
          </h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {generatedCards.length === 0 && (
            <div className="space-y-4">
              {/* Data sources indicator */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-xs font-bold text-blue-700 mb-2">📊 AI 将综合分析以下数据生成个性化闪卡：</p>
                <div className="grid grid-cols-2 gap-1.5 text-xs text-blue-600">
                  <span>📄 学习文档（{userProfile?.resources?.docs?.length || 0} 篇）</span>
                  <span>📝 习题数据（{userProfile?.resources?.exercises?.categories?.length || 0} 类）</span>
                  <span>📖 章节进度</span>
                  <span>❌ 错题记录</span>
                  <span>🎯 学习路径</span>
                  <span>📊 正确率分析</span>
                </div>
              </div>

              {/* Topic Checkboxes */}
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700">
                  选择学习主题（可多选）
                  {selectedTopics.size > 0 && (
                    <span className="ml-2 text-xs font-normal text-blue-600">已选 {selectedTopics.size} 项</span>
                  )}
                </label>

                {hasTopics ? (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-2 gap-1.5">
                      {displayTopics.map(opt => (
                        <button
                          key={opt.label}
                          onClick={() => toggleTopic(opt.label)}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-xl text-left text-sm transition-all border-2",
                            selectedTopics.has(opt.label)
                              ? "border-blue-400 bg-blue-50/50 shadow-sm"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          )}
                        >
                          <span className="text-base shrink-0">{opt.icon}</span>
                          <span className="flex-1 text-slate-700 truncate">{opt.label}</span>
                          {selectedTopics.has(opt.label) && (
                            <Check className="w-4 h-4 text-blue-500 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>

                    {topicOptions.length > 8 && (
                      <button
                        onClick={() => setShowAllTopics(!showAllTopics)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium mt-1"
                      >
                        {showAllTopics ? (
                          <><ChevronRight className="w-3.5 h-3.5 rotate-90" /> 收起</>
                        ) : (
                          <><ChevronDown className="w-3.5 h-3.5" /> 显示全部（共 {topicOptions.length} 项）</>
                        )}
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 bg-slate-50 rounded-xl p-3">
                    暂无学习数据，请先在"智能问答"中与 AI 对话，或在"学习资源"中完成学习
                  </p>
                )}
              </div>

              {/* Custom Topic */}
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700">
                  或自定义主题
                  <span className="ml-1 text-xs font-normal text-slate-400">（将追加到已选主题之后）</span>
                </label>
                <input
                  type="text"
                  value={customTopic}
                  onChange={e => setCustomTopic(e.target.value)}
                  placeholder={suggestedTopic ? `例如：${suggestedTopic}` : "输入你想学习的话题..."}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all text-slate-700 text-sm"
                  onKeyDown={e => e.key === "Enter" && handleGenerate()}
                />
              </div>

              {/* Count */}
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700">生成数量</label>
                <div className="flex gap-2">
                  {[5, 10, 15, 20].map(n => (
                    <button
                      key={n}
                      onClick={() => setCount(n)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                        count === n
                          ? "bg-blue-600 text-white shadow-sm"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      )}
                    >
                      {n} 张
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                  {error}
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-bold shadow-md shadow-blue-200 hover:shadow-lg hover:shadow-blue-300 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    AI 正在生成...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    开始生成
                  </>
                )}
              </button>
            </div>
          )}

          {/* Loading */}
          {isGenerating && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
              <p className="text-slate-500 font-medium">AI 正在分析知识点生成闪卡...</p>
              <p className="text-xs text-slate-400">这可能需要 10-30 秒</p>
            </div>
          )}

          {/* Results */}
          {generatedCards.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-800">
                  已生成 {generatedCards.length} 张卡片
                </h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedCards(new Set(generatedCards.map((_, i) => i)))}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    全选
                  </button>
                  <button
                    onClick={() => setSelectedCards(new Set())}
                    className="text-xs text-slate-500 hover:text-slate-700 font-medium"
                  >
                    取消全选
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-400">👆 点击卡片查看内容 · 点击圆圈选中 / 取消</p>

              <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                {generatedCards.map((card, idx) => (
                  <div
                    key={idx}
                    onClick={() => setPreviewCard(card)}
                    className={cn(
                      "group w-full text-left p-4 rounded-xl border-2 cursor-pointer transition-all duration-200",
                      "hover:shadow-md",
                      selectedCards.has(idx)
                        ? "border-blue-500 bg-blue-50 shadow-sm ring-2 ring-blue-200"
                        : "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50"
                    )}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter") setPreviewCard(card); }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox circle: click to toggle selection */}
                      <div
                        onClick={(e) => { e.stopPropagation(); toggleCard(idx); }}
                        className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-all duration-200 border-2",
                          "hover:scale-110 active:scale-90",
                          selectedCards.has(idx)
                            ? "bg-blue-500 border-blue-500 text-white"
                            : "bg-slate-100 border-slate-300 text-slate-400 group-hover:border-blue-400"
                        )}
                        title={selectedCards.has(idx) ? "取消选中" : "选中此卡片"}
                        role="button"
                      >
                        {selectedCards.has(idx) ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                      </div>
                      {/* Card content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 mb-1 group-hover:text-blue-600 transition-colors">
                          {card.front}
                        </p>
                        <p className="text-xs text-slate-500 line-clamp-2">
                          {card.back.replace(/[#*`\[\]()\n]/g, " ").substring(0, 100)}
                        </p>
                      </div>
                      {selectedCards.has(idx) && (
                        <span className="text-xs font-medium text-blue-500 bg-blue-100 px-2 py-0.5 rounded-full shrink-0">
                          已选
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

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
              {/* Preview Header */}
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h4 className="font-bold text-slate-800 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-500" />
                  卡片预览
                </h4>
                <button
                  onClick={() => setPreviewCard(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Preview Body */}
              <div className="p-6 overflow-y-auto flex-1 space-y-5">
                {/* Front */}
                <div className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-200">
                  <p className="text-xs font-bold text-blue-400 uppercase tracking-wide mb-3">📌 问题</p>
                  <p className="text-lg font-bold text-slate-800 leading-relaxed">
                    {previewCard.front}
                  </p>
                </div>

                {/* Back */}
                <div className="p-5 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border border-emerald-200">
                  <p className="text-xs font-bold text-emerald-400 uppercase tracking-wide mb-3">💡 答案解析</p>
                  <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {previewCard.back}
                  </div>
                </div>
              </div>

              {/* Preview Footer */}
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

        {/* Footer */}
        {generatedCards.length > 0 && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-slate-600 font-medium hover:bg-slate-200/50 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={selectedCards.size === 0 || isSaving}
              className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm shadow-blue-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <BookOpen className="w-4 h-4" />
                  保存 {selectedCards.size} 张卡片
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
