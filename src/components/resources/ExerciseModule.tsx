import React, { useState, useMemo } from "react";
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
  X
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
        return {
          ...prev,
          [q.id]: {
            q,
            errCount: existing ? existing.errCount + 1 : 1
          }
        };
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
              <div>
                <h2 className="text-xl font-bold text-slate-800 tracking-tight">
                  错题本
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  分类整理所有做错题目，强化薄弱环节。
                </p>
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
    </>
  );
}
