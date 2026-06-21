import { useState, useEffect } from "react";
import { cn } from "../lib/utils";
import {
  PlayCircle,
  CheckCircle2,
  Circle,
  FolderOpen,
  FileText,
  BookOpen,
  CheckCircle,
} from "lucide-react";
import { DocumentModule } from "../components/resources/DocumentModule";
import { MindmapModule } from "../components/resources/MindmapModule";
import { ExerciseModule } from "../components/resources/ExerciseModule";
import { CodeModule } from "../components/resources/CodeModule";
import { ExtendedModule } from "../components/resources/ExtendedModule";

const CircularProgress = ({
  // ...

  status,
}: {
  status: "completed" | "current" | "locked";
}) => {
  if (status === "completed") {
    return (
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md shadow-blue-500/30 z-10 relative">
        <CheckCircle2 className="w-5 h-5 text-white" />
      </div>
    );
  } else if (status === "current") {
    return (
      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white z-10 relative group-hover:scale-110 transition-transform duration-300">
        <svg
          className="absolute w-full h-full transform -rotate-90 animate-[spin_4s_linear_infinite]"
          viewBox="0 0 32 32"
        >
          <circle
            className="text-blue-500"
            strokeWidth="2.5"
            strokeDasharray="50"
            strokeDashoffset="15"
            strokeLinecap="round"
            stroke="currentColor"
            fill="transparent"
            r="14.5"
            cx="16"
            cy="16"
          />
        </svg>
        <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
      </div>
    );
  } else {
    return (
      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white z-10 relative group-hover:scale-110 transition-transform duration-300">
        <div className="w-full h-full rounded-full border-[2.5px] border-slate-200 opacity-60"></div>
      </div>
    );
  }
};

import { useUser } from "../UserContext";

export default function Resources() {
  const [toastMessage, setToastMessage] = useState("");
  const { userProfile, fetchProfile, chapterProgress, authHeaders } = useUser();

  // 每次进入学习资源页时拉取最新画像数据（确保 AI 生成的新资源能及时展示）
  useEffect(() => {
    fetchProfile();
  }, []);

  const chapters = chapterProgress?.chapters || [];

  const handleMarkChapterComplete = async (chapterId: string, chapterTitle: string) => {
    try {
      const res = await fetch("/api/chapter-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ chapterId }),
      });
      if (res.ok) {
        setToastMessage(`✅ 已完成：${chapterTitle}`);
        setTimeout(() => setToastMessage(""), 3000);
        fetchProfile();
      }
    } catch (e) {
      console.error("Failed to mark chapter complete:", e);
    }
  };

  const handleOpenResource = (title: string) => {
    setToastMessage(`正在打开: ${title} ... (模拟演示)`);
    setTimeout(() => setToastMessage(""), 3000);
  };

  const phases = userProfile?.learningPath || [];

  const tabs = ["课程文档", "思维导图", "习题", "代码实操", "拓展材料"];
  const [activeTab, setActiveTab] = useState("课程文档");

  const activePhase = phases.find((p: any) => p.status === "current");
  const currentProgress = activePhase?.progress || 0;

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6 relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-4 right-4 z-50 bg-slate-800 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
          <CheckCircle className="w-5 h-5 text-emerald-400" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Left Column: Learning Path */}
      <div className="w-[360px] shrink-0 bg-white/80 backdrop-blur-md rounded-3xl shadow-sm border border-slate-200/60 flex flex-col overflow-hidden transition-all duration-300">
        <div className="p-6 border-b border-slate-100/80 bg-slate-50/50">
          <h3 className="font-semibold text-slate-800 tracking-tight mb-3">
            动态里程碑学习路线
          </h3>

          <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 shadow-lg shadow-blue-900/10 rounded-2xl p-4 mt-2 flex items-center gap-4 relative overflow-hidden transition-transform hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-900/20">
            <div className="absolute right-0 top-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>
            <div className="shrink-0 relative flex items-center justify-center">
              <svg
                className="transform -rotate-90 w-14 h-14"
                viewBox="0 0 56 56"
              >
                <circle
                  className="text-slate-600/50"
                  strokeWidth="4"
                  stroke="currentColor"
                  fill="transparent"
                  r="24"
                  cx="28"
                  cy="28"
                />
                <circle
                  className="text-blue-500 transition-all duration-1000 ease-out"
                  strokeWidth="4"
                  strokeDasharray="150"
                  strokeDashoffset={150 - (currentProgress / 100) * 150}
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="transparent"
                  r="24"
                  cx="28"
                  cy="28"
                />
              </svg>
              <span className="absolute text-blue-400 font-bold text-sm tracking-wide">
                {currentProgress}%
              </span>
            </div>
            <div className="flex flex-col relative z-10 gap-0.5">
              <span className="text-white font-bold text-[17px] mb-0 tracking-tight">
                {activePhase ? `正在冲刺${activePhase.title}` : "学习计划已完成"}
              </span>
              <span className="text-slate-400 text-[11px] tracking-wide mt-1">
                {activePhase ? "AI已根据聊天为您生成专属资料" : "可以在对话中提出更多学习需求"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="relative">
            {/* Connection Line */}
            <div className="absolute left-[1.35rem] top-4 bottom-4 w-[2px] bg-gradient-to-b from-blue-500 via-blue-200 to-slate-200 -z-10 rounded-full"></div>

            <div className="space-y-6">
              {phases.map((phase, index) => (
                <div key={index} className="flex gap-4 group cursor-pointer">
                  <div className="mt-1 relative bg-white">
                    <CircularProgress status={phase.status} />
                  </div>
                  <div
                    className={`p-4 rounded-2xl border flex-1 transition-all duration-300 group-hover:-translate-y-[1px] group-hover:shadow-md ${
                      phase.status === "current"
                        ? "border-blue-500 bg-[#E8F3FF] shadow-sm"
                        : phase.status === "completed"
                          ? "border-slate-200 bg-white opacity-90"
                          : "border-slate-100 bg-slate-50/50 opacity-70 group-hover:opacity-100"
                    }`}
                  >
                    <div
                      className={`font-bold text-[15px] mb-1 transition-colors ${
                        phase.status === "current"
                          ? "text-slate-800"
                          : phase.status === "completed"
                            ? "text-slate-500"
                            : "text-slate-700 group-hover:text-slate-800"
                      }`}
                    >
                      {phase.title}
                    </div>
                    <div
                      className={`text-[11px] font-medium tracking-wide mb-3 ${
                        phase.status === "current"
                          ? "text-blue-600/80"
                          : "text-slate-400"
                      }`}
                    >
                      {phase.statusMsg}
                    </div>
                    <ul className="space-y-2">
                      {phase.items.map((item, i) => (
                        <li
                          key={i}
                          className={`text-[13px] flex items-center gap-2 transition-colors ${
                            phase.status === "completed"
                              ? "text-slate-400"
                              : phase.status === "current"
                                ? "text-slate-700"
                                : "text-slate-500"
                          }`}
                        >
                          <div
                            className={`w-1.5 h-1.5 rounded-full transition-colors ${
                              phase.status === "current"
                                ? "bg-blue-500"
                                : "bg-slate-300"
                            }`}
                          />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chapter Progress Section */}
        {chapters.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 px-1">
              学习章节进度
            </h4>
            <div className="space-y-3">
              {chapters.map((chapter: any) => (
                <div
                  key={chapter.id}
                  className={cn(
                    "p-3 rounded-xl border transition-all",
                    chapter.status === "completed" && "bg-emerald-50/50 border-emerald-200",
                    chapter.status === "current" && "bg-white border-blue-200 shadow-sm",
                    chapter.status !== "completed" && chapter.status !== "current" && "bg-slate-50/50 border-slate-100"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        chapter.status === "completed" ? "bg-emerald-500" : chapter.status === "current" ? "bg-blue-500" : "bg-slate-300"
                      )} />
                      <span className={cn(
                        "text-[12px] font-semibold truncate",
                        chapter.status === "completed" ? "text-emerald-700" : "text-slate-700"
                      )} title={chapter.title}>
                        {chapter.title}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                      {chapter.completedItems}/{chapter.totalItems}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        chapter.status === "completed" ? "bg-emerald-500" : "bg-blue-500"
                      )}
                      style={{ width: `${chapter.progress || 0}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "text-[10px] font-medium",
                      chapter.status === "completed" ? "text-emerald-500" : "text-slate-400"
                    )}>
                      {chapter.status === "completed"
                        ? `已 ${chapter.completedAt ? new Date(chapter.completedAt).toLocaleDateString() : "完成"}`
                        : `${chapter.progress || 0}%`}
                    </span>
                    {chapter.status !== "completed" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkChapterComplete(chapter.id, chapter.title);
                        }}
                        className="text-[10px] font-bold text-blue-500 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors"
                      >
                        标记完成
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {chapters.length === 0 && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-[11px] text-slate-400 text-center py-4">
              暂无学习章节，与AI对话后将自动生成
            </p>
          </div>
        )}
      </div>

      {/* Right Column */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {/* Tabs */}
        <div className="flex gap-2 shrink-0">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-6 py-2.5 rounded-full font-medium text-sm transition-all focus:outline-none ${
                activeTab === t
                  ? "bg-blue-600 text-white shadow-[0_4px_12px_rgba(37,99,235,0.3)] shadow-blue-600/30 font-bold"
                  : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 bg-white/40 backdrop-blur-md rounded-3xl border-2 border-blue-400 p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)] min-h-0 flex flex-col relative overflow-hidden transition-all duration-300">
          <div className={`h-full ${activeTab === "课程文档" ? "block" : "hidden"}`}>
            <DocumentModule />
          </div>
          <div className={`h-full ${activeTab === "思维导图" ? "block" : "hidden"}`}>
            <MindmapModule />
          </div>
          <div className={`h-full ${activeTab === "习题" ? "block" : "hidden"}`}>
            <ExerciseModule />
          </div>
          <div className={`h-full ${activeTab === "代码实操" ? "block" : "hidden"}`}>
            <CodeModule />
          </div>
          <div className={`h-full ${activeTab === "拓展材料" ? "block" : "hidden"}`}>
            <ExtendedModule />
          </div>
        </div>
      </div>
    </div>
  );
}
