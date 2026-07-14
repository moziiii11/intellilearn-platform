import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  BrainCircuit,
  BookOpen,
  Lightbulb,
  FileUp,
  X,
  ExternalLink,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { useUser } from "../../UserContext";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ReactECharts from "echarts-for-react";

const ACCEPTED_TYPES: Record<string, string> = {
  ".txt": "文本",
  ".md": "Markdown",
  ".py": "Python",
  ".js": "JavaScript",
  ".ts": "TypeScript",
  ".java": "Java",
  ".cpp": "C++",
  ".c": "C",
  ".html": "HTML",
  ".css": "CSS",
  ".json": "JSON",
  ".xml": "XML",
  ".csv": "CSV",
  ".sql": "SQL",
  ".yaml": "YAML",
  ".yml": "YAML",
};

const UNSUPPORTED_TYPES: Record<string, string> = {
  ".pdf": "PDF（暂不支持，请复制文字内容到 .txt 文件后上传）",
  ".doc": "Word（暂不支持，请复制文字内容到 .txt 文件后上传）",
  ".docx": "Word（暂不支持，请复制文字内容到 .txt 文件后上传）",
  ".ppt": "PPT（暂不支持，请复制文字内容到 .txt 文件后上传）",
  ".pptx": "PPT（暂不支持，请复制文字内容到 .txt 文件后上传）",
  ".png": "图片（暂不支持图片识别，请手动录入文字）",
  ".jpg": "图片（暂不支持图片识别，请手动录入文字）",
  ".jpeg": "图片（暂不支持图片识别，请手动录入文字）",
  ".gif": "图片（暂不支持图片识别，请手动录入文字）",
  ".webp": "图片（暂不支持图片识别，请手动录入文字）",
};

export function UploadModule() {
  const { authHeaders, userProfile, emitLearningEvent } = useUser();
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [parsedData, setParsedData] = useState<any>(null);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [activeResultTab, setActiveResultTab] = useState<"summary" | "mindmap" | "exercises">("summary");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- 配套习题：交互式做题状态 ----
  const [exerciseView, setExerciseView] = useState<"list" | "doing">("list");
  const [currentExerciseIdx, setCurrentExerciseIdx] = useState(0);
  const [exerciseAnswers, setExerciseAnswers] = useState<Record<string, number>>({});
  const [selectedExerciseOpt, setSelectedExerciseOpt] = useState<number | null>(null);
  const [exerciseToast, setExerciseToast] = useState("");

  // 查看已有上传记录
  const materials = userProfile?.uploadedMaterials || [];

  const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (file.size > MAX_FILE_SIZE) {
        reject(new Error(`文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），请上传小于15MB的文件`));
        return;
      }

      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      const isImage = [".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext);

      if (isImage) {
        // 图片：压缩后再转 base64，避免 JSON 过大
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          const canvas = document.createElement("canvas");
          const MAX_W = 1200, MAX_H = 1200;
          let w = img.width, h = img.height;
          if (w > MAX_W || h > MAX_H) {
            const ratio = Math.min(MAX_W / w, MAX_H / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("图片加载失败"));
        };
        img.src = url;
      } else {
        // 文本类文件：直接读文本
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("文件读取失败"));
        reader.readAsText(file);
      }
    });
  };

  const handleUpload = useCallback(async (file: File) => {
    setError("");
    setParsedData(null);
    setFileName(file.name);

    // 检查文件类型是否支持
    if (!isSupportedFile(file.name)) {
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      const msg = UNSUPPORTED_TYPES[ext] || "暂不支持此文件格式，请上传文本类文件";
      setError(msg);
      return;
    }

    setUploading(true);

    emitLearningEvent("material_upload", { fileName: file.name, fileSize: file.size });

    try {
      const content = await readFileContent(file);
      const res = await fetch("/api/upload-material", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ fileName: file.name, fileContent: content }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          setParsedData(data.data);
        } else {
          setError(data.error || "解析失败");
        }
      } else {
        const errData = await res.json().catch(() => ({ error: "请求失败" }));
        setError(errData.error || "上传失败，请检查网络");
      }
    } catch (e: any) {
      setError(e.message || "文件处理失败");
    } finally {
      setUploading(false);
    }
  }, [authHeaders, emitLearningEvent]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const resetUpload = () => {
    setParsedData(null);
    setError("");
    setFileName("");
    setExerciseView("list");
    setCurrentExerciseIdx(0);
    setExerciseAnswers({});
    setSelectedExerciseOpt(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const getFileTypeLabel = (name: string) => {
    const ext = "." + name.split(".").pop()?.toLowerCase();
    return ACCEPTED_TYPES[ext] || UNSUPPORTED_TYPES[ext] || "未知格式";
  };

  const isSupportedFile = (name: string) => {
    const ext = "." + name.split(".").pop()?.toLowerCase();
    return ext in ACCEPTED_TYPES;
  };

  const handleApplyToDocs = () => {
    if (!parsedData?.summary) return;
    // 将摘要作为新文档添加到现有资源
    const event = new CustomEvent("apply-material-to-docs", {
      detail: { summary: parsedData.summary, title: fileName },
    });
    window.dispatchEvent(event);
  };

  return (
    <div className="h-full overflow-y-auto p-2 space-y-6">
      {/* 上传区域 */}
      {!parsedData && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer transition-all duration-300 ${
            dragOver
              ? "border-blue-400 bg-blue-50/60 scale-[1.02] shadow-lg"
              : "border-slate-300 bg-slate-50/40 hover:border-blue-300 hover:bg-blue-50/30 hover:shadow-md"
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileSelect}
            accept=".txt,.md,.py,.js,.ts,.java,.cpp,.c,.html,.css,.json,.xml,.csv,.sql,.yaml,.yml"
          />

          {uploading ? (
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
              <div>
                <p className="text-base font-bold text-slate-700">AI 正在解析资料…</p>
                <p className="text-sm text-slate-500 mt-1">提取知识点 · 生成摘要 · 构建思维导图 · 出配套习题</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <FileText className="w-4 h-4" />
                <span>{fileName}</span>
                <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full">{getFileTypeLabel(fileName)}</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
                <FileUp className="w-8 h-8 text-blue-500" />
              </div>
              <div>
                <p className="text-base font-bold text-slate-700">
                  {dragOver ? "松手上传文件" : "点击上传 或 拖拽文件到此处"}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  支持 .txt / .md / .py / .js / .java / .json / .csv 等文本格式
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-1.5 mt-2">
                {["文本", "Markdown", "代码", "JSON", "CSV"].map(t => (
                  <span key={t} className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 flex items-start gap-3">
          <X className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-rose-700 mb-0.5">解析失败</p>
            <p className="text-sm text-rose-600">{error}</p>
          </div>
          <button
            onClick={resetUpload}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-rose-200 text-rose-600 rounded-lg text-xs font-bold hover:bg-rose-50 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> 重试
          </button>
        </div>
      )}

      {/* 解析结果 */}
      {parsedData && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* 成功头部 */}
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">解析完成</p>
                <p className="text-xs text-slate-500">
                  从 <span className="font-medium text-slate-600">{fileName}</span> 中提取了 {parsedData.knowledgePoints?.length || 0} 个知识点
                </p>
              </div>
            </div>
            <button
              onClick={resetUpload}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-100 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> 重新上传
            </button>
          </div>

          {/* 结果标签切换 */}
          <div className="flex gap-2">
            {([
              { key: "summary", label: "摘要", icon: BookOpen },
              { key: "mindmap", label: "思维导图", icon: BrainCircuit },
              { key: "exercises", label: "配套习题", icon: Lightbulb },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveResultTab(tab.key)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  activeResultTab === tab.key
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.key === "exercises" && parsedData.exercises?.length > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    activeResultTab === tab.key ? "bg-white/20 text-white" : "bg-blue-50 text-blue-600"
                  }`}>
                    {parsedData.exercises.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* 摘要 Tab */}
          {activeResultTab === "summary" && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <BookOpen className="w-5 h-5 text-blue-500" />
                <h3 className="font-bold text-slate-800">资料摘要</h3>
              </div>
              <div className="prose prose-sm max-w-none text-slate-700">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {parsedData.summary || "暂无摘要"}
                </ReactMarkdown>
              </div>

              {parsedData.knowledgePoints?.length > 0 && (
                <div className="mt-5 pt-5 border-t border-slate-100">
                  <h4 className="font-bold text-slate-800 text-sm mb-3">提取的知识点</h4>
                  <div className="flex flex-wrap gap-2">
                    {parsedData.knowledgePoints.map((kp: string, i: number) => (
                      <span
                        key={i}
                        className="px-3 py-1.5 bg-blue-50 text-blue-700 text-sm font-medium rounded-xl border border-blue-100"
                      >
                        {kp}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 思维导图 Tab */}
          {activeResultTab === "mindmap" && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <BrainCircuit className="w-5 h-5 text-purple-500" />
                <h3 className="font-bold text-slate-800">思维导图</h3>
              </div>
              {parsedData.mindmap ? (
                <MindmapDisplay mindmap={parsedData.mindmap} />
              ) : (
                <p className="text-sm text-slate-400 text-center py-8">暂无思维导图数据</p>
              )}
            </div>
          )}

          {/* 习题 Tab — 交互式做题（参照 ExerciseModule renderDoing） */}
          {activeResultTab === "exercises" && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              {/* 习题列表视图 */}
              {exerciseView === "list" && (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <Lightbulb className="w-5 h-5 text-amber-500" />
                    <h3 className="font-bold text-slate-800">配套习题 ({parsedData.exercises?.length || 0} 道)</h3>
                    <span className="text-xs text-slate-400 ml-auto">
                      已作答 {Object.keys(exerciseAnswers).length}/{parsedData.exercises?.length || 0}
                    </span>
                  </div>
                  {parsedData.exercises?.length > 0 ? (
                    <div className="space-y-3">
                      {parsedData.exercises.map((q: any, i: number) => {
                        const ans = exerciseAnswers[q.id];
                        const isDone = ans !== undefined;
                        const isCorrect = isDone && ans === q.answer;
                        return (
                          <div key={q.id || i} className="p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-blue-300 transition-colors">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">{q.type}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                q.difficulty === "易" ? "bg-emerald-50 text-emerald-600" :
                                q.difficulty === "中" ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600"
                              }`}>{q.difficulty}</span>
                              {isDone && (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                                  isCorrect ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                                }`}>
                                  {isCorrect ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                  {isCorrect ? "已做对" : "已做错"}
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-medium text-slate-800 mb-3">{i + 1}. {q.title}</p>
                            <div className="flex justify-end">
                              <button
                                onClick={() => {
                                  setCurrentExerciseIdx(i);
                                  setSelectedExerciseOpt(exerciseAnswers[q.id] ?? null);
                                  setExerciseView("doing");
                                }}
                                className={`px-4 py-2 font-bold text-sm rounded-xl transition-colors flex items-center gap-1.5 ${
                                  isDone
                                    ? "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"
                                    : "bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white"
                                }`}
                              >
                                {isDone ? "查看作答" : "开始做题"} <ChevronRight className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 text-center py-8">暂无配套习题</p>
                  )}
                </>
              )}

              {/* 习题做题视图 — 逐题交互 */}
              {exerciseView === "doing" && (() => {
                const exercises = parsedData.exercises || [];
                const q = exercises[currentExerciseIdx];
                const hasAnswered = q && exerciseAnswers[q.id] !== undefined;
                const total = exercises.length;

                const handleSubmit = () => {
                  if (selectedExerciseOpt === null || !q) return;
                  setExerciseAnswers(prev => ({ ...prev, [q.id]: selectedExerciseOpt }));
                  const correct = selectedExerciseOpt === q.answer;
                  if (correct) setExerciseToast("");
                  else setExerciseToast("");
                  setTimeout(() => setExerciseToast(""), 2000);
                  emitLearningEvent("exercise_answer", {
                    questionId: q.id,
                    correct,
                    selectedOption: selectedExerciseOpt,
                    correctOption: q.answer,
                    difficulty: q.difficulty,
                  });
                };

                const goNext = () => {
                  if (currentExerciseIdx < total - 1) {
                    const next = currentExerciseIdx + 1;
                    setCurrentExerciseIdx(next);
                    setSelectedExerciseOpt(exerciseAnswers[exercises[next].id] ?? null);
                  }
                };

                const goPrev = () => {
                  if (currentExerciseIdx > 0) {
                    const prev = currentExerciseIdx - 1;
                    setCurrentExerciseIdx(prev);
                    setSelectedExerciseOpt(exerciseAnswers[exercises[prev].id] ?? null);
                  }
                };

                return (
                  <div className="max-w-3xl mx-auto relative">
                    {exerciseToast && (
                      <div className="absolute top-0 right-0 bg-emerald-50 border border-emerald-200 text-emerald-600 px-4 py-2 rounded-xl text-sm font-bold z-10 shadow-sm animate-in fade-in slide-in-from-top-2">
                        {exerciseToast}
                      </div>
                    )}

                    <button
                      onClick={() => { setExerciseView("list"); setSelectedExerciseOpt(null); }}
                      className="flex items-center gap-2 text-slate-500 hover:text-blue-600 font-medium mb-4 transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" /> 返回题目列表
                    </button>

                    {q && (
                      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
                        <div className="flex items-center gap-3 mb-6 flex-wrap">
                          <span className="bg-blue-50 text-blue-600 font-bold px-3 py-1 rounded-lg text-sm">{q.type}</span>
                          <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                            q.difficulty === "易" ? "bg-emerald-50 text-emerald-600" :
                            q.difficulty === "中" ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600"
                          }`}>{q.difficulty}</span>
                          <span className="text-slate-400 font-medium text-sm">
                            题目 {currentExerciseIdx + 1} / {total}
                          </span>
                          {hasAnswered && (
                            <span className="ml-auto text-xs font-bold text-slate-400 flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-50 border border-slate-100">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> 已作答
                            </span>
                          )}
                        </div>

                        <h2 className="text-lg sm:text-xl font-bold text-slate-800 mb-8 leading-relaxed">{q.title}</h2>

                        <div className="space-y-4 mb-8">
                          {q.options?.map((opt: string, oi: number) => {
                            const isSelected = selectedExerciseOpt === oi;
                            const isCorrectOpt = hasAnswered && oi === q.answer;
                            const isWrongSelected = hasAnswered && isSelected && oi !== q.answer;

                            let btnClass = "w-full text-left p-4 rounded-xl border-2 transition-all flex items-center justify-between ";
                            if (!hasAnswered) {
                              btnClass += isSelected
                                ? "border-blue-500 bg-blue-50/50"
                                : "border-slate-100 hover:border-slate-300 bg-slate-50";
                            } else {
                              if (isCorrectOpt) btnClass += "border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm";
                              else if (isWrongSelected) btnClass += "border-rose-400 bg-rose-50 text-rose-800 shadow-sm";
                              else btnClass += "border-slate-100 bg-slate-50 opacity-50";
                            }

                            return (
                              <button
                                key={oi}
                                disabled={hasAnswered}
                                onClick={() => setSelectedExerciseOpt(oi)}
                                className={btnClass}
                              >
                                <div className="flex items-center gap-3">
                                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm transition-colors ${
                                    !hasAnswered
                                      ? isSelected ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-500"
                                      : isCorrectOpt ? "bg-emerald-500 text-white"
                                      : isWrongSelected ? "bg-rose-500 text-white"
                                      : "bg-white border border-slate-200 text-slate-400"
                                  }`}>
                                    {String.fromCharCode(65 + oi)}
                                  </span>
                                  <span className="font-medium text-[15px]">{opt}</span>
                                </div>
                                {hasAnswered && isCorrectOpt && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
                                {hasAnswered && isWrongSelected && <XCircle className="w-5 h-5 text-rose-500 shrink-0" />}
                              </button>
                            );
                          })}
                        </div>

                        {hasAnswered && (
                          <div className="mt-4 p-5 sm:p-6 bg-slate-50 border border-slate-200 rounded-2xl animate-in fade-in slide-in-from-bottom-4 shadow-sm">
                            <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                              <BookOpen className="w-5 h-5 text-blue-500" /> 答案与解析
                            </h4>
                            <div className="text-slate-600 leading-relaxed text-[15px]">
                              正确答案是 <span className="font-bold text-emerald-600 px-1 bg-emerald-100/50 rounded">{String.fromCharCode(65 + q.answer)}</span>。
                              {q.analysis && (
                                <div className="markdown-body text-[14px] mt-2">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{q.analysis}</ReactMarkdown>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap justify-between gap-3">
                          <button
                            onClick={() => { setExerciseView("list"); setSelectedExerciseOpt(null); }}
                            className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors"
                          >
                            返回列表
                          </button>
                          <div className="flex gap-2">
                            {currentExerciseIdx > 0 && (
                              <button onClick={goPrev} className="px-5 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors">
                                上一题
                              </button>
                            )}
                            {!hasAnswered ? (
                              <button
                                onClick={handleSubmit}
                                disabled={selectedExerciseOpt === null}
                                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_12px_rgba(37,99,235,0.2)]"
                              >
                                提交答案
                              </button>
                            ) : currentExerciseIdx < total - 1 ? (
                              <button onClick={goNext} className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors shadow-[0_4px_12px_rgba(37,99,235,0.2)]">
                                下一题
                              </button>
                            ) : (
                              <button
                                onClick={() => { setExerciseView("list"); setSelectedExerciseOpt(null); }}
                                className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-bold hover:from-emerald-600 hover:to-teal-700 transition-all shadow-[0_4px_12px_rgba(16,185,129,0.3)]"
                              >
                                完成
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* 操作提示 */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-5 border border-blue-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ExternalLink className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-sm font-bold text-slate-700">已自动保存到学习档案</p>
                <p className="text-xs text-slate-500">后续可在对应模块中查看和使用这些内容</p>
              </div>
            </div>
            <button
              onClick={handleApplyToDocs}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
            >
              应用到文档
            </button>
          </div>
        </div>
      )}

      {/* 历史上传记录 */}
      {!parsedData && materials.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h3 className="font-bold text-slate-800 text-sm mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-500" />
            历史解析记录 ({materials.length})
          </h3>
          <div className="space-y-3">
            {materials.slice().reverse().map((mat: any) => (
              <div
                key={mat.id}
                className="p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-blue-200 transition-colors cursor-pointer"
                onClick={() => {
                  setParsedData({
                    summary: mat.summary,
                    knowledgePoints: mat.knowledgePoints,
                    mindmap: mat.mindmap,
                    exercises: mat.exercises,
                  });
                  setFileName(mat.fileName);
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold text-slate-700 truncate">{mat.fileName}</span>
                  <span className="text-[10px] text-slate-400">
                    {mat.uploadedAt ? new Date(mat.uploadedAt).toLocaleDateString() : ""}
                  </span>
                </div>
                <p className="text-xs text-slate-500 line-clamp-2">
                  {mat.knowledgePoints?.slice(0, 3).join(" · ") || "暂无知识点"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* 思维导图可视化组件 — ECharts 树图（支持滚轮缩放）*/
function countNodes(node: any): number {
  if (!node) return 0;
  let count = 1;
  if (node.children) {
    for (const child of node.children) {
      count += countNodes(child);
    }
  }
  return count;
}

function maxDepth(node: any): number {
  if (!node) return 0;
  if (!node.children || node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map((c: any) => maxDepth(c)));
}

function MindmapDisplay({ mindmap }: { mindmap: any }) {
  const nodeCount = useMemo(() => countNodes(mindmap), [mindmap]);
  const treeDepth = useMemo(() => maxDepth(mindmap), [mindmap]);

  // 根据节点数和深度动态计算画布尺寸
  const chartWidth = Math.max(900, treeDepth * 280);
  const chartHeight = Math.max(500, nodeCount * 55);

  // 缩放状态
  const [scale, setScale] = useState(1);
  const minScale = 0.3;
  const maxScale = 3;
  const scaleRef = useRef(scale);
  scaleRef.current = scale; // 保持 ref 与 state 同步，供原生事件回调使用

  // ---- 内联视图：滚动平移状态（配合 overflow-auto）----
  const [inlineDragging, setInlineDragging] = useState(false);
  const inlineDragRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const inlineContainerRef = useRef<HTMLDivElement>(null);

  // ---- 全屏弹窗：translate 平移状态 ----
  const [fsPan, setFsPan] = useState({ x: 0, y: 0 });
  const [fsDragging, setFsDragging] = useState(false);
  const fsDragRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const fsBodyRef = useRef<HTMLDivElement>(null);

  // 原生 wheel 事件 — 必须在 passive: false 下注册，才能可靠阻止浏览器默认滚动
  useEffect(() => {
    const applyZoom = (deltaY: number) => {
      setScale(prev => {
        const delta = deltaY > 0 ? -0.08 : 0.08;
        const next = prev + delta;
        return Math.max(minScale, Math.min(maxScale, Math.round(next * 100) / 100));
      });
    };

    const onWheelInline = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      applyZoom(e.deltaY);
    };

    const onWheelFs = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      applyZoom(e.deltaY);
    };

    const inlineEl = inlineContainerRef.current;
    const fsEl = fsBodyRef.current;

    inlineEl?.addEventListener("wheel", onWheelInline, { passive: false });
    fsEl?.addEventListener("wheel", onWheelFs, { passive: false });

    return () => {
      inlineEl?.removeEventListener("wheel", onWheelInline);
      fsEl?.removeEventListener("wheel", onWheelFs);
    };
  }, []);

  // ---- 内联视图：滚动平移事件（overflow-auto 容器）----
  const handleInlineMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const el = inlineContainerRef.current;
    if (!el) return;
    setInlineDragging(true);
    inlineDragRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    };
    e.preventDefault();
  }, []);

  const handleInlineMouseMove = useCallback((e: React.MouseEvent) => {
    if (!inlineDragging) return;
    const el = inlineContainerRef.current;
    if (!el) return;
    el.scrollLeft = inlineDragRef.current.scrollLeft - (e.clientX - inlineDragRef.current.x);
    el.scrollTop = inlineDragRef.current.scrollTop - (e.clientY - inlineDragRef.current.y);
  }, [inlineDragging]);

  const handleInlineMouseUp = useCallback(() => setInlineDragging(false), []);

  // ---- 全屏弹窗平移事件 ----
  const handleFsMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setFsDragging(true);
    fsDragRef.current = { x: e.clientX, y: e.clientY, panX: fsPan.x, panY: fsPan.y };
    e.preventDefault();
  }, [fsPan]);

  const handleFsMouseMove = useCallback((e: React.MouseEvent) => {
    if (!fsDragging) return;
    setFsPan({
      x: fsDragRef.current.panX + (e.clientX - fsDragRef.current.x),
      y: fsDragRef.current.panY + (e.clientY - fsDragRef.current.y),
    });
  }, [fsDragging]);

  const handleFsMouseUp = useCallback(() => setFsDragging(false), []);

  const zoomIn = () => setScale(prev => Math.min(maxScale, prev + 0.15));
  const zoomOut = () => setScale(prev => Math.max(minScale, prev - 0.15));
  const resetZoom = () => { setScale(1); setFsPan({ x: 0, y: 0 }); };

  const option = useMemo(() => ({
    tooltip: {
      trigger: "item" as const,
      triggerOn: "mousemove" as const,
      backgroundColor: "#fff",
      borderColor: "#e2e8f0",
      textStyle: { color: "#334155", fontSize: 13 },
      formatter: (params: any) => {
        return `<b>${params.name}</b>${params.value ? `<br/>权重: ${params.value}` : ""}`;
      },
    },
    series: [
      {
        type: "tree",
        data: [mindmap],
        top: "5%",
        left: "15%",
        bottom: "5%",
        right: "8%",
        symbolSize: 10,
        orient: "LR",
        expandAndCollapse: true,
        initialTreeDepth: 3,
        roam: false,
        label: {
          position: "left",
          verticalAlign: "middle",
          align: "right",
          fontSize: 13,
          color: "#334155",
          fontWeight: 500,
          formatter: (params: any) => {
            const name: string = params.name;
            return name.length > 25 ? name.substring(0, 25) + "…" : name;
          },
        },
        leaves: {
          label: {
            position: "right",
            verticalAlign: "middle",
            align: "left",
            fontSize: 12,
            color: "#64748b",
          },
        },
        lineStyle: {
          color: "#cbd5e1",
          width: 2,
          curveness: 0.5,
        },
        itemStyle: {
          color: "#3b82f6",
          borderWidth: 0,
        },
        emphasis: {
          focus: "descendant" as const,
          lineStyle: {
            color: "#3b82f6",
            width: 3,
          },
          itemStyle: {
            color: "#2563eb",
            shadowBlur: 8,
            shadowColor: "rgba(59,130,246,0.3)",
          },
        },
      },
    ],
  }), [mindmap]);

  const [showFullscreen, setShowFullscreen] = useState(false);
  const scalePercent = Math.round(scale * 100);

  return (
    <div>
      {/* 缩放控制栏 */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-400">
          {nodeCount} 个节点 · {treeDepth} 层
        </span>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
            <button
              onClick={zoomOut}
              disabled={scale <= minScale}
              className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="缩小"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono font-bold text-slate-600 w-10 text-center select-none">
              {scalePercent}%
            </span>
            <button
              onClick={zoomIn}
              disabled={scale >= maxScale}
              className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="放大"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-slate-200 mx-0.5" />
            <button
              onClick={resetZoom}
              className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="恢复默认"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={() => setShowFullscreen(true)}
            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="全屏查看"
          >
            <Maximize className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 内联图表容器 — overflow-auto 可滚动，适配窄容器下完整查看 */}
      <div
        ref={inlineContainerRef}
        onMouseDown={handleInlineMouseDown}
        onMouseMove={handleInlineMouseMove}
        onMouseUp={handleInlineMouseUp}
        onMouseLeave={handleInlineMouseUp}
        className="border border-slate-200 rounded-xl bg-white overflow-auto group select-none relative"
        style={{ height: 520, cursor: inlineDragging ? "grabbing" : "grab" }}
        onClick={() => { if (!inlineDragging) setShowFullscreen(true); }}
      >
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            width: chartWidth,
            height: chartHeight,
            transition: "transform 0.12s ease-out",
          }}
        >
          <ReactECharts
            option={option}
            style={{ height: chartHeight, width: chartWidth }}
            opts={{ renderer: "canvas" }}
          />
        </div>
        {/* 悬停提示 */}
        <div className="fixed top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{ position: "absolute" }}>
          <span className="flex items-center gap-1.5 bg-black/60 text-white/90 text-xs px-2.5 py-1.5 rounded-lg font-medium backdrop-blur-sm">
            <Maximize className="w-3.5 h-3.5" /> 点击全屏查看
          </span>
        </div>
      </div>

      {/* 全屏弹窗 — 参照拓展材料实践项目弹窗设计 */}
      {showFullscreen && (
        <div
          className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-sm p-4 sm:p-6 animate-in fade-in duration-200 overflow-y-auto"
          onClick={() => setShowFullscreen(false)}
        >
          <div className="flex items-start justify-center min-h-full py-2">
            <div
              className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl border border-slate-100 animate-in zoom-in-95 duration-300 flex flex-col"
              style={{ minHeight: "calc(100vh - 5rem)" }}
              onClick={e => e.stopPropagation()}
            >
              {/* 弹窗头部 — 渐变背景 + 响应式内边距 */}
              <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-slate-100 bg-gradient-to-r from-white via-white to-purple-50/30 rounded-t-3xl shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-400 to-purple-500 flex items-center justify-center shrink-0 shadow-md shadow-purple-200">
                    <BrainCircuit className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-800 text-lg truncate">{mindmap.name || "思维导图"}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md">思维导图</span>
                      <span className="text-[11px] text-slate-400">{nodeCount} 个节点 · {treeDepth} 层</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowFullscreen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 弹窗主体 — 图表交互区 */}
              <div
                ref={fsBodyRef}
                className="flex-1 min-h-0 overflow-hidden px-6 sm:px-8 py-5 flex items-center justify-center select-none"
                onMouseDown={handleFsMouseDown}
                onMouseMove={handleFsMouseMove}
                onMouseUp={handleFsMouseUp}
                onMouseLeave={handleFsMouseUp}
                style={{ cursor: fsDragging ? "grabbing" : "grab" }}
              >
                <div
                  style={{
                    transform: `translate(${fsPan.x}px, ${fsPan.y}px) scale(${scale})`,
                    transformOrigin: "center center",
                    width: chartWidth,
                    height: chartHeight,
                    transition: fsDragging ? "none" : "transform 0.12s ease-out",
                  }}
                >
                  <ReactECharts
                    option={option}
                    style={{ height: chartHeight, width: chartWidth }}
                    opts={{ renderer: "canvas" }}
                  />
                </div>
              </div>

              {/* 底部控制栏 — 缩放操作 + 提示 */}
              <div className="px-6 sm:px-8 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-b-3xl shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                    <button
                      onClick={zoomOut}
                      disabled={scale <= minScale}
                      className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="缩小"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-mono font-bold text-slate-600 w-10 text-center select-none">
                      {scalePercent}%
                    </span>
                    <button
                      onClick={zoomIn}
                      disabled={scale >= maxScale}
                      className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="放大"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <div className="w-px h-5 bg-slate-200 mx-0.5" />
                    <button
                      onClick={resetZoom}
                      className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                      title="恢复默认"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>
                  <span className="text-xs text-slate-400 hidden sm:inline">
                    滚轮缩放 · 拖拽平移 · 点击节点展开
                  </span>
                </div>
                <button
                  onClick={() => setShowFullscreen(false)}
                  className="px-5 py-2.5 bg-slate-600 hover:bg-slate-700 text-white font-bold text-sm rounded-xl transition-colors shadow-sm"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
