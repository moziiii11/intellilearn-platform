import { useState, useEffect, useRef, useCallback } from "react";
import {
  PlayCircle,
  BookOpen,
  Lightbulb,
  Clock,
  Star,
  Globe,
  Video,
  FileText,
  GraduationCap,
  X,
  Bookmark,
  CheckCircle2,
  ListChecks,
  Target,
  AlertCircle,
  Loader2,
  SkipBack,
  SkipForward,
  Pause,
  ExternalLink,
} from "lucide-react";
import { useUser } from "../../UserContext";

const PLATFORM_ICONS: Record<string, string> = {
  "YouTube": "▶️",
  "Bilibili": "📺",
  "哔哩哔哩": "📺",
  "Coursera": "🎓",
  "edX": "🏛️",
  "Udemy": "💻",
  "中国大学MOOC": "🇨🇳",
  "网易云课堂": "☁️",
  "GitHub": "🐙",
};

export function ExtendedModule() {
  const { userProfile, emitLearningEvent, authHeaders } = useUser();
  const [videoModal, setVideoModal] = useState<{ id: number; title: string; level: string; duration: string; description: string } | null>(null);
  const [readingModal, setReadingModal] = useState<{ id: number; title: string; source: string; desc: string } | null>(null);
  const [projectModal, setProjectModal] = useState<{ id: number; title: string; difficulty: string; time: string; desc: string } | null>(null);

  // External links (video resource agent)
  const [externalLinks, setExternalLinks] = useState<any[]>([]);
  const [externalLinksTopic, setExternalLinksTopic] = useState("");
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);

  // AI content generation
  const [generatedContent, setGeneratedContent] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const contentCache = useRef<Record<string, string>>({});

  // Tutorial player state
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const topicName =
    userProfile?.learningPath?.[1]?.title ||
    userProfile?.majorOrInterests ||
    "当前学习主题";

  useEffect(() => {
    emitLearningEvent("extended_view", { topic: topicName });
    // Load cached external links from profile
    const cached = userProfile?.resources?.extended?.externalLinks;
    if (cached && cached.length > 0) {
      setExternalLinks(cached);
      setExternalLinksTopic(userProfile.resources.extended.externalLinksTopic || "");
    }
  }, []);

  // Fetch external links (video resource agent)
  const fetchExternalLinks = async (topic: string) => {
    if (isLoadingLinks) return;
    setIsLoadingLinks(true);
    try {
      const res = await fetch("/api/extended-links", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ topic }),
      });
      if (res.ok) {
        const data = await res.json();
        setExternalLinks(data.links || []);
        setExternalLinksTopic(topic);
      }
    } catch (e) {
      console.error("[ExtendedLinks] Fetch failed:", e);
    } finally {
      setIsLoadingLinks(false);
    }
  };

  // Fetch AI-generated content
  const generateContent = async (topic: string, type: string) => {
    const cacheKey = `${type}:${topic}`;
    if (contentCache.current[cacheKey]) {
      setGeneratedContent(contentCache.current[cacheKey]);
      setCurrentSlide(0);
      return;
    }
    setIsGenerating(true);
    setGeneratedContent("");
    setCurrentSlide(0);
    try {
      const res = await fetch("/api/generate-resource", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ userProfile, topic, type }),
      });
      if (res.ok) {
        const data = await res.json();
        contentCache.current[cacheKey] = data.text || "";
        setGeneratedContent(data.text || "");
      } else {
        setGeneratedContent("内容生成失败，请稍后重试。");
      }
    } catch (e) {
      setGeneratedContent("网络错误，无法生成内容。");
    } finally {
      setIsGenerating(false);
    }
  };

  // Parse generated content into slides (split by ## or ### headings)
  const parseSlides = useCallback((content: string): { title: string; body: string[] }[] => {
    if (!content) return [];
    const lines = content.split("\n");
    const slides: { title: string; body: string[] }[] = [];
    let currentTitle = "";
    let currentBody: string[] = [];

    for (const line of lines) {
      const h2Match = line.match(/^##\s+(.+)/);
      const h3Match = line.match(/^###\s+(.+)/);
      const headingMatch = h2Match || h3Match;

      if (headingMatch && line.match(/^#{1,3}\s/)) {
        if (currentTitle || currentBody.length > 0) {
          slides.push({ title: currentTitle || "教程内容", body: [...currentBody] });
        }
        currentTitle = headingMatch[1];
        currentBody = [];
      } else if (line.trim()) {
        currentBody.push(line);
      }
    }
    if (currentTitle || currentBody.length > 0) {
      slides.push({ title: currentTitle || "教程内容", body: [...currentBody] });
    }
    return slides.length > 0 ? slides : [{ title: "教程内容", body: content.split("\n").filter(l => l.trim()) }];
  }, []);

  const slides = parseSlides(generatedContent);
  const totalSlides = slides.length;

  // Auto-play controls
  const stopAutoPlay = () => {
    if (autoPlayRef.current) {
      clearInterval(autoPlayRef.current);
      autoPlayRef.current = null;
    }
    setIsAutoPlaying(false);
  };

  const startAutoPlay = () => {
    stopAutoPlay();
    setIsAutoPlaying(true);
    autoPlayRef.current = setInterval(() => {
      setCurrentSlide(prev => {
        if (prev >= totalSlides - 1) {
          stopAutoPlay();
          return prev;
        }
        return prev + 1;
      });
    }, 5000);
  };

  useEffect(() => {
    return () => stopAutoPlay();
  }, []);

  const goToSlide = (idx: number) => {
    stopAutoPlay();
    setCurrentSlide(Math.max(0, Math.min(idx, totalSlides - 1)));
  };

  // 基于用户画像生成拓展学习材料
  const dynamicExtended = userProfile?.resources?.extended || {};

  const videos = dynamicExtended.videos || [
    { id: 1, title: `${topicName} 入门教程`, duration: "45分钟", level: "初级", source: "AI 定制教程", description: `系统化学习${topicName}的核心概念，从基础到实战全覆盖` },
    { id: 2, title: `${topicName} 实战项目解析`, duration: "30分钟", level: "中级", source: "AI 定制教程", description: `通过真实案例深入理解${topicName}的应用场景与最佳实践` },
    { id: 3, title: `${topicName} 进阶技巧与优化`, duration: "25分钟", level: "高级", source: "AI 定制教程", description: `掌握${topicName}的高级特性和性能优化技巧` },
  ];

  const readings = dynamicExtended.readings || [
    { id: 1, title: `${topicName} 核心概念详解`, source: "知识讲解", icon: BookOpen, desc: `权威解读${topicName}的核心概念，涵盖所有基础知识点和用法说明` },
    { id: 2, title: `${topicName} 深入原理剖析`, source: "深度阅读", icon: Globe, desc: `从底层原理出发，帮助你建立对${topicName}的系统认知` },
    { id: 3, title: `${topicName} 最佳实践指南`, source: "社区精选", icon: Star, desc: `汇总社区公认的${topicName}编码规范和设计模式` },
    { id: 4, title: `${topicName} 常见问题与解答`, source: "FAQ", icon: FileText, desc: `整理${topicName}学习过程中最常见的问题和详细解答` },
  ];

  const projects = dynamicExtended.projects || [
    { id: 1, title: `${topicName} 基础练习`, difficulty: "入门", time: "2-3小时", desc: `巩固${topicName}的基础知识点，完成配套练习任务` },
    { id: 2, title: `${topicName} 综合应用`, difficulty: "进阶", time: "4-6小时", desc: `将${topicName}应用到实际场景中，构建一个完整的小项目` },
    { id: 3, title: `${topicName} 创新挑战`, difficulty: "挑战", time: "1-2天", desc: `基于${topicName}设计并实现一个创新性的解决方案` },
  ];

  const getProjectSteps = (difficulty: string) => {
    const s: Record<string, string[]> = {
      "入门": ["阅读相关基础文档，理解核心概念", "搭建开发环境，安装必要工具", "完成基础代码练习，通过单元测试", "提交代码并撰写学习笔记"],
      "进阶": ["分析需求，设计项目架构", "实现核心功能模块", "编写测试用例，保证代码覆盖率", "优化性能并处理边界情况", "编写项目文档和使用说明"],
      "挑战": ["调研技术方案，评估可行性", "设计系统架构和数据模型", "分阶段迭代开发核心功能", "进行压力测试和性能调优", "部署上线并持续监控", "总结技术经验，产出分享文章"],
    };
    return s[difficulty] || s["入门"];
  };

  const getProjectGoals = (difficulty: string) => {
    if (difficulty === "入门") return `通过本项目的练习，掌握${topicName}的核心知识点和基本操作，能够独立完成简单的开发任务。`;
    if (difficulty === "进阶") return `综合运用${topicName}的各项技能，完成一个功能完整的中型项目，培养独立解决问题的能力。`;
    return `挑战自我，设计并实现一个创新性项目，锻炼架构设计能力和全栈开发思维，产出可展示的作品。`;
  };

  const closeVideo = () => { stopAutoPlay(); setVideoModal(null); setGeneratedContent(""); };
  const closeReading = () => { setReadingModal(null); setGeneratedContent(""); };
  const closeProject = () => { setProjectModal(null); };

  // 渲染单行内容
  const renderLine = (line: string, i: number) => {
    if (line.startsWith("```")) {
      const lang = line.replace(/```/g, "").trim();
      return <div key={i} className="text-[11px] text-rose-300/60 font-mono mt-3 mb-1 px-1">{lang || "code"}</div>;
    }
    if (line.match(/^\d+\.\s/)) {
      return <li key={i} className="text-[14px] text-slate-200 leading-relaxed ml-4 list-decimal">{line.replace(/^\d+\.\s*/, "")}</li>;
    }
    if (line.startsWith("- ")) {
      return <li key={i} className="text-[14px] text-slate-200 leading-relaxed ml-4 list-disc">{line.slice(2)}</li>;
    }
    // Inline code
    const withCode = line.replace(/`([^`]+)`/g, '<code class="bg-white/10 text-rose-300 px-1 py-0.5 rounded text-[13px] font-mono">$1</code>');
    if (withCode !== line) {
      return <p key={i} className="text-[14px] text-slate-200 leading-relaxed" dangerouslySetInnerHTML={{ __html: withCode }} />;
    }
    return <p key={i} className="text-[14px] text-slate-200 leading-relaxed">{line}</p>;
  };

  return (
    <div className="h-full overflow-y-auto p-2 space-y-8">
      {/* ========== 公开学习资源推荐 (AI 推荐真实外部链接) ========== */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <Globe className="w-4 h-4 text-amber-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">公开学习资源推荐</h3>
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">AI 推荐</span>
          </div>
          <button
            onClick={() => fetchExternalLinks(topicName)}
            disabled={isLoadingLinks}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-xl transition-colors disabled:opacity-50"
          >
            {isLoadingLinks ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 搜索中...</>
            ) : (
              <><Globe className="w-3.5 h-3.5" /> {externalLinks.length > 0 ? "刷新推荐" : "搜索资源"}</>
            )}
          </button>
        </div>

        {externalLinks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {externalLinks.map((link: any, idx: number) => (
              <a
                key={idx}
                href={`https://www.bilibili.com/search?keyword=${encodeURIComponent(link.searchQuery || link.title)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white border border-amber-200 rounded-2xl p-5 hover:border-amber-400 hover:shadow-md transition-all cursor-pointer group flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg" title={link.platform}>
                      {PLATFORM_ICONS[link.platform] || "🔗"}
                    </span>
                    <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg">
                      {link.platform}
                    </span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    link.level === "初级" ? "text-emerald-600 bg-emerald-50" :
                    link.level === "中级" ? "text-orange-600 bg-orange-50" :
                    "text-rose-600 bg-rose-50"
                  }`}>
                    {link.level}
                  </span>
                </div>

                <div className="flex-1">
                  <h4 className="font-bold text-slate-800 text-[15px] mb-1.5 group-hover:text-amber-600 transition-colors line-clamp-2">
                    {link.title}
                  </h4>
                  <p className="text-[12px] text-slate-500 line-clamp-2">{link.description}</p>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {link.duration}
                  </span>
                  <span className="text-amber-500 font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ExternalLink className="w-3 h-3" /> 打开资源
                  </span>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div
            onClick={() => fetchExternalLinks(topicName)}
            className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-6 border border-amber-200 border-dashed text-center cursor-pointer hover:border-amber-400 hover:shadow-md transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
              <Globe className="w-6 h-6 text-amber-500" />
            </div>
            <p className="text-sm font-bold text-slate-700 mb-1">
              {isLoadingLinks ? "AI 正在搜索优质学习资源..." : "点击搜索当前主题的公开学习资源"}
            </p>
            <p className="text-xs text-slate-500">
              主题：{externalLinksTopic || topicName}
            </p>
          </div>
        )}
      </section>

      {/* ========== 视频教程卡片 ========== */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center">
            <Video className="w-4 h-4 text-rose-500" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">视频教程</h3>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">AI 定制生成</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {videos.map((video) => (
            <div
              key={video.id}
              onClick={() => { setVideoModal(video); generateContent(video.title, "video-code"); }}
              className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-rose-300 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="w-full aspect-video bg-gradient-to-br from-slate-100 to-slate-200 rounded-xl mb-4 flex items-center justify-center relative overflow-hidden group-hover:from-rose-50 group-hover:to-rose-100 transition-all">
                <div className="w-14 h-14 rounded-full bg-white/90 shadow-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                  <PlayCircle className="w-7 h-7 text-rose-500 fill-rose-100" />
                </div>
                <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-bold px-2 py-1 rounded-md">{video.duration}</span>
              </div>
              <h4 className="font-bold text-slate-800 text-[15px] mb-1.5 group-hover:text-rose-600 transition-colors">{video.title}</h4>
              <p className="text-[13px] text-slate-500 line-clamp-2 mb-3">{video.description}</p>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg">{video.level}</span>
                <span className="text-[11px] text-slate-400">{video.source}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ========== 拓展阅读卡片 ========== */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-blue-500" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">拓展阅读</h3>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">AI 生成内容</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {readings.map((item) => (
            <div
              key={item.id}
              onClick={() => { setReadingModal(item); generateContent(item.title, "reading"); }}
              className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group flex gap-4"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-blue-100 transition-colors">
                <item.icon className="w-5 h-5 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-slate-800 text-[15px] group-hover:text-blue-600 transition-colors truncate">{item.title}</h4>
                <p className="text-[13px] text-slate-500 line-clamp-2 mb-2">{item.desc}</p>
                <span className="text-[11px] font-medium text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md">{item.source}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ========== 实践项目卡片 ========== */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
            <GraduationCap className="w-4 h-4 text-emerald-500" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">实践项目</h3>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">动手练习</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => setProjectModal(project)}
              className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="w-5 h-5 text-emerald-500" />
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${
                  project.difficulty === "入门" ? "bg-emerald-50 text-emerald-600" :
                  project.difficulty === "进阶" ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600"
                }`}>{project.difficulty}</span>
              </div>
              <h4 className="font-bold text-slate-800 text-[15px] mb-2 group-hover:text-emerald-600 transition-colors">{project.title}</h4>
              <p className="text-[13px] text-slate-500 line-clamp-2 mb-3">{project.desc}</p>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <Clock className="w-3.5 h-3.5" /><span>{project.time}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100 text-center">
        <p className="text-sm text-slate-600 font-medium">
          💡 以上拓展材料由 AI 根据你的学习进度和兴趣自动生成。
          <br className="hidden sm:block" />
          在"智能问答"中提出更多问题，AI 会为你推荐更加精准的学习资源。
        </p>
      </div>

      {/* ================================================================ */}
      {/* ========== 视频教程弹窗 — AI 生成的教程播放器 ========== */}
      {/* ================================================================ */}
      {videoModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[200] animate-in fade-in duration-200" onClick={closeVideo}>
          <div className="w-full h-full max-w-6xl max-h-[95vh] flex flex-col animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
            {/* 顶部标题栏 */}
            <div className="flex items-center justify-between px-6 py-4 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-rose-500/20 flex items-center justify-center shrink-0">
                  <PlayCircle className="w-5 h-5 text-rose-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-white text-base truncate">{videoModal.title}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md">{videoModal.level}</span>
                    {slides.length > 0 && <span className="text-[11px] text-slate-400">第 {currentSlide + 1}/{totalSlides} 节</span>}
                  </div>
                </div>
              </div>
              <button onClick={closeVideo} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors shrink-0"><X className="w-5 h-5" /></button>
            </div>

            {/* 教程内容展示区 */}
            <div className="flex-1 min-h-0 mx-6 mb-4 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-white/5 overflow-hidden flex flex-col">
              {isGenerating ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                  <Loader2 className="w-12 h-12 text-rose-400 animate-spin" />
                  <p className="text-sm text-slate-400 font-medium">AI 正在根据你的学习情况生成教程…</p>
                  <p className="text-xs text-slate-500">分析画像 → 匹配知识点 → 生成定制内容</p>
                </div>
              ) : slides.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                  <Video className="w-12 h-12 text-slate-600" />
                  <p className="text-sm text-slate-500">暂无内容</p>
                </div>
              ) : (
                <>
                  {/* 幻灯片内容 */}
                  <div className="flex-1 overflow-y-auto p-8 sm:p-12">
                    <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-right-4 duration-300" key={currentSlide}>
                      <h2 className="text-xl sm:text-2xl font-bold text-white mb-6 pb-4 border-b border-white/10">
                        {slides[currentSlide].title}
                      </h2>
                      <div className="space-y-3">
                        {slides[currentSlide].body.map((line, i) => renderLine(line, i))}
                      </div>
                    </div>
                  </div>

                  {/* 底部控制栏 */}
                  <div className="shrink-0 bg-black/30 backdrop-blur-sm border-t border-white/5 px-6 py-4">
                    {/* 进度条 */}
                    <div className="flex gap-1 mb-4">
                      {slides.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => goToSlide(i)}
                          className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                            i < currentSlide ? "bg-rose-500" :
                            i === currentSlide ? "bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.5)]" :
                            "bg-white/10 hover:bg-white/20"
                          }`}
                        />
                      ))}
                    </div>

                    {/* 控制按钮 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => goToSlide(currentSlide - 1)}
                          disabled={currentSlide === 0}
                          className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <SkipBack className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => isAutoPlaying ? stopAutoPlay() : startAutoPlay()}
                          className={`p-2.5 rounded-xl transition-all ${
                            isAutoPlaying
                              ? "bg-rose-500/20 text-rose-400 hover:bg-rose-500/30"
                              : "bg-white/10 text-white hover:bg-white/20"
                          }`}
                          title={isAutoPlaying ? "暂停自动播放" : "自动播放（5秒/节）"}
                        >
                          {isAutoPlaying ? <Pause className="w-5 h-5" /> : <PlayCircle className="w-5 h-5 fill-current opacity-20" />}
                        </button>
                        <button
                          onClick={() => goToSlide(currentSlide + 1)}
                          disabled={currentSlide >= totalSlides - 1}
                          className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <SkipForward className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500 tabular-nums">{currentSlide + 1} / {totalSlides}</span>
                        <button className="flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-xl transition-colors">
                          <Bookmark className="w-4 h-4" /> 收藏
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* ========== 拓展阅读弹窗 ========== */}
      {/* ================================================================ */}
      {readingModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[200] p-4 sm:p-8 animate-in fade-in duration-200" onClick={closeReading}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 sm:p-6 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <BookOpen className="w-5 h-5 text-blue-500" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-800 text-lg truncate">{readingModal.title}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">{readingModal.source}</span>
                    <span className="text-[11px] text-slate-400">AI 生成内容</span>
                  </div>
                </div>
              </div>
              <button onClick={closeReading} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors shrink-0"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 sm:p-8">
              {isGenerating ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
                  <p className="text-sm text-slate-500 font-medium">AI 正在为你生成阅读资料…</p>
                </div>
              ) : (
                <div className="max-w-none">
                  {generatedContent ? (
                    <div className="space-y-3">
                      {generatedContent.split("\n").map((line, i) => {
                        if (line.startsWith("### ")) return <h4 key={i} className="font-bold text-slate-800 text-base mt-4 mb-2">{line.slice(4)}</h4>;
                        if (line.startsWith("## ")) return <h3 key={i} className="font-bold text-slate-800 text-lg mt-5 mb-2 pb-1 border-b border-slate-200">{line.slice(3)}</h3>;
                        if (line.startsWith("# ")) return <h3 key={i} className="font-bold text-slate-800 text-xl mt-4 mb-3">{line.slice(2)}</h3>;
                        if (line.startsWith("- ")) return <li key={i} className="text-sm text-slate-700 ml-4 leading-relaxed">{line.slice(2)}</li>;
                        if (line.match(/^\d+\. /)) return <li key={i} className="text-sm text-slate-700 ml-4 leading-relaxed">{line.replace(/^\d+\. /, "")}</li>;
                        if (line.trim() === "") return <div key={i} className="h-2" />;
                        return <p key={i} className="text-sm text-slate-700 leading-relaxed">{line}</p>;
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-10 text-slate-400"><p>内容加载失败，请关闭后重试。</p></div>
                  )}
                </div>
              )}
            </div>

            <div className="p-5 sm:p-6 bg-slate-50/80 shrink-0 border-t border-slate-100">
              <p className="text-sm text-slate-600 mb-4">{readingModal.desc}</p>
              <div className="flex items-center gap-3">
                <button onClick={closeReading} className="px-5 py-2.5 bg-slate-600 hover:bg-slate-700 text-white font-bold text-sm rounded-xl transition-colors">关闭</button>
                <button className="flex items-center gap-1.5 px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-sm rounded-xl transition-colors shadow-sm">
                  <Bookmark className="w-4 h-4" /> 加入收藏
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* ========== 实践项目弹窗 ========== */}
      {/* ================================================================ */}
      {projectModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[200] p-4 sm:p-8 animate-in fade-in duration-200" onClick={closeProject}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white/95 backdrop-blur-md flex items-center justify-between p-5 sm:p-6 border-b border-slate-100 shrink-0 z-10">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <Lightbulb className="w-5 h-5 text-emerald-500" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-800 text-lg truncate">{projectModal.title}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                      projectModal.difficulty === "入门" ? "bg-emerald-50 text-emerald-600" :
                      projectModal.difficulty === "进阶" ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600"
                    }`}>{projectModal.difficulty}</span>
                    <span className="text-[11px] text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" />{projectModal.time}</span>
                  </div>
                </div>
              </div>
              <button onClick={closeProject} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors shrink-0"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 sm:p-6 space-y-6">
              <div className="p-5 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border border-emerald-100">
                <h4 className="font-bold text-slate-800 text-sm mb-2 flex items-center gap-2"><Target className="w-4 h-4 text-emerald-500" /> 项目目标</h4>
                <p className="text-sm text-slate-700 leading-relaxed">{getProjectGoals(projectModal.difficulty)}</p>
              </div>

              <div className="p-5 bg-white border border-slate-200 rounded-2xl">
                <h4 className="font-bold text-slate-800 text-sm mb-4 flex items-center gap-2"><ListChecks className="w-4 h-4 text-blue-500" /> 实现步骤</h4>
                <div className="space-y-3">
                  {getProjectSteps(projectModal.difficulty).map((step, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl hover:bg-blue-50 transition-colors">
                      <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 font-bold text-xs">{idx + 1}</div>
                      <span className="text-sm text-slate-700 leading-relaxed pt-0.5">{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-5 bg-amber-50/50 rounded-2xl border border-amber-100">
                <h4 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-amber-500" /> 验收标准</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {["代码功能完整，无严重 Bug", "通过所有测试用例", "代码风格规范，有适当注释", "能够清晰讲解实现思路"].map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-slate-700">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />{item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <h5 className="font-bold text-slate-800 text-sm mb-1">学习提示</h5>
                  <p className="text-[13px] text-slate-600 leading-relaxed">遇到困难时，可以在"智能问答"中向 AI 导师提问获取帮助。建议先独立思考和尝试，再查看提示或参考答案。</p>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white/95 backdrop-blur-md p-5 sm:p-6 border-t border-slate-100 shrink-0 flex items-center gap-3">
              <button className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-colors shadow-sm">
                <CheckCircle2 className="w-4 h-4" /> 开始项目
              </button>
              <button className="flex items-center gap-1.5 px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-sm rounded-xl transition-colors shadow-sm">
                <Bookmark className="w-4 h-4" /> 加入收藏
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
