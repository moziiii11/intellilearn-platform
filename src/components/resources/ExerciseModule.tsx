import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  CheckCircle2,
  XCircle,
  ArrowLeft,
  BookOpen,
  PenTool,
  Bookmark,
  Trash2,
  Filter,
  ListTodo,
  ChevronRight,
  FolderOpen,
  X,
  Sparkles,
  Loader2,
  Brain,
  Target,
  FileText,
  RotateCcw,
} from "lucide-react";
import { useUser } from "../../UserContext";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Question = {
  id: string;
  categoryId: string;
  type: string;
  difficulty: "易" | "中" | "难";
  title: string;
  options: string[];
  answer: number;
  analysis: string;
};

export function ExerciseModule() {
  const { userProfile, emitLearningEvent } = useUser();
  const mockCategories = userProfile?.resources?.exercises?.categories || [];
  const mockQuestions: Question[] = userProfile?.resources?.exercises?.questions || [];
  
  const [view, setView] = useState<"categories" | "list" | "doing" | "wrong">("categories");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  
  const [currentQIndex, setCurrentQIndex] = useState(0);
  
  // States for answering
  const [answerHistory, setAnswerHistory] = useState<Record<string, number>>({});
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  
  // Wrong Book: maps question id to error info
  const [wrongBook, setWrongBook] = useState<Record<string, { q: Question; errCount: number }>>({});
  
  const [toast, setToast] = useState("");

  // Filters for exercise list
  const [diffFilter, setDiffFilter] = useState<string>("全部");

  // Filters for wrong book
  const [wrongTypeFilter, setWrongTypeFilter] = useState<string>("全部");
  const [wrongDiffFilter, setWrongDiffFilter] = useState<string>("全部");
  const [wrongCategoryId, setWrongCategoryId] = useState<string | null>(null);

  // States for test and fullscreen
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [selectedTestCategories, setSelectedTestCategories] = useState<string[]>([]);
  const [testQuestions, setTestQuestions] = useState<Question[]>([]);
  const [isTestMode, setIsTestMode] = useState(false);
  const [fullscreenWrongQ, setFullscreenWrongQ] = useState<{ q: Question; errCount: number } | null>(null);

  // ===== 智能复习状态 =====
  const [reviewView, setReviewView] = useState<"extracting" | "selecting" | "generating" | "doing" | "result" | null>(null);
  const [knowledgePoints, setKnowledgePoints] = useState<any[]>([]);
  const [selectedKPs, setSelectedKPs] = useState<string[]>([]);
  const [kpSummary, setKpSummary] = useState("");
  const [reviewQuestions, setReviewQuestions] = useState<Question[]>([]);
  const [reviewPaperTitle, setReviewPaperTitle] = useState("");
  const [reviewAnswers, setReviewAnswers] = useState<Record<string, number>>({});
  const [reviewResult, setReviewResult] = useState<any>(null);
  const [reviewReport, setReviewReport] = useState<{
    summaryReport?: string;
    weakPointAnalysis?: string;
    solutionApproaches?: string;
    reviewSuggestions?: string;
  } | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  // ===== 历史记录状态 =====
  const [historyView, setHistoryView] = useState<"list" | "detail" | null>(null);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [historyDetail, setHistoryDetail] = useState<any>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [expandedGroupDetail, setExpandedGroupDetail] = useState<any>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [deleteConfirmGroup, setDeleteConfirmGroup] = useState<any>(null);
  const finishingRef = useRef(false); // 防重复提交

  // ===== 从服务端加载错题本（带重试）=====
  const token = localStorage.getItem("token") || "";
  useEffect(() => {
    if (!token) return;
    let retries = 0;
    const maxRetries = 3;
    const tryFetch = () => {
      fetch("/api/wrong-book", { headers: { Authorization: `Bearer ${token}` } })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(data => {
          if (data && typeof data === "object") {
            setWrongBook(data as Record<string, { q: Question; errCount: number }>);
            console.log(`[WrongBook] Loaded ${Object.keys(data).length} records from server`);
          }
        })
        .catch((err) => {
          retries++;
          if (retries < maxRetries) {
            console.warn(`[WrongBook] Load failed (attempt ${retries}/${maxRetries}), retrying...`, err.message);
            setTimeout(tryFetch, 1000 * retries);
          } else {
            console.error("[WrongBook] Failed to load after 3 attempts:", err.message);
            showToast("加载错题本失败，请检查网络连接");
          }
        });
    };
    tryFetch();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived state
  const displayedQuestions = useMemo(() => {
    let q = mockQuestions.filter(q => activeCategoryId === null || q.categoryId === activeCategoryId);
    if (diffFilter !== "全部") {
      q = q.filter(item => item.difficulty === diffFilter);
    }
    return q;
  }, [activeCategoryId, diffFilter]);
  
  // Paging mock
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 4;
  const totalPages = Math.ceil(displayedQuestions.length / pageSize);
  const pagedQuestions = displayedQuestions.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const doingQuestions = isTestMode ? testQuestions : displayedQuestions;
  const q = doingQuestions[currentQIndex];
  const isAnswered = q && answerHistory[q.id] !== undefined;
  
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const handleSubmit = () => {
    if (selectedOption === null || !q) return;
    
    // Save to history
    setAnswerHistory(prev => ({
      ...prev,
      [q.id]: selectedOption
    }));
    
    // Check if wrong
    const isCorrect = selectedOption === q.answer;
    if (!isCorrect) {
      setWrongBook(prev => {
        const existing = prev[q.id];
        const newErrCount = existing ? existing.errCount + 1 : 1;
        const newEntry = { q, errCount: newErrCount };
        // 同步保存到服务端（带重试和错误提示）
        const saveWithRetry = (attempt: number) => {
          fetch("/api/wrong-book/save", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ questionId: q.id, question: q, errCount: newErrCount }),
          }).then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          }).catch((err) => {
            if (attempt < 2) {
              console.warn(`[WrongBook] Save failed (attempt ${attempt + 1}/3), retrying...`, err.message);
              setTimeout(() => saveWithRetry(attempt + 1), 1000 * (attempt + 1));
            } else {
              console.error("[WrongBook] Save failed after 3 attempts:", err.message);
              showToast("错题保存失败，请检查网络连接（重试3次仍失败）");
            }
          });
        };
        saveWithRetry(0);
        return { ...prev, [q.id]: newEntry };
      });
    }

    // Emit learning behavior event
    const categoryName = mockCategories.find(c => c.id === q.categoryId)?.name || "";
    emitLearningEvent("exercise_answer", {
      questionId: q.id,
      categoryId: q.categoryId,
      categoryName,
      correct: isCorrect,
      selectedOption,
      correctOption: q.answer,
      difficulty: q.difficulty,
      questionTitle: q.title.substring(0, 100),
    });
  };

  const nextQ = () => {
    if (currentQIndex < doingQuestions.length - 1) {
      const nextIdx = currentQIndex + 1;
      setCurrentQIndex(nextIdx);
      const nextQId = doingQuestions[nextIdx].id;
      setSelectedOption(answerHistory[nextQId] !== undefined ? answerHistory[nextQId] : null);
    }
  };

  // ===== 智能复习处理器 =====

  const handleStartReview = async () => {
    const allWrongRecords = Object.values(wrongBook);
    if (allWrongRecords.length === 0) {
      showToast("暂无错题记录，无需复习！");
      return;
    }

    setReviewLoading(true);
    setReviewView("extracting");
    try {
      const res = await fetch("/api/wrong-book/extract-knowledge-points", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ wrongQuestions: allWrongRecords }),
      });
      const text = await res.text();
      console.log("[ReviewDebug] Status:", res.status, "Body:", text.substring(0, 500));
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`服务器返回非JSON (状态码${res.status}): ${text.substring(0, 200)}`);
      }
      if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
      setKnowledgePoints(data.knowledgePoints || []);
      setKpSummary(data.summary || "");
      setSelectedKPs((data.knowledgePoints || []).map((kp: any) => kp.id));
      setReviewView("selecting");
    } catch (e: any) {
      showToast("考点提取失败：" + e.message);
      setReviewView(null);
    } finally {
      setReviewLoading(false);
    }
  };

  const handleGeneratePaper = async () => {
    if (selectedKPs.length === 0) {
      showToast("请至少选择一个考点");
      return;
    }

    const selectedKPsData = knowledgePoints.filter(kp => selectedKPs.includes(kp.id));
    const allWrongRecords = Object.values(wrongBook);

    setReviewLoading(true);
    setReviewView("generating");
    try {
      const res = await fetch("/api/wrong-book/generate-review-paper", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          selectedKnowledgePoints: selectedKPsData,
          wrongQuestions: allWrongRecords,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "试卷生成失败");
      setReviewPaperTitle(data.paperTitle || "专项复习试卷");
      setReviewQuestions(data.questions || []);
      setReviewAnswers({});
      setCurrentQIndex(0);
      setReviewView("doing");
    } catch (e: any) {
      showToast("试卷生成失败：" + e.message);
      setReviewView("selecting");
    } finally {
      setReviewLoading(false);
    }
  };

  const handleSubmitReviewAnswer = (questionId: string) => {
    if (selectedOption === null) return;
    setReviewAnswers(prev => ({ ...prev, [questionId]: selectedOption }));
  };

  const handleFinishReview = async () => {
    if (finishingRef.current) return; // 防重复提交
    finishingRef.current = true;
    const selectedKPsData = knowledgePoints.filter(kp => selectedKPs.includes(kp.id));
    setReviewLoading(true);
    try {
      const res = await fetch("/api/wrong-book/analyze-results", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          answers: reviewAnswers,
          questions: reviewQuestions,
          selectedKnowledgePoints: selectedKPsData,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "分析失败");
      setReviewResult(data.grading);
      setReviewReport(data.report);
      setReviewView("result");

      // 自动保存到历史记录
      const selectedKPsForHistory = knowledgePoints.filter(kp => selectedKPs.includes(kp.id));
      fetch("/api/review-history", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          paperTitle: reviewPaperTitle,
          totalCount: data.grading.totalCount,
          correctCount: data.grading.correctCount,
          wrongCount: data.grading.wrongCount,
          accuracy: data.grading.accuracy,
          questions: reviewQuestions,
          answers: reviewAnswers,
          grading: data.grading,
          report: data.report,
          knowledgePoints: selectedKPsForHistory,
        }),
      }).catch(() => {/* 静默失败 */});
    } catch (e: any) {
      showToast("结果分析失败：" + e.message);
    } finally {
      setReviewLoading(false);
      finishingRef.current = false;
    }
  };

  const resetReview = () => {
    finishingRef.current = false;
    setReviewView(null);
    setKnowledgePoints([]);
    setSelectedKPs([]);
    setKpSummary("");
    setReviewQuestions([]);
    setReviewPaperTitle("");
    setReviewAnswers({});
    setReviewResult(null);
    setReviewReport(null);
    setCurrentQIndex(0);
    setSelectedOption(null);
    setHistoryView(null);
    setHistoryDetail(null);
  };

  // ===== 历史记录处理器 =====
  const fetchHistoryList = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/review-history", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载失败");
      setHistoryList(data);
      setHistoryView("list");
    } catch (e: any) {
      showToast("加载历史记录失败：" + e.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchHistoryDetail = async (id: string) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/review-history/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载失败");
      setHistoryDetail(data);
      setHistoryView("detail");
    } catch (e: any) {
      showToast("加载详情失败：" + e.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  const redoHistoryWrongQuestions = (record: any) => {
    const wrongQs = (record.questions || []).filter((q: Question) => {
      const userAns = record.answers?.[q.id];
      return userAns !== undefined && userAns !== q.answer;
    });
    if (wrongQs.length === 0) {
      showToast("该记录中没有错题！");
      return;
    }
    setReviewPaperTitle(`${record.paperTitle}（错题重做）`);
    setReviewQuestions(wrongQs);
    setReviewAnswers({});
    setCurrentQIndex(0);
    setSelectedOption(null);
    setReviewView("doing");
    setHistoryView(null);
    setHistoryDetail(null);
  };

  const printHistoryPDF = (record: any) => {
    const wrongQs = (record.questions || []).filter((q: Question) => {
      const userAns = record.answers?.[q.id];
      return userAns !== undefined && userAns !== q.answer;
    });

    const printWindow = window.open("", "_blank", "width=800,height=600");
    if (!printWindow) { showToast("请允许弹窗以导出PDF"); return; }

    const dateStr = new Date(record.date).toLocaleString("zh-CN");
    const wrongRows = wrongQs.map((q: Question, idx: number) => {
      const userAns = record.answers?.[q.id];
      return `
        <div style="margin-bottom:20px;padding:15px;border:1px solid #e5e7eb;border-radius:12px;page-break-inside:avoid;">
          <h4 style="margin:0 0 8px 0;color:#1e293b;">${idx + 1}. ${q.title}</h4>
          <p style="margin:4px 0;color:#64748b;font-size:13px;">
            你的答案: <b style="color:#e11d48;">${userAns >= 0 ? String.fromCharCode(65 + userAns) : "未作答"}</b> &nbsp;|&nbsp;
            正确答案: <b style="color:#059669;">${String.fromCharCode(65 + q.answer)}</b> &nbsp;|&nbsp;
            难度: ${q.difficulty}
          </p>
          <div style="margin-top:8px;padding:10px;background:#f8fafc;border-radius:8px;font-size:13px;color:#475569;">
            <b>解析：</b>${q.analysis}
          </div>
        </div>
      `;
    }).join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>错题导出 - ${record.paperTitle}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 700px; margin: 40px auto; padding: 20px; color: #1e293b; }
        h1 { font-size: 24px; margin-bottom: 4px; }
        h2 { font-size: 16px; color: #64748b; font-weight: normal; margin-bottom: 24px; }
        .stats { display: flex; gap: 16px; margin-bottom: 24px; }
        .stat { padding: 12px 20px; border-radius: 12px; text-align: center; }
        @media print { body { margin: 20px; } }
      </style></head><body>
      <h1>📋 ${record.paperTitle} — 错题导出</h1>
      <h2>${dateStr} &nbsp;|&nbsp; 共${record.totalCount}题 &nbsp;|&nbsp; 正确率${record.accuracy}%</h2>
      <div class="stats">
        <div class="stat" style="background:#f0fdf4;color:#059669;">✅ 正确 ${record.correctCount}</div>
        <div class="stat" style="background:#fef2f2;color:#e11d48;">❌ 错误 ${record.wrongCount}</div>
      </div>
      <h3 style="margin-top:24px;">错题列表（${wrongQs.length}题）</h3>
      ${wrongRows}
      <script>setTimeout(() => window.print(), 300);</script>
      </body></html>
    `);
    printWindow.document.close();
  };

  // ===== 历史记录合并逻辑 =====
  const getMergeKey = (r: any) => {
    const kps = (r.knowledgePoints || []).slice().sort().join("|");
    return `${r.paperTitle || ""}|||${kps}`;
  };

  const groupedHistory = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const r of historyList) {
      const key = getMergeKey(r);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    return Array.from(groups.entries()).map(([, records]) => {
      const sorted = records.sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      const best = sorted.reduce((a, b) => a.accuracy >= b.accuracy ? a : b);
      return {
        groupId: sorted[0].id,
        ids: sorted.map(r => r.id),
        paperTitle: best.paperTitle,
        knowledgePoints: best.knowledgePoints,
        accuracy: best.accuracy,
        latestDate: sorted[0].date,
        attemptCount: sorted.length,
        totalCount: best.totalCount,
        correctCount: best.correctCount,
        wrongCount: best.wrongCount,
        records: sorted,
      };
    });
  }, [historyList]);

  const handleOpenGroupDetail = async (group: any) => {
    // Toggle collapse if already expanded
    if (expandedGroupId === group.groupId) {
      setExpandedGroupId(null);
      setExpandedGroupDetail(null);
      return;
    }
    // Expand: fetch detail
    setExpandedGroupId(group.groupId);
    setExpandedLoading(true);
    try {
      const bestIdx = group.records.findIndex((r: any) => r.accuracy === group.accuracy);
      const bestId = group.ids[bestIdx >= 0 ? bestIdx : 0];
      const res = await fetch(`/api/review-history/${bestId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const detail = await res.json();
      if (!res.ok) throw new Error(detail.error || "加载失败");
      setExpandedGroupDetail(detail);
    } catch (e: any) {
      showToast("加载详情失败：" + e.message);
      setExpandedGroupId(null);
    } finally {
      setExpandedLoading(false);
    }
  };

  const deleteBatchGroup = async (group: any) => {
    setDeleteConfirmGroup(group);
  };

  const confirmDeleteGroup = async () => {
    const group = deleteConfirmGroup;
    setDeleteConfirmGroup(null);
    if (!group) return;
    try {
      const res = await fetch("/api/review-history/batch", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: group.ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "批量删除失败");
      // Remove all from local list
      const idSet = new Set(group.ids);
      setHistoryList(prev => prev.filter(r => !idSet.has(r.id)));
      showToast(`已删除 ${data.deletedCount || group.attemptCount} 条记录`);
    } catch (e: any) {
      showToast("批量删除失败：" + e.message);
    }
  };

  const exportGroupPDF = (group: any) => {
    // Collect all wrong questions from all attempts, deduplicate by question ID
    const seen = new Set<string>();
    const allWrongQs: { q: Question; userAnswer: number; attemptDate: string }[] = [];
    for (const record of group.records) {
      const wrongQs = (record.questions || []).filter((q: Question) => {
        const userAns = record.answers?.[q.id];
        return userAns !== undefined && userAns !== q.answer;
      });
      for (const q of wrongQs) {
        // Dedup by question ID — keep the earliest attempt's wrong answer
        if (!seen.has(q.id)) {
          seen.add(q.id);
          allWrongQs.push({
            q,
            userAnswer: record.answers?.[q.id],
            attemptDate: record.date,
          });
        }
      }
    }

    const printWindow = window.open("", "_blank", "width=800,height=600");
    if (!printWindow) { showToast("请允许弹窗以导出PDF"); return; }

    const latestDateStr = new Date(group.latestDate).toLocaleString("zh-CN");
    const wrongRows = allWrongQs.map((item, idx: number) => `
      <div style="margin-bottom:20px;padding:15px;border:1px solid #e5e7eb;border-radius:12px;page-break-inside:avoid;">
        <h4 style="margin:0 0 8px 0;color:#1e293b;">${idx + 1}. ${item.q.title}</h4>
        <p style="margin:4px 0;color:#64748b;font-size:13px;">
          你的答案: <b style="color:#e11d48;">${item.userAnswer >= 0 ? String.fromCharCode(65 + item.userAnswer) : "未作答"}</b> &nbsp;|&nbsp;
          正确答案: <b style="color:#059669;">${String.fromCharCode(65 + item.q.answer)}</b> &nbsp;|&nbsp;
          难度: ${item.q.difficulty}
        </p>
        <div style="margin-top:8px;padding:10px;background:#f8fafc;border-radius:8px;font-size:13px;color:#475569;">
          <b>解析：</b>${item.q.analysis}
        </div>
      </div>
    `).join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>错题导出 - ${group.paperTitle}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 700px; margin: 40px auto; padding: 20px; color: #1e293b; }
        h1 { font-size: 24px; margin-bottom: 4px; }
        h2 { font-size: 16px; color: #64748b; font-weight: normal; margin-bottom: 24px; }
        .stats { display: flex; gap: 16px; margin-bottom: 24px; }
        .stat { padding: 12px 20px; border-radius: 12px; text-align: center; }
        @media print { body { margin: 20px; } }
      </style></head><body>
      <h1>📋 ${group.paperTitle} — 错题导出</h1>
      <h2>${latestDateStr} &nbsp;|&nbsp; 共作答 ${group.attemptCount} 次 &nbsp;|&nbsp; 最高正确率 ${group.accuracy}%</h2>
      <div class="stats">
        <div class="stat" style="background:#f0fdf4;color:#059669;">✅ 去重错题 ${allWrongQs.length} 道</div>
        <div class="stat" style="background:#fef2f2;color:#e11d48;">📝 共作答 ${group.attemptCount} 次</div>
      </div>
      <h3 style="margin-top:24px;">错题列表（${allWrongQs.length}题）</h3>
      ${wrongRows}
      <script>setTimeout(() => window.print(), 300);</script>
      </body></html>
    `);
    printWindow.document.close();
  };

  const renderCategories = () => (
    <div className="h-full flex flex-col pt-2 relative">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-slate-800">章节归类</h2>
        <div className="flex gap-3">
          <button
             onClick={() => setIsTestModalOpen(true)}
             className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl font-medium flex items-center gap-2 hover:bg-blue-100 transition-colors shadow-sm"
          >
             <ListTodo className="w-4 h-4" /> 模拟自测
          </button>
          <button
            onClick={() => setView("wrong")}
            className="px-4 py-2 bg-rose-50 text-rose-600 rounded-xl font-medium flex items-center gap-2 hover:bg-rose-100 transition-colors shadow-sm"
          >
            <BookOpen className="w-4 h-4" /> 我的错题本 ({Object.keys(wrongBook).length})
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {mockCategories.map((cat) => {
          const count = mockQuestions.filter(q => q.categoryId === cat.id).length;
          return (
            <div 
              key={cat.id} 
              onClick={() => {
                setActiveCategoryId(cat.id);
                setCurrentPage(1);
                setDiffFilter("全部");
                setView("list");
              }}
              className="bg-white border border-slate-200 p-6 rounded-2xl hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group flex flex-col gap-4"
            >
              <div className="flex justify-between items-center">
                 <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                    <FolderOpen className="w-6 h-6" />
                 </div>
                 <span className="text-slate-400 bg-slate-50 px-3 py-1 rounded-full text-xs font-bold border border-slate-100 group-hover:bg-white transition-colors">{count} 题</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{cat.name}</h3>
                <p className="text-sm text-slate-500 mt-1">点击查看本章精选习题</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  );

  const renderList = () => {
    const catName = mockCategories.find(c => c.id === activeCategoryId)?.name || "全部习题";
    
    return (
      <div className="h-full flex flex-col pt-2 relative">
        {toast && (
          <div className="absolute top-0 right-1/2 translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm z-50 shadow-lg animate-in fade-in slide-in-from-top-2">
            {toast}
          </div>
        )}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => setView("categories")}
            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-slate-800">{catName}</h2>
          </div>
          
          <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
             <span className="text-xs text-slate-500 font-bold px-2 flex items-center gap-1"><Filter className="w-3 h-3"/> 难度筛选</span>
             {["全部", "易", "中", "难"].map(f => (
               <button 
                 key={f} 
                 onClick={() => { setDiffFilter(f); setCurrentPage(1); }}
                 className={`px-3 py-1 text-sm font-medium rounded-lg transition-colors ${diffFilter === f ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
               >
                 {f}
               </button>
             ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-max items-start content-start">
          {pagedQuestions.length === 0 ? (
            <div className="md:col-span-2 py-20 text-center text-slate-500 font-medium bg-slate-50 rounded-3xl border border-slate-200 border-dashed animate-in fade-in">
              暂无匹配的题目
            </div>
          ) : pagedQuestions.map((item, idx) => {
            const historyAns = answerHistory[item.id];
            const isDone = historyAns !== undefined;
            const isCorrect = isDone && historyAns === item.answer;

            return (
              <div
                key={item.id}
                className="p-5 bg-white border border-slate-200 rounded-2xl hover:border-blue-400 hover:shadow-md transition-all flex flex-col gap-3 min-h-[160px] animate-in fade-in"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">
                      {item.type}
                    </span>
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded-lg ${
                        item.difficulty === "易"
                          ? "text-emerald-700 bg-emerald-50 border border-emerald-100"
                          : item.difficulty === "中"
                            ? "text-orange-700 bg-orange-50 border border-orange-100"
                            : "text-rose-700 bg-rose-50 border border-rose-100"
                      }`}
                    >
                      {item.difficulty}
                    </span>
                    
                    {isDone && (
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg flex items-center gap-1 ${isCorrect ? 'text-emerald-700 bg-emerald-50 border border-emerald-100' : 'text-rose-700 bg-rose-50 border border-rose-100'}`}>
                         {isCorrect ? <CheckCircle2 className="w-3.5 h-3.5"/> : <XCircle className="w-3.5 h-3.5"/>}
                         {isCorrect ? '已做对' : '已做错'}
                      </span>
                    )}
                  </div>
                </div>
                
                <h4 className="font-semibold text-slate-800 leading-relaxed text-[15px] flex-1">
                  {item.title}
                </h4>
                
                <div className="pt-3 flex justify-end">
                  <button
                    onClick={() => {
                      const absoluteIndex = displayedQuestions.findIndex(q => q.id === item.id);
                      setCurrentQIndex(absoluteIndex);
                      setView("doing");
                      setSelectedOption(answerHistory[item.id] !== undefined ? answerHistory[item.id] : null);
                    }}
                    className={`px-4 py-2 font-bold text-sm rounded-xl transition-colors flex items-center gap-1.5 ${isDone ? 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200' : 'bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white border border-transparent'}`}
                  >
                    {isDone ? '查看作答' : '开始做题'} <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        
        {totalPages > 1 && (
          <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between items-center shrink-0">
            <span className="text-sm text-slate-500 font-medium">第 {currentPage} / {totalPages} 页</span>
            <div className="flex gap-2">
               <button 
                 disabled={currentPage === 1}
                 onClick={() => setCurrentPage(p => p - 1)}
                 className="px-4 py-2 border border-slate-200 bg-white text-slate-600 font-medium text-sm rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
               >
                 上一页
               </button>
               <button 
                 disabled={currentPage === totalPages}
                 onClick={() => setCurrentPage(p => p + 1)}
                 className="px-4 py-2 border border-slate-200 bg-white text-slate-600 font-medium text-sm rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
               >
                 下一页
               </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderDoing = () => (
    <div className="h-full flex flex-col relative max-w-3xl mx-auto w-full pt-4">
      {toast && (
        <div className="absolute top-4 right-4 bg-emerald-50 border border-emerald-200 text-emerald-600 px-4 py-2 rounded-xl text-sm font-bold z-10 shadow-sm animate-in fade-in slide-in-from-top-2">
          {toast}
        </div>
      )}

      <button
        onClick={() => {
          if (isTestMode) setIsTestMode(false);
          setView(isTestMode ? "categories" : "list");
        }}
        className="flex items-center gap-2 text-slate-500 hover:text-blue-600 font-medium mb-6 transition-colors w-fit"
      >
        <ArrowLeft className="w-4 h-4" /> {isTestMode ? "返回章节" : "返回题目列表"}
      </button>

      {q && (
        <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm flex-1 flex flex-col overflow-y-auto w-full">
          <div className="flex items-center gap-3 mb-6">
            <span className="bg-blue-50 text-blue-600 font-bold px-3 py-1 rounded-lg text-sm">
              {q.type}
            </span>
            <span className="text-slate-400 font-medium text-sm">
              题目 {currentQIndex + 1} / {doingQuestions.length}
            </span>
            {isAnswered && (
               <span className="ml-auto text-xs font-bold text-slate-400 flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-50 border border-slate-100">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" /> 保留作答痕迹
               </span>
            )}
          </div>

          <h2 className="text-xl font-bold text-slate-800 mb-8 leading-relaxed">
            {q.title}
          </h2>

          <div className="space-y-4 mb-8">
            {q.options.map((opt, i) => {
              const isSelected = selectedOption === i;
              const isCorrect = isAnswered && i === q.answer;
              const isWrongSelected = isAnswered && isSelected && i !== q.answer;

              let btnClass = "w-full text-left p-4 rounded-xl border-2 transition-all flex items-center justify-between ";
              if (!isAnswered) {
                btnClass += isSelected
                  ? "border-blue-500 bg-blue-50/50"
                  : "border-slate-100 hover:border-slate-300 bg-slate-50";
              } else {
                if (isCorrect)
                  btnClass += "border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm";
                else if (isWrongSelected)
                  btnClass += "border-rose-400 bg-rose-50 text-rose-800 shadow-sm";
                else btnClass += "border-slate-100 bg-slate-50 opacity-50";
              }

              return (
                <button
                  key={i}
                  disabled={isAnswered}
                  onClick={() => setSelectedOption(i)}
                  className={btnClass}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm transition-colors ${
                        !isAnswered
                          ? isSelected
                            ? "bg-blue-600 text-white border border-blue-600"
                            : "bg-white border border-slate-200 text-slate-500"
                          : isCorrect
                            ? "bg-emerald-500 text-white border border-emerald-500"
                            : isWrongSelected
                              ? "bg-rose-500 text-white border border-rose-500"
                              : "bg-white border border-slate-200 text-slate-400"
                      }`}
                    >
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="font-medium text-[15px]">{opt}</span>
                  </div>
                  {isAnswered && isCorrect && (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  )}
                  {isAnswered && isWrongSelected && (
                    <XCircle className="w-5 h-5 text-rose-500" />
                  )}
                </button>
              );
            })}
          </div>

          {isAnswered && (
            <div className="mt-4 p-6 bg-slate-50 border border-slate-200 rounded-2xl animate-in fade-in slide-in-from-bottom-4 shadow-sm">
              <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-500"/>
                答案与解析
              </h4>
              <div className="text-slate-600 leading-relaxed text-[15px]">
                正确答案是 <span className="font-bold text-emerald-600 px-1 bg-emerald-100/50 rounded">{String.fromCharCode(65 + q.answer)}</span>。
                <div className="markdown-body text-[14px] mt-2">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{q.analysis}</ReactMarkdown>
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap justify-end gap-3 shrink-0">
            <button
              onClick={() => {
                if (isTestMode) setIsTestMode(false);
                setView(isTestMode ? "categories" : "list");
              }}
              className="px-8 py-3 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl font-bold transition-colors shadow-sm"
            >
              返回列表
            </button>
            {!isAnswered ? (
              <button
                onClick={handleSubmit}
                disabled={selectedOption === null}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_12px_rgba(37,99,235,0.2)]"
              >
                提交答案
              </button>
            ) : currentQIndex < doingQuestions.length - 1 ? (
              <button
                onClick={nextQ}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors shadow-[0_4px_12px_rgba(37,99,235,0.2)]"
              >
                下一题
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );

  const renderWrongBook = () => {
    // Collect all wrong records
    let allWrongRecords: { q: Question; errCount: number }[] = Object.values(wrongBook);

    // ===== 智能复习视图 =====
    if (reviewView) {
      // 加载中视图
      if (reviewView === "extracting" || reviewView === "generating") {
        return (
          <div className="h-full flex flex-col pt-2 max-w-3xl mx-auto w-full">
            <div className="flex items-center gap-4 mb-6">
              <button
                onClick={resetReview}
                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-xl font-bold text-slate-800">
                {reviewView === "extracting" ? "正在分析考点..." : "正在生成试卷..."}
              </h2>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
              <div className="w-20 h-20 rounded-2xl bg-blue-50 flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-slate-700 font-bold text-lg mb-2">
                  {reviewView === "extracting" ? "AI 正在分析错题知识点" : "AI 正在生成针对性试卷"}
                </p>
                <p className="text-slate-500 text-sm">
                  {reviewView === "extracting"
                    ? "正在读取所有错题，智能提取核心考点..."
                    : "根据您选择的考点，生成专属复习试卷..."}
                </p>
              </div>
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        );
      }

      // 考点选择视图
      if (reviewView === "selecting") {
        return (
          <div className="h-full flex flex-col pt-2 max-w-3xl mx-auto w-full">
            {toast && (
              <div className="absolute top-0 right-1/2 translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm z-50 shadow-lg animate-in fade-in slide-in-from-top-2">
                {toast}
              </div>
            )}
            <div className="flex items-center gap-4 mb-4">
              <button
                onClick={resetReview}
                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Brain className="w-5 h-5 text-blue-500" />
                  选择复习考点
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  AI 已从 {Object.keys(wrongBook).length} 道错题中提取出 {knowledgePoints.length} 个考点
                </p>
              </div>
            </div>

            {kpSummary && (
              <div className="mb-5 p-4 bg-blue-50 border border-blue-200 rounded-2xl">
                <p className="text-sm text-blue-800 font-medium flex items-start gap-2">
                  <Sparkles className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{kpSummary}</span>
                </p>
              </div>
            )}

            <div className="flex-1 overflow-y-auto pr-2">
              <div className="mb-4 flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded accent-blue-600"
                    checked={selectedKPs.length === knowledgePoints.length}
                    onChange={e => {
                      if (e.target.checked) setSelectedKPs(knowledgePoints.map((kp: any) => kp.id));
                      else setSelectedKPs([]);
                    }}
                  />
                  <span className="text-sm font-bold text-slate-600">全选</span>
                </label>
                <span className="text-xs text-slate-400">已选 {selectedKPs.length}/{knowledgePoints.length} 个考点</span>
              </div>

              <div className="space-y-3">
                {knowledgePoints.map((kp: any) => {
                  const isSelected = selectedKPs.includes(kp.id);
                  return (
                    <label
                      key={kp.id}
                      className={`flex items-start gap-4 p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                        isSelected
                          ? "border-blue-400 bg-blue-50/50 shadow-sm"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4 mt-0.5 rounded accent-blue-600"
                        checked={isSelected}
                        onChange={e => {
                          if (e.target.checked) setSelectedKPs([...selectedKPs, kp.id]);
                          else setSelectedKPs(selectedKPs.filter(id => id !== kp.id));
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <h4 className="font-bold text-slate-800 text-[15px]">{kp.name}</h4>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
                            kp.difficulty === "易" ? "text-emerald-700 bg-emerald-50 border border-emerald-100" :
                            kp.difficulty === "中" ? "text-orange-700 bg-orange-50 border border-orange-100" :
                            "text-rose-700 bg-rose-50 border border-rose-100"
                          }`}>
                            {kp.difficulty}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            关联 {kp.questionIds?.length || 0} 道错题
                          </span>
                          <span className="flex items-center gap-1">
                            <XCircle className="w-3 h-3 text-rose-400" />
                            累计错误 {kp.errorCount || 0} 次
                          </span>
                          <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-500">
                            {kp.categoryName}
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-200 flex justify-end gap-3 shrink-0">
              <button
                onClick={resetReview}
                className="px-6 py-2.5 bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl font-bold transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleGeneratePaper}
                disabled={selectedKPs.length === 0 || reviewLoading}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-bold flex items-center gap-2 hover:from-blue-600 hover:to-blue-700 transition-all shadow-[0_4px_12px_rgba(59,130,246,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Target className="w-4 h-4" />
                生成专项试卷
              </button>
            </div>
          </div>
        );
      }

      // 做题视图
      if (reviewView === "doing") {
        const reviewQ = reviewQuestions[currentQIndex];
        const allAnswered = reviewQuestions.every(rq => reviewAnswers[rq.id] !== undefined);
        const hasAnsweredCurrent = reviewQ && reviewAnswers[reviewQ.id] !== undefined;

        return (
          <div className="h-full flex flex-col relative max-w-3xl mx-auto w-full pt-4">
            {toast && (
              <div className="absolute top-4 right-4 bg-emerald-50 border border-emerald-200 text-emerald-600 px-4 py-2 rounded-xl text-sm font-bold z-10 shadow-sm animate-in fade-in slide-in-from-top-2">
                {toast}
              </div>
            )}

            <div className="flex items-center gap-4 mb-4">
              <button
                onClick={resetReview}
                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Target className="w-5 h-5 text-blue-500" />
                  {reviewPaperTitle}
                </h2>
              </div>
              <span className="text-sm text-slate-400 font-medium">
                {currentQIndex + 1} / {reviewQuestions.length}
              </span>
            </div>

            {/* 题号导航 */}
            <div className="flex items-center gap-1.5 flex-wrap mb-2 px-1">
              {reviewQuestions.map((_, idx) => {
                const isCurrent = idx === currentQIndex;
                const isAnswered = reviewAnswers[reviewQuestions[idx].id] !== undefined;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      setCurrentQIndex(idx);
                      setSelectedOption(reviewAnswers[reviewQuestions[idx].id] !== undefined ? reviewAnswers[reviewQuestions[idx].id] : null);
                    }}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                      isCurrent
                        ? "bg-blue-600 text-white shadow-sm"
                        : isAnswered
                          ? "bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100"
                          : "bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            {reviewQ && (
              <div className="bg-white border border-blue-100 rounded-3xl p-8 shadow-sm flex-1 flex flex-col overflow-y-auto w-full">
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <span className="bg-blue-50 text-blue-600 font-bold px-3 py-1 rounded-lg text-sm">
                    单选题
                  </span>
                  <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                    reviewQ.difficulty === "易" ? "text-emerald-700 bg-emerald-50 border border-emerald-100" :
                    reviewQ.difficulty === "中" ? "text-orange-700 bg-orange-50 border border-orange-100" :
                    "text-rose-700 bg-rose-50 border border-rose-100"
                  }`}>
                    {reviewQ.difficulty}
                  </span>
                  {(reviewQ as any).knowledgePointName && (
                    <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-lg font-medium">
                      考点: {(reviewQ as any).knowledgePointName}
                    </span>
                  )}
                  {hasAnsweredCurrent && (
                    <span className="ml-auto text-xs font-bold text-slate-400 flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-50 border border-slate-100">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" /> 已作答
                    </span>
                  )}
                </div>

                <h2 className="text-xl font-bold text-slate-800 mb-8 leading-relaxed">
                  {reviewQ.title}
                </h2>

                <div className="space-y-4 mb-8">
                  {reviewQ.options.map((opt, i) => {
                    const isSelected = selectedOption === i;
                    const isCorrect = hasAnsweredCurrent && i === reviewQ.answer;
                    const isWrongSelected = hasAnsweredCurrent && isSelected && i !== reviewQ.answer;

                    let btnClass = "w-full text-left p-4 rounded-xl border-2 transition-all flex items-center justify-between ";
                    if (!hasAnsweredCurrent) {
                      btnClass += isSelected
                        ? "border-blue-500 bg-blue-50/50"
                        : "border-slate-100 hover:border-slate-300 bg-slate-50";
                    } else {
                      if (isCorrect)
                        btnClass += "border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm";
                      else if (isWrongSelected)
                        btnClass += "border-rose-400 bg-rose-50 text-rose-800 shadow-sm";
                      else btnClass += "border-slate-100 bg-slate-50 opacity-50";
                    }

                    return (
                      <button
                        key={i}
                        disabled={hasAnsweredCurrent}
                        onClick={() => setSelectedOption(i)}
                        className={btnClass}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm transition-colors ${
                            !hasAnsweredCurrent
                              ? isSelected
                                ? "bg-blue-600 text-white border border-blue-600"
                                : "bg-white border border-slate-200 text-slate-500"
                              : isCorrect
                                ? "bg-emerald-500 text-white border border-emerald-500"
                                : isWrongSelected
                                  ? "bg-rose-500 text-white border border-rose-500"
                                  : "bg-white border border-slate-200 text-slate-400"
                          }`}>
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span className="font-medium text-[15px]">{opt}</span>
                        </div>
                        {hasAnsweredCurrent && isCorrect && (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        )}
                        {hasAnsweredCurrent && isWrongSelected && (
                          <XCircle className="w-5 h-5 text-rose-500" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {hasAnsweredCurrent && (
                  <div className="mt-4 p-6 bg-slate-50 border border-slate-200 rounded-2xl animate-in fade-in slide-in-from-bottom-4 shadow-sm">
                    <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-blue-500"/>
                      答案与解析
                    </h4>
                    <div className="text-slate-600 leading-relaxed text-[15px]">
                      正确答案是 <span className="font-bold text-emerald-600 px-1 bg-emerald-100/50 rounded">{String.fromCharCode(65 + reviewQ.answer)}</span>。
                      <div className="markdown-body text-[14px] mt-2">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{reviewQ.analysis}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap justify-between gap-2 shrink-0">
                  <button
                    onClick={resetReview}
                    className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors"
                  >
                    退出复习
                  </button>
                  <div className="flex gap-2">
                    {/* 上一题 */}
                    {currentQIndex > 0 && (
                      <button
                        onClick={() => {
                          const prevIdx = currentQIndex - 1;
                          setCurrentQIndex(prevIdx);
                          const prevId = reviewQuestions[prevIdx].id;
                          setSelectedOption(reviewAnswers[prevId] !== undefined ? reviewAnswers[prevId] : null);
                        }}
                        className="px-5 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors"
                      >
                        上一题
                      </button>
                    )}
                    {!hasAnsweredCurrent ? (
                      <button
                        onClick={() => handleSubmitReviewAnswer(reviewQ.id)}
                        disabled={selectedOption === null}
                        className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_12px_rgba(59,130,246,0.3)]"
                      >
                        提交答案
                      </button>
                    ) : currentQIndex < reviewQuestions.length - 1 ? (
                      <button
                        onClick={() => {
                          const nextIdx = currentQIndex + 1;
                          setCurrentQIndex(nextIdx);
                          const nextId = reviewQuestions[nextIdx].id;
                          setSelectedOption(reviewAnswers[nextId] !== undefined ? reviewAnswers[nextId] : null);
                        }}
                        className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors shadow-[0_4px_12px_rgba(59,130,246,0.3)]"
                      >
                        下一题
                      </button>
                    ) : allAnswered ? (
                      <button
                        onClick={handleFinishReview}
                        disabled={reviewLoading}
                        className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-bold flex items-center gap-2 hover:from-emerald-600 hover:to-teal-700 transition-all shadow-[0_4px_12px_rgba(16,185,129,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        提交试卷 <Sparkles className="w-4 h-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      }

      // 结果分析视图
      if (reviewView === "result" && reviewResult) {
        return (
          <div className="h-full flex flex-col pt-2 max-w-3xl mx-auto w-full">
            {toast && (
              <div className="absolute top-0 right-1/2 translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm z-50 shadow-lg animate-in fade-in slide-in-from-top-2">
                {toast}
              </div>
            )}
            <div className="flex items-center gap-4 mb-6">
              <button
                onClick={resetReview}
                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Brain className="w-5 h-5 text-blue-500" />
                  复习结果分析
                </h2>
                <p className="text-sm text-slate-500 mt-1">{reviewPaperTitle}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-6">
              {/* 成绩总览卡片 */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Target className="w-5 h-5 text-blue-500" />
                  📊 成绩总览
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-slate-50 rounded-xl">
                    <div className="text-3xl font-bold text-slate-800">{reviewResult.totalCount}</div>
                    <div className="text-xs text-slate-500 mt-1">总题数</div>
                  </div>
                  <div className="text-center p-4 bg-emerald-50 rounded-xl">
                    <div className="text-3xl font-bold text-emerald-600">{reviewResult.correctCount}</div>
                    <div className="text-xs text-emerald-600 mt-1">正确</div>
                  </div>
                  <div className="text-center p-4 bg-rose-50 rounded-xl">
                    <div className="text-3xl font-bold text-rose-600">{reviewResult.wrongCount}</div>
                    <div className="text-xs text-rose-600 mt-1">错误</div>
                  </div>
                  <div className="text-center p-4 bg-blue-50 rounded-xl">
                    <div className="text-3xl font-bold text-blue-600">{reviewResult.accuracy}%</div>
                    <div className="text-xs text-blue-600 mt-1">正确率</div>
                  </div>
                </div>
              </div>

              {/* 薄弱考点 */}
              {reviewResult.weakKPs?.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <XCircle className="w-5 h-5 text-rose-500" />
                    🔴 薄弱考点
                  </h3>
                  <div className="space-y-3">
                    {reviewResult.weakKPs.map((kp: any) => (
                      <div key={kp.name} className="flex items-center justify-between p-3 bg-rose-50 rounded-xl">
                        <div>
                          <span className="font-bold text-slate-800 text-sm">{kp.name}</span>
                          <span className="text-xs text-slate-500 ml-2">共{kp.total}题</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-rose-600 font-bold">{kp.wrong}题答错</span>
                          <span className="text-xs font-bold text-rose-600 bg-rose-100 px-2 py-0.5 rounded-lg">
                            正确率 {kp.accuracy}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 模块1: 学习总结反馈报告 */}
              {reviewReport?.summaryReport && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <div className="markdown-body text-[14px] text-slate-700">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{reviewReport.summaryReport}</ReactMarkdown>
                  </div>
                </div>
              )}

              {/* 模块2: 薄弱考点分析 */}
              {reviewReport?.weakPointAnalysis && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <div className="markdown-body text-[14px] text-slate-700">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{reviewReport.weakPointAnalysis}</ReactMarkdown>
                  </div>
                </div>
              )}

              {/* 模块3: 同类题型解题思路 */}
              {reviewReport?.solutionApproaches && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <div className="markdown-body text-[14px] text-slate-700">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{reviewReport.solutionApproaches}</ReactMarkdown>
                  </div>
                </div>
              )}

              {/* 模块4: 针对性复习建议 */}
              {reviewReport?.reviewSuggestions && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <div className="markdown-body text-[14px] text-slate-700">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{reviewReport.reviewSuggestions}</ReactMarkdown>
                  </div>
                </div>
              )}

              {/* 逐题结果 */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-500" />
                  📝 逐题详情
                </h3>
                <div className="space-y-3">
                  {reviewResult.results?.map((r: any, idx: number) => (
                    <div
                      key={r.questionId}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        r.isCorrect
                          ? "border-emerald-200 bg-emerald-50/30"
                          : "border-rose-200 bg-rose-50/30"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          r.isCorrect
                            ? "bg-emerald-500 text-white"
                            : "bg-rose-500 text-white"
                        }`}>
                          {r.isCorrect ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 text-[14px] leading-relaxed">
                            <span className="text-slate-400 mr-1">#{idx + 1}</span>
                            {r.title}
                          </p>
                          <div className="flex items-center gap-3 mt-2 text-xs flex-wrap">
                            {r.knowledgePointName && (
                              <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg font-medium">
                                {r.knowledgePointName}
                              </span>
                            )}
                            <span className="text-slate-500">
                              正确答案: <b>{String.fromCharCode(65 + r.correctAnswer)}</b>
                            </span>
                            {!r.isCorrect && (
                              <span className="text-rose-500">
                                你的答案: <b>{r.userAnswer >= 0 ? String.fromCharCode(65 + r.userAnswer) : "未作答"}</b>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between gap-3 shrink-0">
              <button
                onClick={resetReview}
                className="px-6 py-2.5 bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl font-bold transition-colors"
              >
                返回错题本
              </button>
              <button
                onClick={() => {
                  resetReview();
                  handleStartReview();
                }}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-bold flex items-center gap-2 hover:from-blue-600 hover:to-blue-700 transition-all shadow-[0_4px_12px_rgba(59,130,246,0.3)]"
              >
                <RotateCcw className="w-4 h-4" />
                重新复习
              </button>
            </div>
          </div>
        );
      }
    }

    if (wrongCategoryId === null) {
      return (
        <div className="h-full flex flex-col pt-2 max-w-5xl mx-auto w-full relative">
          {toast && (
            <div className="absolute top-0 right-1/2 translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm z-50 shadow-lg animate-in fade-in slide-in-from-top-2">
              {toast}
            </div>
          )}
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setView("categories")}
                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-slate-800 tracking-tight">
                  错题本
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  分类整理所有做错题目，强化薄弱环节。
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={fetchHistoryList}
                  disabled={historyLoading}
                  className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-50 hover:border-slate-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FileText className="w-4 h-4" />
                  历史记录
                </button>
                <button
                  onClick={handleStartReview}
                  disabled={reviewLoading}
                  className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-bold flex items-center gap-2 hover:from-blue-600 hover:to-blue-700 transition-all shadow-[0_4px_12px_rgba(59,130,246,0.3)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  <Sparkles className="w-4 h-4" />
                  智能复习
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {mockCategories.map((cat) => {
              const wrongCount = allWrongRecords.filter(r => r.q.categoryId === cat.id).length;
              return (
                <div 
                  key={cat.id} 
                  onClick={() => {
                    setWrongCategoryId(cat.id);
                    setWrongTypeFilter("全部");
                    setWrongDiffFilter("全部");
                  }}
                  className="bg-white border border-slate-200 p-6 rounded-2xl hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group flex flex-col gap-4"
                >
                  <div className="flex justify-between items-center">
                     <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                        <FolderOpen className="w-6 h-6" />
                     </div>
                     <span className="text-slate-400 bg-slate-50 px-3 py-1 rounded-full text-xs font-bold border border-slate-100 group-hover:bg-white transition-colors">{wrongCount} 题</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{cat.name}</h3>
                    <p className="text-sm text-slate-500 mt-1">点击查看本章精选习题</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      );
    }

    // Category view is active
    let wrongRecords = allWrongRecords.filter(r => r.q.categoryId === wrongCategoryId);
    
    if (wrongTypeFilter !== "全部") {
      wrongRecords = wrongRecords.filter(r => r.q.type === wrongTypeFilter);
    }
    if (wrongDiffFilter !== "全部") {
      wrongRecords = wrongRecords.filter(r => r.q.difficulty === wrongDiffFilter);
    }

    const catName = mockCategories.find(c => c.id === wrongCategoryId)?.name;

    return (
      <div className="h-full flex flex-col pt-2 max-w-5xl mx-auto w-full relative">
        {toast && (
          <div className="absolute top-0 right-1/2 translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm z-50 shadow-lg animate-in fade-in slide-in-from-top-2">
            {toast}
          </div>
        )}
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setWrongCategoryId(null)}
              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-slate-800 tracking-tight">
                {catName} 错题
              </h2>
            </div>
          </div>
          
          <div className="flex gap-4 p-3 bg-slate-50 border border-slate-200 rounded-2xl items-center flex-wrap shadow-sm">
            <div className="flex items-center gap-2">
               <span className="text-sm font-bold text-slate-600 pl-2">题型:</span>
               {["全部", "单选题", "多选题"].map(f => (
                 <button 
                  key={f}
                  onClick={() => setWrongTypeFilter(f)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${wrongTypeFilter === f ? 'bg-white shadow-sm text-blue-600 border border-slate-200' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'}`}
                 >
                   {f}
                 </button>
               ))}
            </div>
            <div className="w-[1px] h-6 bg-slate-200 mx-2 hidden sm:block"></div>
            <div className="flex items-center gap-2">
               <span className="text-sm font-bold text-slate-600 pl-2">难度:</span>
               {["全部", "易", "中", "难"].map(f => (
                 <button 
                  key={f}
                  onClick={() => setWrongDiffFilter(f)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${wrongDiffFilter === f ? 'bg-white shadow-sm text-blue-600 border border-slate-200' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'}`}
                 >
                   {f}
                 </button>
               ))}
            </div>
          </div>
        </div>

        {wrongRecords.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-50/50 rounded-3xl border border-slate-200 border-dashed animate-in fade-in">
            <BookOpen className="w-12 h-12 text-slate-300 mb-4" />
            <h3 className="text-slate-600 font-bold mb-1">暂无匹配的错题记录</h3>
            <p className="text-slate-400 text-sm">不错哦，继续保持！</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-2 grid grid-cols-1 md:grid-cols-2 gap-4 content-start pb-4">
            {wrongRecords.map((item) => (
               <div
                  key={item.q.id}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('button')) return;
                    setFullscreenWrongQ(item);
                  }}
                  className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4 relative group hover:border-blue-400 transition-colors cursor-pointer animate-in fade-in"
               >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg">
                        {item.q.type}
                      </span>
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${
                        item.q.difficulty === "易" ? "text-emerald-700 bg-emerald-50 border-emerald-100" :
                        item.q.difficulty === "中" ? "text-orange-700 bg-orange-50 border-orange-100" :
                        "text-rose-700 bg-rose-50 border-rose-100"
                      }`}>
                        难度: {item.q.difficulty}
                      </span>
                    </div>
                  </div>
                  
                  <h4 className="font-bold text-slate-800 text-[15px] leading-relaxed flex-1 pt-2">
                    {item.q.title}
                  </h4>
                  
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <h5 className="font-bold text-slate-800 text-sm mb-2 pb-2 border-b border-slate-200">
                      易错解析
                    </h5>
                    <p className="text-slate-600 text-[13px] leading-relaxed line-clamp-2">
                      {item.q.analysis}
                    </p>
                  </div>
                  
                  <div className="flex justify-between items-center pt-2">
                     <span className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 px-2 py-1 rounded-lg flex items-center gap-1">
                        失误 {item.errCount} 次
                     </span>
                     <div className="flex gap-2">
                       <button onClick={() => showToast("题目已收藏！")} className="p-2 bg-slate-50 text-slate-500 hover:bg-orange-50 hover:text-orange-500 rounded-lg transition-colors border border-slate-200" title="收藏">
                         <Bookmark className="w-4 h-4" />
                       </button>
                       <button
                         onClick={() => {
                           const newWrongBook = {...wrongBook};
                           delete newWrongBook[item.q.id];
                           setWrongBook(newWrongBook);
                           fetch(`/api/wrong-book/${item.q.id}`, {
                             method: "DELETE",
                             headers: { Authorization: `Bearer ${token}` },
                           }).then(res => {
                             if (!res.ok) throw new Error(`HTTP ${res.status}`);
                           }).catch((err) => {
                             console.error("[WrongBook] Delete failed:", err.message);
                             // Restore locally if server delete failed
                             setWrongBook(prev => ({ ...prev, [item.q.id]: { q: item.q, errCount: item.errCount } }));
                             showToast("删除失败，请重试");
                           });
                           showToast("已从错题本移除！");
                         }} 
                         className="p-2 bg-slate-50 text-slate-500 hover:bg-rose-50 hover:text-rose-500 rounded-lg transition-colors border border-slate-200"
                         title="移除"
                        >
                         <Trash2 className="w-4 h-4" />
                       </button>
                       <button 
                         onClick={() => {
                          setAnswerHistory(prev => {
                            const clone = {...prev};
                            delete clone[item.q.id];
                            return clone;
                          });
                          
                          setActiveCategoryId(item.q.categoryId);
                          setDiffFilter("全部");
                          setIsTestMode(false);
                          setView("list"); // Ensure we navigate out of wrong view
                          
                          setTimeout(() => {
                             const idxInAll = mockQuestions.filter(q => q.categoryId === item.q.categoryId).findIndex(q => q.id === item.q.id);
                             if(idxInAll !== -1) {
                                setCurrentQIndex(idxInAll);
                                setView("doing");
                                setSelectedOption(null);
                             }
                          }, 0);
                       }} 
                         className="px-4 py-2 bg-blue-50 text-blue-600 font-bold text-sm rounded-xl hover:bg-blue-600 hover:text-white transition-colors border border-blue-100 flex items-center gap-1.5"
                       >
                         <PenTool className="w-4 h-4" /> 重做
                       </button>
                     </div>
                  </div>
               </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {view === "categories" ? renderCategories() : view === "list" ? renderList() : view === "doing" ? renderDoing() : renderWrongBook()}
      
      {isTestModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]" onClick={() => setIsTestModalOpen(false)}>
           <div className="bg-white rounded-3xl p-6 w-full max-w-md animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <h3 className="text-xl font-bold mb-4 text-slate-800">选择测试章节</h3>
              <div className="space-y-4 mb-6">
                 <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                   <input type="checkbox" className="w-4 h-4" checked={selectedTestCategories.length === mockCategories.length} onChange={(e) => {
                     if (e.target.checked) setSelectedTestCategories(mockCategories.map(c => c.id));
                     else setSelectedTestCategories([]);
                   }} />
                   <span className="font-bold text-slate-700">全章节综合自测</span>
                 </label>
                 <div className="pl-2 space-y-2">
                   {mockCategories.map(c => (
                     <label key={c.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                       <input type="checkbox" className="w-4 h-4" checked={selectedTestCategories.includes(c.id)} onChange={(e) => {
                         if (e.target.checked) setSelectedTestCategories([...selectedTestCategories, c.id]);
                         else setSelectedTestCategories(selectedTestCategories.filter(id => id !== c.id));
                       }} />
                       <span className="text-slate-600 font-medium">{c.name}</span>
                     </label>
                   ))}
                 </div>
              </div>
              <div className="flex justify-end gap-3">
                 <button onClick={() => setIsTestModalOpen(false)} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-xl transition-colors">取消</button>
                 <button 
                   onClick={() => {
                     const qs = mockQuestions.filter(q => selectedTestCategories.includes(q.categoryId));
                     if (qs.length === 0) {
                        showToast("所选章节暂无题目！");
                        return;
                     }
                     const randomQ = [...qs].sort(() => Math.random() - 0.5).slice(0, 5);
                     setTestQuestions(randomQ);
                     setIsTestMode(true);
                     setCurrentQIndex(0);
                     setView("doing");
                     setSelectedOption(answerHistory[randomQ[0]?.id] !== undefined ? answerHistory[randomQ[0]?.id] : null);
                     setIsTestModalOpen(false);
                   }}
                   disabled={selectedTestCategories.length === 0}
                   className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl disabled:opacity-50 transition-colors shadow-sm"
                 >
                   开始模拟
                 </button>
              </div>
           </div>
        </div>
      )}

      {fullscreenWrongQ && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 z-[100]" onClick={() => setFullscreenWrongQ(null)}>
           <div className="bg-white rounded-3xl w-full max-w-4xl max-h-full overflow-y-auto shadow-2xl animate-in zoom-in-95 flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="sticky top-0 bg-white/90 backdrop-blur-md p-4 sm:p-6 border-b border-slate-100 flex justify-between items-center z-10">
                 <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-bold text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl">
                      {fullscreenWrongQ.q.type}
                    </span>
                    <span className={`text-sm font-bold px-3 py-1.5 rounded-xl border ${
                      fullscreenWrongQ.q.difficulty === "易" ? "text-emerald-700 bg-emerald-50 border-emerald-100" :
                      fullscreenWrongQ.q.difficulty === "中" ? "text-orange-700 bg-orange-50 border-orange-100" :
                      "text-rose-700 bg-rose-50 border-rose-100"
                    }`}>
                      难度: {fullscreenWrongQ.q.difficulty}
                    </span>
                    <span className="text-sm font-bold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1">
                      失误 {fullscreenWrongQ.errCount} 次
                    </span>
                 </div>
                 <button onClick={() => setFullscreenWrongQ(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                   <X className="w-6 h-6" />
                 </button>
              </div>
              <div className="p-4 sm:p-8 space-y-8">
                 <h2 className="text-2xl font-bold text-slate-800 leading-relaxed">{fullscreenWrongQ.q.title}</h2>
                 <div className="space-y-4">
                   {fullscreenWrongQ.q.options.map((opt, i) => (
                      <div key={i} className={`p-4 rounded-xl border-2 flex items-center gap-4 ${i === fullscreenWrongQ.q.answer ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-100 bg-slate-50 text-slate-600'}`}>
                         <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${i === fullscreenWrongQ.q.answer ? 'bg-emerald-500 text-white' : 'bg-white border border-slate-200 text-slate-400'}`}>
                           {String.fromCharCode(65 + i)}
                         </span>
                         <span className="font-medium text-[15px]">{opt}</span>
                         {i === fullscreenWrongQ.q.answer && <CheckCircle2 className="w-5 h-5 text-emerald-500 ml-auto" />}
                      </div>
                   ))}
                 </div>
                 <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl">
                    <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-blue-500"/> 易错解析
                    </h4>
                    <div className="markdown-body text-[14px] text-slate-700">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{fullscreenWrongQ.q.analysis}</ReactMarkdown>
                    </div>
                 </div>
              </div>
              <div className="p-4 sm:p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50 shrink-0">
                 <button onClick={() => setFullscreenWrongQ(null)} className="px-6 py-2.5 bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl font-bold transition-colors">关闭</button>
                 <button onClick={() => {
                     setFullscreenWrongQ(null);
                     setAnswerHistory(prev => { const clone = {...prev}; delete clone[fullscreenWrongQ.q.id]; return clone; });
                     setActiveCategoryId(fullscreenWrongQ.q.categoryId);
                     setDiffFilter("全部");
                     setIsTestMode(false);
                     setTimeout(() => {
                        const idxInAll = mockQuestions.filter(q => q.categoryId === fullscreenWrongQ.q.categoryId).findIndex(q => q.id === fullscreenWrongQ.q.id);
                        if(idxInAll !== -1) {
                           setCurrentQIndex(idxInAll);
                           setView("doing");
                           setSelectedOption(null);
                        }
                     }, 0);
                 }} className="px-6 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl font-bold transition-colors flex items-center gap-2 shadow-sm">
                   <PenTool className="w-4 h-4" /> 重新作答
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* 历史记录列表弹窗 */}
      {historyView === "list" && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]" onClick={() => { setHistoryView(null); setExpandedGroupId(null); setExpandedGroupDetail(null); }}>
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-500" />
                  复习历史记录
                </h2>
                <p className="text-sm text-slate-500 mt-1">相同考点试卷自动合并，点击展开查看历次作答</p>
              </div>
              <button onClick={() => { setHistoryView(null); setExpandedGroupId(null); setExpandedGroupDetail(null); }} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {historyLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                </div>
              ) : historyList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <FileText className="w-12 h-12 text-slate-300 mb-4" />
                  <h3 className="text-slate-600 font-bold mb-1">暂无历史记录</h3>
                  <p className="text-slate-400 text-sm">完成智能复习后，记录将自动保存到此处</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {groupedHistory.map((group: any) => {
                    const isExpanded = expandedGroupId === group.groupId;
                    const detail = isExpanded ? expandedGroupDetail : null;
                    return (
                      <div key={group.groupId}>
                        <div className={`bg-white border rounded-2xl hover:shadow-sm transition-all group ${
                          isExpanded ? "border-blue-300 shadow-sm" : "border-slate-200 hover:border-blue-300"
                        }`}>
                          {/* 卡片主体 — 点击展开/收起 */}
                          <div
                            className="p-5 cursor-pointer"
                            onClick={() => handleOpenGroupDetail(group)}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h3 className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors text-[15px]">
                                    {group.paperTitle}
                                  </h3>
                                  {group.attemptCount > 1 && (
                                    <span className="text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full shrink-0">
                                      作答 {group.attemptCount} 次
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-400 mb-3">
                                  最近: {new Date(group.latestDate).toLocaleString("zh-CN")}
                                </p>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {group.knowledgePoints?.slice(0, 3).map((kp: string, i: number) => (
                                    <span key={i} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg font-medium">
                                      {kp}
                                    </span>
                                  ))}
                                  {group.knowledgePoints?.length > 3 && (
                                    <span className="text-xs text-slate-400">+{group.knowledgePoints.length - 3}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <div className="text-center">
                                  <div className={`text-2xl font-bold ${group.accuracy >= 80 ? "text-emerald-600" : group.accuracy >= 60 ? "text-orange-600" : "text-rose-600"}`}>
                                    {group.accuracy}%
                                  </div>
                                  <div className="text-xs text-slate-400">{group.correctCount}/{group.totalCount} · 最高</div>
                                </div>
                                <ChevronRight className={`w-5 h-5 text-slate-300 group-hover:text-blue-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                              </div>
                            </div>
                          </div>

                          {/* 底部操作栏 */}
                          <div className="px-5 pb-4 flex gap-2" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={async () => {
                                try {
                                  const bestIdx = group.records.findIndex((r: any) => r.accuracy === group.accuracy);
                                  const bestId = group.ids[bestIdx >= 0 ? bestIdx : 0];
                                  const res = await fetch(`/api/review-history/${bestId}`, {
                                    headers: { Authorization: `Bearer ${token}` },
                                  });
                                  const d = await res.json();
                                  if (res.ok) { setHistoryView(null); setExpandedGroupId(null); redoHistoryWrongQuestions(d); }
                                  else showToast("加载失败");
                                } catch { showToast("加载失败"); }
                              }}
                              className="px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1"
                            >
                              <RotateCcw className="w-3 h-3" /> 重做错题
                            </button>
                            <button
                              onClick={() => exportGroupPDF(group)}
                              className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors flex items-center gap-1"
                            >
                              <FileText className="w-3 h-3" /> 导出PDF
                            </button>
                            <button
                              onClick={() => deleteBatchGroup(group)}
                              className="px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" /> 删除{group.attemptCount > 1 ? `(${group.attemptCount})` : ""}
                            </button>
                          </div>

                          {/* 展开的试卷详情 */}
                          {isExpanded && (
                            <div className="border-t border-slate-100 bg-slate-50/50 rounded-b-2xl animate-in fade-in slide-in-from-top-2">
                              {expandedLoading || !detail ? (
                                <div className="flex items-center justify-center py-12">
                                  <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                                </div>
                              ) : (
                                <div className="px-5 py-5 space-y-5">
                                  {/* 成绩总览 */}
                                  <div className="grid grid-cols-4 gap-3">
                                    <div className="text-center p-3 bg-white rounded-xl border border-slate-100">
                                      <div className="text-lg font-bold text-slate-800">{detail.totalCount}</div>
                                      <div className="text-xs text-slate-500">总题数</div>
                                    </div>
                                    <div className="text-center p-3 bg-white rounded-xl border border-slate-100">
                                      <div className="text-lg font-bold text-emerald-600">{detail.correctCount}</div>
                                      <div className="text-xs text-emerald-600">正确</div>
                                    </div>
                                    <div className="text-center p-3 bg-white rounded-xl border border-slate-100">
                                      <div className="text-lg font-bold text-rose-600">{detail.wrongCount}</div>
                                      <div className="text-xs text-rose-600">错误</div>
                                    </div>
                                    <div className="text-center p-3 bg-white rounded-xl border border-slate-100">
                                      <div className="text-lg font-bold text-blue-600">{detail.accuracy}%</div>
                                      <div className="text-xs text-blue-600">正确率</div>
                                    </div>
                                  </div>

                                  {/* 复习考点 */}
                                  {detail.knowledgePoints?.length > 0 && (
                                    <div>
                                      <h4 className="font-bold text-slate-700 mb-2 text-xs">📌 复习考点</h4>
                                      <div className="flex flex-wrap gap-1.5">
                                        {detail.knowledgePoints.map((kp: any) => (
                                          <span key={kp.id} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md font-medium">
                                            {kp.name}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* 逐题详情 */}
                                  <div>
                                    <h4 className="font-bold text-slate-700 mb-2.5 text-xs">
                                      📝 逐题详情
                                      {detail.wrongCount > 0 && (
                                        <span className="text-rose-500 ml-1.5 font-normal">（错题 {detail.wrongCount} 道）</span>
                                      )}
                                    </h4>
                                    <div className="space-y-1.5">
                                      {(detail.questions || []).map((q: Question, idx: number) => {
                                        const userAns = detail.answers?.[q.id];
                                        const isCorrect = userAns !== undefined && userAns === q.answer;
                                        return (
                                          <div
                                            key={q.id}
                                            className={`p-3 rounded-lg text-[13px] flex items-start gap-2.5 ${
                                              isCorrect ? "bg-emerald-50/50" : "bg-rose-50/50"
                                            }`}
                                          >
                                            <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold ${
                                              isCorrect ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                                            }`}>
                                              {idx + 1}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                              <p className="text-slate-700 leading-relaxed">{q.title}</p>
                                              <p className="text-xs text-slate-500 mt-1">
                                                答案: <b className="text-emerald-600">{String.fromCharCode(65 + q.answer)}</b>
                                                {!isCorrect && (
                                                  <> &nbsp;|&nbsp; 你的: <b className="text-rose-600">{userAns >= 0 ? String.fromCharCode(65 + userAns) : "未作答"}</b></>
                                                )}
                                                {(q as any).difficulty && (
                                                  <> &nbsp;|&nbsp; {(q as any).difficulty}</>
                                                )}
                                              </p>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 历史记录详情弹窗 */}
      {historyView === "detail" && historyDetail && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[110]" onClick={() => { setHistoryView("list"); setHistoryDetail(null); }}>
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-800">{historyDetail.paperTitle}</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {new Date(historyDetail.date).toLocaleString("zh-CN")} &nbsp;|&nbsp;
                  共{historyDetail.totalCount}题 &nbsp;|&nbsp;
                  正确率 {historyDetail.accuracy}%
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => printHistoryPDF(historyDetail)}
                  className="px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-xs flex items-center gap-1.5 hover:bg-slate-50 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" /> 导出PDF
                </button>
                <button
                  onClick={() => { setHistoryView(null); setHistoryDetail(null); redoHistoryWrongQuestions(historyDetail); }}
                  className="px-3 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 hover:bg-blue-700 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> 重做错题
                </button>
                <button onClick={() => { setHistoryView("list"); setHistoryDetail(null); }} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-4 gap-3">
                <div className="text-center p-3 bg-slate-50 rounded-xl">
                  <div className="text-xl font-bold text-slate-800">{historyDetail.totalCount}</div>
                  <div className="text-xs text-slate-500">总题数</div>
                </div>
                <div className="text-center p-3 bg-emerald-50 rounded-xl">
                  <div className="text-xl font-bold text-emerald-600">{historyDetail.correctCount}</div>
                  <div className="text-xs text-emerald-600">正确</div>
                </div>
                <div className="text-center p-3 bg-rose-50 rounded-xl">
                  <div className="text-xl font-bold text-rose-600">{historyDetail.wrongCount}</div>
                  <div className="text-xs text-rose-600">错误</div>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded-xl">
                  <div className="text-xl font-bold text-blue-600">{historyDetail.accuracy}%</div>
                  <div className="text-xs text-blue-600">正确率</div>
                </div>
              </div>

              {historyDetail.knowledgePoints?.length > 0 && (
                <div>
                  <h3 className="font-bold text-slate-800 mb-2 text-sm">📌 复习考点</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {historyDetail.knowledgePoints.map((kp: any) => (
                      <span key={kp.id} className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg font-medium">
                        {kp.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="font-bold text-slate-800 mb-3 text-sm">
                  📝 逐题详情
                  {historyDetail.wrongCount > 0 && (
                    <span className="text-rose-500 ml-2 font-normal">（错题 {historyDetail.wrongCount} 道）</span>
                  )}
                </h3>
                <div className="space-y-2">
                  {(historyDetail.questions || []).map((q: Question, idx: number) => {
                    const userAns = historyDetail.answers?.[q.id];
                    const isCorrect = userAns !== undefined && userAns === q.answer;
                    return (
                      <div
                        key={q.id}
                        className={`p-3 rounded-xl border ${
                          isCorrect ? "border-emerald-200 bg-emerald-50/30" : "border-rose-200 bg-rose-50/30"
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-xs ${
                            isCorrect ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                          }`}>
                            {isCorrect ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 text-[13px] leading-relaxed">
                              <span className="text-slate-400 mr-1">#{idx + 1}</span>
                              {q.title}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              正确答案: <b className="text-emerald-600">{String.fromCharCode(65 + q.answer)}</b>
                              {!isCorrect && (
                                <> &nbsp;|&nbsp; 你的答案: <b className="text-rose-600">{userAns >= 0 ? String.fromCharCode(65 + userAns) : "未作答"}</b></>
                              )}
                              {(q as any).difficulty && (
                                <> &nbsp;|&nbsp; 难度: {(q as any).difficulty}</>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteConfirmGroup && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[120]" onClick={() => setDeleteConfirmGroup(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-in zoom-in-95 p-6" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-rose-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">确认删除</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                确定删除「{deleteConfirmGroup.paperTitle}」的全部 <b className="text-rose-600">{deleteConfirmGroup.attemptCount}</b> 条记录吗？
              </p>
              <p className="text-xs text-slate-400 mt-2">此操作不可撤销</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmGroup(null)}
                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-100 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmDeleteGroup}
                className="flex-1 px-4 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold text-sm transition-colors shadow-sm"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
