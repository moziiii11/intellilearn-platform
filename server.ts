import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import fs from "fs";
import { jsonrepair } from "jsonrepair";
import { initMySQLDB, mysqlGetUser, mysqlCreateUser, mysqlUpdatePassword, mysqlVerifyUser, mysqlPing } from "./db-mysql.js";

dotenv.config();
if (fs.existsSync(".env.example")) {
  const envExample = dotenv.parse(fs.readFileSync(".env.example"));
  for (const k in envExample) {
    if (!process.env[k]) {
      process.env[k] = envExample[k];
    }
  }
}


// ============= Database Setup (JSON File) =============
const DB_FILE = path.join(process.cwd(), "db.json");

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {} }, null, 2));
  }
  try {
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    if (!raw.trim()) throw new Error("Empty DB");
    return JSON.parse(raw);
  } catch(e) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {} }, null, 2));
    return { users: {} };
  }
}

function writeDB(data: any) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function getUserProfile(username: string) {
  const db = readDB();
  if (!db.users[username]) return null;
  const profile = db.users[username].profile || {};
  // Override with real data computed from behavioral events
  const realCalendar = buildCalendarFromBehavioralEvents(username, db);
  const realTrend = buildTrendFromBehavioralEvents(username, db);
  const realScores = buildSubjectScoresFromBehavioralEvents(username, db, profile);
  return {
    name: username,
    ...profile,
    calendar: realCalendar,
    trendData: realTrend,
    abilityScores: realScores,
  };
}

function saveUserProfile(username: string, profile: any) {
  const db = readDB();
  if (!db.users[username]) return;
  db.users[username].profile = { ...db.users[username].profile, ...profile };
  writeDB(db);
}

function logUserAction(username: string, actionType: string, details: string) {
  const db = readDB();
  if (!db.users[username]) return;
  if (!db.users[username].logs) db.users[username].logs = [];
  db.users[username].logs.push({ timestamp: new Date().toISOString(), actionType, details });
  writeDB(db);
  // Note: Profile updates are now handled by updateProfileFromConversation(),
  // which is triggered directly from chat/tutor endpoints with full conversation context.
}

// ============= Conversation Context Store =============
function storeConversationContext(username: string, messages: any[]) {
  const db = readDB();
  if (!db.users[username]) return;
  if (!db.users[username].conversationHistory) {
    db.users[username].conversationHistory = [];
  }
  const contextEntry = {
    timestamp: new Date().toISOString(),
    messages: messages
      .filter((m: any) => m.role && m.content)
      .slice(-30)
      .map((m: any) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content.substring(0, 1000) : '',
      })),
  };
  db.users[username].conversationHistory.push(contextEntry);
  if (db.users[username].conversationHistory.length > 5) {
    db.users[username].conversationHistory = db.users[username].conversationHistory.slice(-5);
  }
  writeDB(db);
}

// ============= Profile Update Lock (prevents concurrent updates) =============
const profileUpdateLocks = new Set<string>();

// ============= SSE Push for Real-Time Profile Updates =============
const profileSSEClients = new Map<string, express.Response[]>();

function broadcastProfileUpdate(username: string) {
  const clients = profileSSEClients.get(username);
  if (!clients || clients.length === 0) return;

  const profile = getUserProfile(username);
  const db = readDB();
  const chapterProgress = getChapterProgress(username);
  const notifications = db.users[username]?.notifications || [];

  const eventData = JSON.stringify({
    type: "profile_updated",
    profile,
    chapterProgress,
    notifications,
    timestamp: new Date().toISOString(),
  });

  for (const client of clients) {
    try {
      client.write(`data: ${eventData}\n\n`);
    } catch (e) {
      // Client may have disconnected; cleanup happens on 'close' event
    }
  }
}

// ============= Chapter Progress Tracking =============
function getChapterProgress(username: string) {
  const db = readDB();
  if (!db.users[username]) return { chapters: [] };
  if (!db.users[username].chapterProgress) {
    db.users[username].chapterProgress = { chapters: [] };
    writeDB(db);
  }
  return db.users[username].chapterProgress;
}

function saveChapterProgress(username: string, progress: any) {
  const db = readDB();
  if (!db.users[username]) return;
  db.users[username].chapterProgress = progress;
  writeDB(db);
}

function registerChaptersFromResources(username: string, resources: any) {
  const db = readDB();
  if (!db.users[username]) return;
  const progress = getChapterProgress(username);
  const existingIds = new Set(progress.chapters.map((c: any) => c.id));

  const newChapters: any[] = [];

  // Register chapters from exercise categories
  const categories = resources?.exercises?.categories || [];
  for (const cat of categories) {
    const chapterId = `ex-${cat.id}`;
    if (!existingIds.has(chapterId)) {
      const totalQ = (resources.exercises.questions || []).filter((q: any) => q.categoryId === cat.id).length;
      newChapters.push({
        id: chapterId,
        title: cat.name,
        type: "exercises",
        phaseTitle: resources.exercises?.phaseTitle || "当前学习阶段",
        totalItems: totalQ,
        completedItems: 0,
        progress: 0,
        status: "current",
        createdAt: new Date().toISOString(),
        completedAt: null,
      });
    }
  }

  // Register chapters from docs
  const docs = resources?.docs || [];
  for (const doc of docs) {
    const chapterId = `doc-${doc.id}`;
    if (!existingIds.has(chapterId)) {
      newChapters.push({
        id: chapterId,
        title: doc.title,
        type: "document",
        phaseTitle: docs.phaseTitle || "当前学习阶段",
        totalItems: 1,
        completedItems: 0,
        progress: 0,
        status: "current",
        createdAt: new Date().toISOString(),
        completedAt: null,
      });
    }
  }

  // Register chapters from code exercises
  const codeEx = resources?.codeEx;
  if (codeEx && codeEx.title) {
    const chapterId = `code-${codeEx.title}`;
    if (!existingIds.has(chapterId)) {
      newChapters.push({
        id: chapterId,
        title: codeEx.title,
        type: "code",
        phaseTitle: codeEx.phaseTitle || "当前学习阶段",
        totalItems: 1,
        completedItems: 0,
        progress: 0,
        status: "current",
        createdAt: new Date().toISOString(),
        completedAt: null,
      });
    }
  }

  if (newChapters.length > 0) {
    progress.chapters.push(...newChapters);
    saveChapterProgress(username, progress);
    console.log(`[ChapterProgress] Registered ${newChapters.length} new chapters for ${username}`);
  }

  return newChapters;
}

function autoCheckChapterCompletion(username: string, db: any) {
  const progress = getChapterProgress(username);
  if (!progress.chapters.length) return false;

  let changed = false;

  for (const chapter of progress.chapters) {
    if (chapter.status === "completed") continue;

    if (chapter.type === "exercises") {
      // Check exercises: count correct answers in this category
      const events = db.users[username]?.behavioralEvents || [];
      const catId = chapter.id.replace("ex-", "");
      const exerciseEvents = events.filter(
        (e: any) => e.eventType === "exercise_answer" && e.payload?.categoryId === catId
      );
      // Get unique question IDs that were answered correctly
      const correctQIds = new Set<string>();
      for (const e of exerciseEvents) {
        if (e.payload?.correct && e.payload?.questionId) {
          correctQIds.add(e.payload.questionId);
        }
      }
      const newCompleted = correctQIds.size;
      if (newCompleted !== chapter.completedItems) {
        chapter.completedItems = newCompleted;
        chapter.progress = chapter.totalItems > 0
          ? Math.round((newCompleted / chapter.totalItems) * 100)
          : 0;
        changed = true;
      }
      if (chapter.totalItems > 0 && newCompleted >= chapter.totalItems && chapter.status !== "completed") {
        chapter.status = "completed";
        chapter.progress = 100;
        chapter.completedAt = new Date().toISOString();
        changed = true;
        console.log(`[ChapterProgress] Auto-completed: ${chapter.title}`);
      }
    }

    if (chapter.type === "document") {
      const events = db.users[username]?.behavioralEvents || [];
      const docId = chapter.id.replace("doc-", "");
      const docReadEvents = events.filter(
        (e: any) => e.eventType === "document_read" && e.payload?.docId === docId
      );
      if (docReadEvents.length > 0 && chapter.completedItems === 0) {
        chapter.completedItems = 1;
        chapter.progress = 100;
        chapter.status = "completed";
        chapter.completedAt = new Date().toISOString();
        changed = true;
        console.log(`[ChapterProgress] Auto-completed doc: ${chapter.title}`);
      }
    }

    if (chapter.type === "code") {
      const events = db.users[username]?.behavioralEvents || [];
      const codeTitle = chapter.id.replace("code-", "");
      const codeRunEvents = events.filter(
        (e: any) => e.eventType === "code_run" && e.payload?.codeExTitle === codeTitle
      );
      if (codeRunEvents.length > 0 && chapter.completedItems === 0) {
        chapter.completedItems = 1;
        chapter.progress = 100;
        chapter.status = "completed";
        chapter.completedAt = new Date().toISOString();
        changed = true;
        console.log(`[ChapterProgress] Auto-completed code: ${chapter.title}`);
      }
    }
  }

  if (changed) {
    saveChapterProgress(username, progress);

    // Auto-unlock next learning path phase when current phase chapters are all done
    const profile = db.users[username]?.profile;
    if (profile?.learningPath && profile.learningPath.length > 0) {
      const currentPhase = profile.learningPath.find((p: any) => p.status === "current");
      if (currentPhase) {
        const phaseChapters = progress.chapters.filter(
          (c: any) => c.phaseTitle === currentPhase.title && c.status !== "completed"
        );
        if (phaseChapters.length === 0) {
          // All chapters in current phase done → complete it, unlock next
          currentPhase.status = "completed";
          currentPhase.progress = 100;
          currentPhase.statusMsg = "已完成 · 全部掌握";
          const nextPhase = profile.learningPath.find((p: any) => p.status === "locked");
          if (nextPhase) {
            nextPhase.status = "current";
            nextPhase.progress = 0;
            nextPhase.statusMsg = "进行中 · 新阶段已解锁";
          }
          writeDB(db);
          console.log(`[ChapterProgress] Phase completed: ${currentPhase.title}, next phase unlocked`);
        }
      }
    }
  }

  return changed;
}

// ============= Build Behavioral Summary from Learning Events =============
function buildBehavioralSummary(username: string, db: any): string {
  const events: any[] = db.users[username]?.behavioralEvents || [];
  if (events.length === 0) return "";

  // Focus on recent events (last 7 days)
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentEvents = events.filter(
    (e: any) => new Date(e.timestamp).getTime() > sevenDaysAgo
  );
  if (recentEvents.length === 0) return "";

  // Summarize exercise performance
  const exerciseEvents = recentEvents.filter((e: any) => e.eventType === "exercise_answer");
  const wrongAnswers = exerciseEvents.filter((e: any) => e.payload?.correct === false);
  const correctAnswers = exerciseEvents.filter((e: any) => e.payload?.correct === true);

  // Group wrong answers by category
  const wrongByCategory: Record<string, { count: number; questions: string[]; difficulties: string[] }> = {};
  for (const e of wrongAnswers) {
    const cat = e.payload?.categoryName || e.payload?.categoryId || "未知分类";
    if (!wrongByCategory[cat]) wrongByCategory[cat] = { count: 0, questions: [], difficulties: [] };
    wrongByCategory[cat].count++;
    if (e.payload?.questionId && !wrongByCategory[cat].questions.includes(e.payload.questionId)) {
      wrongByCategory[cat].questions.push(e.payload.questionId);
    }
    if (e.payload?.difficulty) wrongByCategory[cat].difficulties.push(e.payload.difficulty);
  }

  // Summarize document reading
  const docEvents = recentEvents.filter((e: any) => e.eventType === "document_read");
  const totalReadingSeconds = docEvents.reduce(
    (sum: number, e: any) => sum + (e.payload?.readingTimeSeconds || 0), 0
  );
  const totalHighlights = recentEvents.filter((e: any) => e.eventType === "document_highlight").length;

  // Summarize code runs
  const codeEvents = recentEvents.filter((e: any) => e.eventType === "code_run");
  const totalCodeRuns = codeEvents.length;

  // Build summary string
  let summary = `\n## 学生学习行为数据（最近7天）\n`;
  summary += `- 总练习答题数: ${exerciseEvents.length}, 答对: ${correctAnswers.length}, 答错: ${wrongAnswers.length}\n`;
  summary += `- 答题正确率: ${exerciseEvents.length > 0 ? Math.round((correctAnswers.length / exerciseEvents.length) * 100) : 0}%\n`;

  if (Object.keys(wrongByCategory).length > 0) {
    summary += `- 薄弱知识点分布（按错误次数排序）:\n`;
    const sorted = Object.entries(wrongByCategory).sort((a, b) => b[1].count - a[1].count);
    for (const [cat, info] of sorted) {
      summary += `  - "${cat}": 错${info.count}次 (涉及${info.questions.length}道题, 难度分布: ${info.difficulties.join(", ")})\n`;
    }
  }

  summary += `- 文档阅读总时长: ${Math.round(totalReadingSeconds / 60)}分钟 (共${docEvents.length}次阅读)\n`;
  summary += `- 文档高亮笔记数: ${totalHighlights}\n`;
  summary += `- 代码运行次数: ${totalCodeRuns}\n`;

  return summary;
}

// ============= Build Real Calendar from Behavioral Events =============
function buildCalendarFromBehavioralEvents(username: string, db: any) {
  const events: any[] = db.users[username]?.behavioralEvents || [];

  // Group events by date (last 180 days to cover half-year view)
  const daysMap: Record<string, {
    events: any[];
    totalSeconds: number;
    subjects: Record<string, number>;
    chatCount: number;
    exerciseCount: number;
    docCount: number;
    codeCount: number;
  }> = {};

  const now = new Date();
  // Initialize last 180 days with empty entries
  for (let i = 0; i < 180; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    daysMap[dateStr] = { events: [], totalSeconds: 0, subjects: {}, chatCount: 0, exerciseCount: 0, docCount: 0, codeCount: 0 };
  }

  for (const evt of events) {
    const dateStr = evt.timestamp?.split('T')[0];
    if (!dateStr || !daysMap[dateStr]) continue;

    const day = daysMap[dateStr];
    day.events.push(evt);

    // Track subject/category
    let subject = '';
    switch (evt.eventType) {
      case 'exercise_answer':
        day.exerciseCount++;
        day.totalSeconds += 120; // ~2 min per exercise
        subject = evt.payload?.categoryName || evt.payload?.categoryId || '习题练习';
        break;
      case 'document_read':
        day.docCount++;
        day.totalSeconds += evt.payload?.readingTimeSeconds || 0;
        subject = evt.payload?.docTitle || '文档阅读';
        break;
      case 'document_highlight':
        day.totalSeconds += 30;
        subject = '文档标注';
        break;
      case 'code_run':
        day.codeCount++;
        day.totalSeconds += 300; // ~5 min per code session
        subject = evt.payload?.codeExTitle || '代码实操';
        break;
      case 'mindmap_view':
        day.totalSeconds += 60;
        subject = evt.payload?.topic || '思维导图';
        break;
      case 'extended_view':
        day.totalSeconds += 60;
        subject = evt.payload?.topic || '拓展材料';
        break;
      case 'chat':
      case 'chat_stream':
        day.chatCount++;
        day.totalSeconds += 180;
        subject = 'AI问答';
        break;
      default:
        day.totalSeconds += 60;
        subject = '学习活动';
    }
    if (subject) {
      day.subjects[subject] = (day.subjects[subject] || 0) + 1;
    }
  }

  // Build sorted date array (oldest first)
  const sortedDates = Object.keys(daysMap).sort();

  // Calculate intensity (1-4) based on total activity per day
  const getIntensity = (day: typeof daysMap[string]) => {
    const totalEvents = day.exerciseCount + day.docCount + day.codeCount + day.chatCount;
    if (totalEvents === 0) return 0;
    if (totalEvents <= 2) return 1;
    if (totalEvents <= 5) return 2;
    if (totalEvents <= 10) return 3;
    return 4;
  };

  // Get top subject for a day
  const getTopSubject = (day: typeof daysMap[string]) => {
    const entries = Object.entries(day.subjects).sort((a, b) => b[1] - a[1]);
    return entries[0]?.[0] || '未分类';
  };

  // Build details array
  const getDetails = (day: typeof daysMap[string]) => {
    const details: { type: string; content: string }[] = [];
    if (day.chatCount > 0) details.push({ type: 'chat', content: `与AI进行了${day.chatCount}次对话交流` });
    if (day.exerciseCount > 0) details.push({ type: 'exercise', content: `完成了${day.exerciseCount}道练习题` });
    if (day.docCount > 0) details.push({ type: 'doc', content: `阅读了${day.docCount}篇学习文档，累计${Math.round(day.totalSeconds / 60)}分钟` });
    if (day.codeCount > 0) details.push({ type: 'code', content: `进行了${day.codeCount}次代码实操练习` });
    return details;
  };

  const calendarData = sortedDates.map(dateStr => {
    const day = daysMap[dateStr];
    const hours = Math.max(0.1, Math.round((day.totalSeconds / 3600) * 10) / 10);
    return {
      date: dateStr,
      intensity: getIntensity(day),
      hours: hours.toFixed(1),
      subject: getTopSubject(day),
      tasks: day.exerciseCount + day.codeCount,
      details: getDetails(day),
    };
  });

  // Calculate totalActive (days with intensity > 0)
  const totalActive = calendarData.filter(d => d.intensity > 0).length;

  // Calculate maxStreak
  let maxStreak = 0;
  let currentStreak = 0;
  // Check from today backwards
  const today = now.toISOString().split('T')[0];
  for (const d of [...calendarData].reverse()) {
    if (d.date > today) continue; // skip future dates
    if (d.intensity > 0) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  return {
    totalActive,
    maxStreak,
    data: calendarData,
  };
}

// ============= Build Real Trend Data from Behavioral Events =============
function buildTrendFromBehavioralEvents(username: string, db: any) {
  const events: any[] = db.users[username]?.behavioralEvents || [];
  const dayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  // Get the past 7 days (today + 6 previous days)
  const now = new Date();
  const trend: { name: string; hours: number }[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayName = dayNames[d.getDay()];

    // Sum up time spent on this day
    const dayEvents = events.filter((e: any) => e.timestamp?.startsWith(dateStr));
    let totalSeconds = 0;
    for (const evt of dayEvents) {
      switch (evt.eventType) {
        case 'exercise_answer': totalSeconds += 120; break;
        case 'document_read': totalSeconds += evt.payload?.readingTimeSeconds || 0; break;
        case 'document_highlight': totalSeconds += 30; break;
        case 'code_run': totalSeconds += 300; break;
        case 'mindmap_view':
        case 'extended_view': totalSeconds += 60; break;
        case 'chat':
        case 'chat_stream': totalSeconds += 180; break;
        default: totalSeconds += 60;
      }
    }

    trend.push({
      name: dayName,
      hours: Math.round((totalSeconds / 3600) * 10) / 10,
    });
  }

  return trend;
}

// ============= Build Real Subject Mastery Scores from Behavioral Events =============
function buildSubjectScoresFromBehavioralEvents(username: string, db: any, existingProfile: any) {
  const events: any[] = db.users[username]?.behavioralEvents || [];

  // 1. knowledgeBase → exercise correct rate
  const exerciseEvents = events.filter((e: any) => e.eventType === 'exercise_answer');
  const correctCount = exerciseEvents.filter((e: any) => e.payload?.correct === true).length;
  const knowledgeBase = exerciseEvents.length > 0
    ? Math.round((correctCount / exerciseEvents.length) * 100)
    : (existingProfile?.abilityScores?.knowledgeBase || 50);

  // 2. majorOrInterests → engagement breadth (how many different categories explored)
  const categories = new Set<string>();
  for (const e of exerciseEvents) {
    const cat = e.payload?.categoryName || e.payload?.categoryId;
    if (cat) categories.add(cat);
  }
  const majorOrInterests = Math.min(100, categories.size * 20 + 20);

  // 3. cognitiveStyle → keep LLM-assessed value (can't compute from behavior)
  const cognitiveStyle = existingProfile?.abilityScores?.cognitiveStyle || 50;

  // 4. currentProgress → % of days with activity in the last 14 days
  const now = new Date();
  const activeDays = new Set<string>();
  for (const evt of events) {
    const dateStr = evt.timestamp?.split('T')[0];
    if (!dateStr) continue;
    const daysAgo = (now.getTime() - new Date(dateStr).getTime()) / (86400000);
    if (daysAgo >= 0 && daysAgo < 14) activeDays.add(dateStr);
  }
  const currentProgress = Math.min(100, Math.round((activeDays.size / 14) * 100));

  return {
    knowledgeBase,
    cognitiveStyle,
    errorProneAreas: existingProfile?.abilityScores?.errorProneAreas || 50,
    learningGoals: existingProfile?.abilityScores?.learningGoals || 50,
    majorOrInterests,
    currentProgress,
  };
}

// ============= Build LLM Prompt for Profile Analysis (能力分析 + 学习路径) =============
function buildProfileAnalysisPrompt(conversationText: string, existingProfile: any, behavioralSummary: string = ""): string {
  const existingScores = existingProfile?.abilityScores
    ? JSON.stringify(existingProfile.abilityScores)
    : '{}';
  const existingPath = existingProfile?.learningPath
    ? JSON.stringify(existingProfile.learningPath)
    : '[]';

  return `你是一个学习分析引擎。根据学生与AI助手的完整对话记录及学生的实际学习行为数据，分析该学生的学习状态，生成学生画像分析和学习路径。

## 对话记录
${conversationText}

## 学生学习行为数据
${behavioralSummary || "（暂无行为数据）"}

## 当前能力评分（参考，可基于对话内容和行为数据调整）
${existingScores}

## 当前学习路径（参考）
${existingPath}

## 输出要求
返回一个JSON对象，必须包含以下所有字段。所有文字内容使用中文。

{
  "abilityScores": {
    "knowledgeBase": <数字0-100>,
    "cognitiveStyle": <数字0-100>,
    "errorProneAreas": <数字0-100, 越低越易错>,
    "learningGoals": <数字0-100>,
    "majorOrInterests": <数字0-100>,
    "currentProgress": <数字0-100>
  },
  "knowledgeBaseText": "<2-3句分析，可使用 Markdown 加粗和列表>",
  "errorProneAreasText": "<2-3句薄弱点分析和建议，可使用 Markdown 加粗和列表>",
  "learningGoalsText": "<2-3句目标分析和建议，可使用 Markdown 加粗和列表>",
  "cognitiveStyle": "<10字以内标签>",
  "majorOrInterests": "<10字以内标签>",
  "learningPath": [
    {"title": "<阶段1>", "statusMsg": "已完成 · 知识点掌握达标", "items": ["<知识点>", "<知识点>", "<知识点>"], "progress": 100, "status": "completed"},
    {"title": "<阶段2>", "statusMsg": "进行中 · 当前重点学习内容", "items": ["<知识点>", "<知识点>", "<知识点>"], "progress": <30-70>, "status": "current"},
    {"title": "<阶段3>", "statusMsg": "待学习 · 建议后续开启", "items": ["<知识点>", "<知识点>"], "progress": 0, "status": "locked"}
  ]
}

## 重要规则
1. 只返回纯JSON对象，不要用\`\`\`json包裹，不要加任何解释文字
2. abilityScores每个分数必须在0-100之间
3. learningPath必须恰好3个阶段（completed/current/locked各一个）
4. 如果行为数据显示学生在某知识点反复犯错，适当降低对应分数
5. 检测对话中的话题切换，更新majorOrInterests标签
6. **关键注意：因为这是一个JSON对象，所有的字符串（如 statusMsg 字段或含Markdown的内容）中的换行符必须严格使用 '\\n' 转义表示，双引号必须转义为 '\\"'，绝对不能出现真实的未转义换行！**`;
}

// ============= Build LLM Prompt for Resource Generation (学习资源) =============
function buildResourcePrompt(topic: string, existingResources: any, behavioralSummary: string = "", userProfile: any = {}): string {
  const existingRes = existingResources ? JSON.stringify(existingResources) : '{}';
  const gradeLevel = userProfile?.gradeLevel || userProfile?.educationLevel || "未指定";
  const interests = userProfile?.majorOrInterests || topic;

  return `你是一个严格的学科教学专家。学生水平：${gradeLevel}，学习主题：${topic}。

## 核心原则（必须遵守）
1. 只教"${topic}"这个主题的具体知识，不要发散到学习方法论、思维培养等泛泛内容
2. 如果是数学，就给数学概念定义+定理+公式+例题；如果是物理，就给物理定律+实验+计算题
3. 内容的深度和难度要匹配"${gradeLevel}"水平
4. 不要用"游戏化理解""趣味学习""思维导图式"等虚词，直接教干货

## 已有资源（避免重复）
${existingRes}

## 输出格式
纯JSON对象，所有文字用中文，Markdown正文用\\n换行：

{
  "resources": {
    "phaseTitle": "${topic}",
    "docs": [
      {
        "id": "doc-1",
        "title": "<具体知识点标题，如：一元二次方程的求根公式>",
        "content": "<Markdown正文，至少800字。结构：## 概念定义\\n## 核心原理/公式推导\\n## 典型例题\\n## 常见错误\\n## 小结。必须是具体的学科知识，不能是空泛的学习方法>"
      },
      {
        "id": "doc-2",
        "title": "<进阶知识点标题>",
        "content": "<Markdown正文，至少600字。深入讲解本主题的进阶内容或变体>"
      },
      {
        "id": "doc-3",
        "title": "<实战练习>",
        "content": "<Markdown正文，至少500字。给出3-5道完整例题并附详细解答步骤>"
      }
    ],
    "exercises": {
      "phaseTitle": "${topic}",
      "categories": [
        {"id": "c1", "name": "基础概念"},
        {"id": "c2", "name": "公式应用"},
        {"id": "c3", "name": "综合计算"}
      ],
      "questions": [
        {"id":"q1","categoryId":"c1","type":"单选题","difficulty":"易","title":"<具体题目>","options":["<A>","<B>","<C>","<D>"],"answer":0,"analysis":"<详细解析，至少100字>"},
        {"id":"q2","categoryId":"c1","type":"单选题","difficulty":"易","title":"<具体题目>","options":["<A>","<B>","<C>","<D>"],"answer":1,"analysis":"<详细解析>"},
        {"id":"q3","categoryId":"c1","type":"单选题","difficulty":"易","title":"<具体题目>","options":["<A>","<B>","<C>","<D>"],"answer":2,"analysis":"<详细解析>"},
        {"id":"q4","categoryId":"c1","type":"单选题","difficulty":"中","title":"<具体题目>","options":["<A>","<B>","<C>","<D>"],"answer":3,"analysis":"<详细解析>"},
        {"id":"q5","categoryId":"c1","type":"单选题","difficulty":"中","title":"<具体题目>","options":["<A>","<B>","<C>","<D>"],"answer":0,"analysis":"<详细解析>"},
        {"id":"q6","categoryId":"c2","type":"单选题","difficulty":"中","title":"<具体题目>","options":["<A>","<B>","<C>","<D>"],"answer":1,"analysis":"<详细解析>"},
        {"id":"q7","categoryId":"c2","type":"单选题","difficulty":"中","title":"<具体题目>","options":["<A>","<B>","<C>","<D>"],"answer":2,"analysis":"<详细解析>"},
        {"id":"q8","categoryId":"c2","type":"单选题","difficulty":"中","title":"<具体题目>","options":["<A>","<B>","<C>","<D>"],"answer":3,"analysis":"<详细解析>"},
        {"id":"q9","categoryId":"c2","type":"单选题","difficulty":"难","title":"<具体题目>","options":["<A>","<B>","<C>","<D>"],"answer":0,"analysis":"<详细解析>"},
        {"id":"q10","categoryId":"c2","type":"单选题","difficulty":"难","title":"<具体题目>","options":["<A>","<B>","<C>","<D>"],"answer":1,"analysis":"<详细解析>"},
        {"id":"q11","categoryId":"c3","type":"单选题","difficulty":"难","title":"<具体题目>","options":["<A>","<B>","<C>","<D>"],"answer":2,"analysis":"<详细解析>"},
        {"id":"q12","categoryId":"c3","type":"单选题","difficulty":"难","title":"<具体题目>","options":["<A>","<B>","<C>","<D>"],"answer":3,"analysis":"<详细解析>"},
        {"id":"q13","categoryId":"c3","type":"单选题","difficulty":"难","title":"<具体题目>","options":["<A>","<B>","<C>","<D>"],"answer":0,"analysis":"<详细解析>"},
        {"id":"q14","categoryId":"c3","type":"单选题","difficulty":"难","title":"<具体题目>","options":["<A>","<B>","<C>","<D>"],"answer":1,"analysis":"<详细解析>"},
        {"id":"q15","categoryId":"c3","type":"单选题","difficulty":"难","title":"<具体题目>","options":["<A>","<B>","<C>","<D>"],"answer":2,"analysis":"<详细解析>"}
      ]
    },
    "mindmap": {
      "name": "${topic}",
      "value": 100,
      "children": [
        {"name": "<知识点分类1>", "value": 80, "children": [{"name":"<具体知识点>","value":40},{"name":"<具体知识点>","value":40},{"name":"<具体知识点>","value":35}]},
        {"name": "<知识点分类2>", "value": 75, "children": [{"name":"<具体知识点>","value":38},{"name":"<具体知识点>","value":37},{"name":"<具体知识点>","value":35}]},
        {"name": "<知识点分类3>", "value": 70, "children": [{"name":"<具体知识点>","value":35},{"name":"<具体知识点>","value":35},{"name":"<具体知识点>","value":30}]},
        {"name": "<知识点分类4>", "value": 65, "children": [{"name":"<具体知识点>","value":33},{"name":"<具体知识点>","value":32},{"name":"<具体知识点>","value":30}]}
      ]
    },
    "extended": {
      "videos": [
        {"id":1,"title":"<与${topic}直接相关的具体教程标题>","duration":"<时长>","level":"<适合${gradeLevel}的难度>","source":"推荐","description":"<具体内容描述，必须和${topic}直接相关>"},
        {"id":2,"title":"<具体教程标题>","duration":"<时长>","level":"<难度>","source":"推荐","description":"<具体描述>"},
        {"id":3,"title":"<具体教程标题>","duration":"<时长>","level":"<难度>","source":"推荐","description":"<具体描述>"}
      ]
    }
  }
}

## 铁律
1. 只输出纯JSON，不要\`\`\`json包裹，不要解释
2. 所有内容必须是"${topic}"的具体学科知识，不能跑题到学习方法、思维培养
3. 题目15道，每道都要有具体的题目内容（不能是占位符），解析至少100字
4. 文档用Markdown格式（##标题 / -列表 / 公式用$...$ / 代码用\`\`\`），内容用\\n转义
5. 拓展视频推荐必须与"${topic}"和"${gradeLevel}"水平匹配
6. 如果${gradeLevel}是初高中，不要推荐大学内容；如果是大学生，不要推荐小学内容`;
}

// ============= Update Profile from Conversation (Two-Phase Agent) =============
// Phase 1: Pro 模型分析能力 + 学习路径 (小量、精准)
// Phase 2: Ultra 32k 模型生成学习资源 (大量、丰富)
async function updateProfileFromConversation(username: string, conversationMessages: any[]) {
  if (profileUpdateLocks.has(username)) {
    console.log(`[Profile] Update already in progress for ${username}, skipping duplicate`);
    return;
  }

  const db = readDB();
  const user = db.users[username];
  if (!user || !conversationMessages || conversationMessages.length === 0) return;

  const userMessages = conversationMessages.filter((m: any) => m.role === 'user' && m.content);
  if (userMessages.length === 0) return;

  const existingProfile = user.profile || {};

  // Build behavioral summary from recent learning events
  const behavioralSummary = buildBehavioralSummary(username, db);

  // Format conversation for LLM
  const conversationText = conversationMessages
    .filter((m: any) => m.role && m.content)
    .map((m: any) => {
      const role = m.role === 'user' ? '学生' : 'AI助手';
      const content = typeof m.content === 'string' ? m.content.substring(0, 800) : '';
      return `[${role}]: ${content}`;
    })
    .join('\n\n');

  profileUpdateLocks.add(username);
  try {
    // ===== Phase 1: Pro 模型分析画像 + 学习路径 =====
    const analysisPrompt = buildProfileAnalysisPrompt(conversationText, existingProfile, behavioralSummary);
    console.log(`[Profile] Phase 1: Analyzing profile for ${username} with Pro model...`);

    const analysisResponse = await agentConfigs.profile.client.chat.completions.create({
      model: agentConfigs.profile.model,
      messages: [{ role: 'user', content: analysisPrompt }],
      temperature: 0.5,
      max_tokens: 4096,
    });

    let analysisContent = analysisResponse.choices[0]?.message?.content || '';
    const analysisJson = analysisContent.match(/\{[\s\S]*\}/);
    let parsedAnalysis: any = {};
    if (analysisJson) {
      try {
        parsedAnalysis = JSON.parse(jsonrepair(analysisJson[0]));
        console.log(`[Profile] Phase 1 complete: got abilityScores and learningPath`);
      } catch (e) {
        console.warn('[Profile] Phase 1 JSON parse error:', e, 'Raw JSON string:', analysisJson[0]);
      }
    }

    // ===== Phase 2: Ultra 32k 模型生成丰富学习资源 =====
    const topic = parsedAnalysis.majorOrInterests || existingProfile.majorOrInterests || '编程学习';
    const resourcePrompt = buildResourcePrompt(topic, existingProfile.resources, behavioralSummary, existingProfile);
    console.log(`[Profile] Phase 2: Generating resources with Ultra model for topic "${topic}"...`);

    const resourceResponse = await agentConfigs.resource.client.chat.completions.create({
      model: agentConfigs.resource.model,
      messages: [{ role: 'user', content: resourcePrompt }],
      temperature: 0.6,
      max_tokens: 16384,
    });

    let resourceContent = resourceResponse.choices[0]?.message?.content || '';
    const resourceJson = resourceContent.match(/\{[\s\S]*\}/);
    let parsedResources: any = {};
    if (resourceJson) {
      try {
        parsedResources = JSON.parse(jsonrepair(resourceJson[0]));
        console.log(`[Profile] Phase 2 complete: resources generated (${resourceContent.length} chars)`);
      } catch (e) {
        console.warn('[Profile] Phase 2 JSON parse error:', e, 'Raw JSON string:', resourceJson[0]);
      }
    }

    // ===== Merge and Save =====
    const db2 = readDB();
    if (!db2.users[username].profile) db2.users[username].profile = {};

    const mergedProfile: any = {
      name: username,
      ...db2.users[username].profile,
      lastUpdated: new Date().toISOString(),
    };

    // Merge analysis results (abilityScores, texts, learningPath)
    if (parsedAnalysis.abilityScores) {
      mergedProfile.abilityScores = { ...mergedProfile.abilityScores, ...parsedAnalysis.abilityScores };
    }
    if (parsedAnalysis.knowledgeBaseText) mergedProfile.knowledgeBaseText = parsedAnalysis.knowledgeBaseText;
    if (parsedAnalysis.errorProneAreasText) mergedProfile.errorProneAreasText = parsedAnalysis.errorProneAreasText;
    if (parsedAnalysis.learningGoalsText) mergedProfile.learningGoalsText = parsedAnalysis.learningGoalsText;
    if (parsedAnalysis.cognitiveStyle) mergedProfile.cognitiveStyle = parsedAnalysis.cognitiveStyle;
    if (parsedAnalysis.majorOrInterests) mergedProfile.majorOrInterests = parsedAnalysis.majorOrInterests;
    if (parsedAnalysis.learningPath && parsedAnalysis.learningPath.length > 0) {
      mergedProfile.learningPath = parsedAnalysis.learningPath;
    }

    // Merge resource results (docs, exercises, mindmap, codeEx)
    if (parsedResources.resources) {
      mergedProfile.resources = {
        ...mergedProfile.resources,
        ...parsedResources.resources,
      };

      // Register new chapters from generated resources
      registerChaptersFromResources(username, parsedResources.resources);

      // Add notification for new resources
      if (!db2.users[username].notifications) db2.users[username].notifications = [];
      const topicName = parsedResources.resources.exercises?.phaseTitle
        || parsedAnalysis.majorOrInterests
        || "当前学习主题";
      db2.users[username].notifications.push({
        id: `res-${Date.now()}`,
        type: "new_resources",
        topic: topicName,
        message: `📚 学习资源已根据对话更新：${topicName}`,
        timestamp: new Date().toISOString(),
        read: false,
      });
      // Keep only last 20 notifications
      if (db2.users[username].notifications.length > 20) {
        db2.users[username].notifications = db2.users[username].notifications.slice(-20);
      }
      console.log(`[Profile] Notification added for ${username}: new resources available`);
    }

    db2.users[username].profile = mergedProfile;
    writeDB(db2);

    console.log(`[Profile] Successfully updated for ${username} (two-phase)`);
    broadcastProfileUpdate(username);

  } catch (e) {
    console.error('[Profile] Failed to update from conversation:', e);
  } finally {
    profileUpdateLocks.delete(username);
  }
}

// ============= Incremental Resource Adaptation (Behavioral Thresholds) =============
async function checkBehavioralThresholds(username: string, db: any) {
  const events: any[] = db.users[username]?.behavioralEvents || [];
  if (events.length === 0) return;

  // Get recent wrong answer counts per category (last 24 hours)
  const recentExerciseEvents = events.filter(
    (e: any) =>
      e.eventType === "exercise_answer" &&
      new Date(e.timestamp).getTime() > Date.now() - 24 * 60 * 60 * 1000
  );

  const wrongByCategory: Record<string, number> = {};
  for (const e of recentExerciseEvents) {
    if (!e.payload?.correct) {
      const cat = e.payload?.categoryName || e.payload?.categoryId || "未知";
      wrongByCategory[cat] = (wrongByCategory[cat] || 0) + 1;
    }
  }

  // Check if any category exceeds the threshold (3+ wrong answers in 24h)
  const triggeredCategories = Object.entries(wrongByCategory)
    .filter(([, count]) => count >= 3)
    .map(([cat]) => cat);

  if (triggeredCategories.length === 0) return;

  // Check cooldown: at most once every 30 minutes
  const lastIncremental = db.users[username]?.lastIncrementalUpdate;
  if (lastIncremental) {
    const msSinceLast = Date.now() - new Date(lastIncremental).getTime();
    if (msSinceLast < 30 * 60 * 1000) return;
  }

  console.log(`[Behavioral] Threshold triggered for ${username}: ${triggeredCategories.join(", ")}`);

  // Build focused prompt for incremental exercise generation
  const existingProfile = db.users[username]?.profile || {};
  const existingExercises = existingProfile.resources?.exercises || { categories: [], questions: [] };

  const weakAreasPrompt = `你是一个学习资源生成引擎。学生 ${username} 在以下知识点反复出错：
${triggeredCategories.map(c => `- ${c}`).join("\n")}

## 当前已有习题（避免重复题目ID和内容）
${JSON.stringify(existingExercises.questions?.map((q: any) => q.id + ": " + q.title) || [])}

## 输出要求
为这些薄弱知识点生成2-3道额外的针对性练习题。返回纯JSON对象，不要用\`\`\`json包裹：
{
  "exercises": {
    "questions": [
      {
        "id": "q-weak-<序号>",
        "categoryId": "<匹配已有分类ID>",
        "type": "单选题",
        "difficulty": "中",
        "title": "<针对薄弱知识点的具体题目>",
        "options": ["<选项A>", "<选项B>", "<选项C>", "<选项D>"],
        "answer": <0-3的正确答案索引>,
        "analysis": "<详细的解题分析和知识点讲解>"
      }
    ]
  }
}`;

  try {
    const response = await agentConfigs.profile.client.chat.completions.create({
      model: agentConfigs.profile.model,
      messages: [{ role: "user", content: weakAreasPrompt }],
      temperature: 0.5,
      max_tokens: 4096,
    });

    let content = response.choices[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.exercises?.questions?.length > 0) {
        const db2 = readDB();
        if (!db2.users[username].profile) db2.users[username].profile = {};
        if (!db2.users[username].profile.resources) db2.users[username].profile.resources = {};
        if (!db2.users[username].profile.resources.exercises) {
          db2.users[username].profile.resources.exercises = { categories: [], questions: [] };
        }

        const existingQ = db2.users[username].profile.resources.exercises.questions || [];
        const existingIds = new Set(existingQ.map((q: any) => q.id));

        let addedCount = 0;
        for (const q of parsed.exercises.questions) {
          if (!existingIds.has(q.id)) {
            existingQ.push(q);
            existingIds.add(q.id);
            addedCount++;
          }
        }

        if (addedCount > 0) {
          db2.users[username].lastIncrementalUpdate = new Date().toISOString();
          writeDB(db2);
          broadcastProfileUpdate(username);
          console.log(`[Behavioral] Added ${addedCount} targeted exercises for ${username}`);
        }
      }
    }
  } catch (e) {
    console.error("[Behavioral] Incremental exercise generation failed:", e);
  }
}

// ============= LLM Provider 初始化 =============
// 支持一键切换：LLM_PROVIDER=deepseek 则用 DeepSeek，否则用讯飞星火
const LLM_PROVIDER = (process.env.LLM_PROVIDER || "spark").toLowerCase();

let apiKey: string;
let baseURL: string;
let model: string;
let resourceApiKey: string;
let resourceBaseURL: string;
let resourceModel: string;

if (LLM_PROVIDER === "deepseek") {
  // ===== DeepSeek（答辩演示用）=====
  apiKey = process.env.DEEPSEEK_API_KEY || "sk-dummy";
  baseURL = "https://api.deepseek.com/v1";
  model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  resourceApiKey = process.env.DEEPSEEK_API_KEY || apiKey;
  resourceBaseURL = baseURL;
  resourceModel = model;
  console.log("[LLM] ✅ 使用 DeepSeek");
} else {
  // ===== 讯飞星火（正式提交用）=====
  apiKey = process.env.SPARK_API_KEY || "dummy";
  baseURL = process.env.SPARK_BASE_URL || "https://spark-api-open.xf-yun.com/v1";
  if (baseURL.endsWith("/chat/completions")) {
    baseURL = baseURL.replace(/\/chat\/completions$/, "");
  }
  model = process.env.SPARK_MODEL || "4.0Ultra";
  resourceApiKey = process.env.SPARK_ULTRA_API_KEY || apiKey;
  resourceBaseURL = process.env.SPARK_ULTRA_BASE_URL || baseURL;
  resourceModel = process.env.SPARK_ULTRA_MODEL || model;
  console.log("[LLM] ✅ 使用讯飞星火");
}

// 主客户端 — 问答、导师、画像
const primaryClient = new OpenAI({ apiKey, baseURL });
const primaryModel = model;

// 资源生成独立客户端
const resourceClient = new OpenAI({ apiKey: resourceApiKey, baseURL: resourceBaseURL });

const agentConfigs = {
  profile: { client: primaryClient, model: primaryModel },
  tutor: { client: primaryClient, model: primaryModel },
  resource: { client: resourceClient, model: resourceModel },
  path: { client: primaryClient, model: primaryModel },
};

// ============= 中间件 =============
// ============= Rate Limiter (disabled in dev) =============
const isDev = process.env.NODE_ENV !== "production";

// ============= MySQL 可用性标记 =============
let mysqlAvailable = false;

function validateMessages(messages: any[]) {
  if (!Array.isArray(messages) || messages.length === 0) return { valid: false, reason: "消息不能为空" };
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg || !msg.content || typeof msg.content !== "string") return { valid: false, reason: "消息无效" };
    if (msg.content.length > 20000) return { valid: false, reason: "超过20000字符限制" };
  }
  if (messages.length > 200) return { valid: false, reason: "超过200条限制" };
  return { valid: true };
}

function sanitizeUserContent(content: string) {
  return content.replace(/<\|system\|>/gi, "[system]").replace(/<\|end\|>/gi, "[end]");
}

// ============= System Prompts =============
const PROFILE_AGENT_PROMPT = `你是一个专业的 AI 教学助手，名字叫"智学助手"。你的核心目标是通过自然对话了解学生的背景，同时提供学习指导。你需要通过自然真实的对话，主动通过抛出问题等方式鼓励和引导用户说明自己的当前水平或者薄弱点以便后台智能体通过你发掘的信息为你定制专属的学习路线、学习资料、能力模型等。请尽量以平易近人的口吻沟通，解答用户的专业问题，同时引导他们深入讨论学习情况。`;

const TUTOR_AGENT_PROMPT = `你是一个专业的 AI 导师，名字叫"智学导师"。你采用苏格拉底式教学法：通过提问引导学生自己找到答案，而非直接给出结论。`;
const EXPLANATION_AGENT_PROMPT = `你是一个专业的知识讲解员。请基于学生的画像用他们最容易理解的方式解释知识点。生成的内容要详尽、系统化，至少1500字，包含：概念引入、核心原理详解、代码/公式示例、实践建议、常见误区、知识点小结。使用Markdown格式组织（## 标题、- 列表、代码块）。`;
const MINDMAP_AGENT_PROMPT = `你是一个知识结构化专家。请生成该主题的详细思维导图。至少4个二级节点，每个二级节点至少3个三级节点，每个三级节点可继续展开2个子节点。返回JSON格式：{"name":"根主题","value":100,"children":[{"name":"二级","value":80,"children":[{"name":"三级","value":40,"children":[{"name":"四级","value":20}]}]}]}`;
const QUIZ_AGENT_PROMPT = `你是一个测验专家。请根据学生的弱项生成8道单选题，覆盖易/中/难三个难度级别。每道题必须包含：具体题目描述、4个选项、正确答案索引(0-3)、至少100字的详细解析。返回JSON格式。`;
const VIDEO_CODE_AGENT_PROMPT = `你是一个编程和多媒体教学专家。请提供代码示例或学习视频推荐。生成的教程要详尽，包含：背景知识、核心概念讲解、完整代码示例（带注释）、运行步骤、输出说明、进阶挑战、常见错误和调试技巧。至少1000字，使用Markdown格式。`;
const READING_AGENT_PROMPT = `你是一个阅读指导专家。请提供深度阅读材料，内容要像正式教材一样系统化。至少1500字，包含：章节引言、核心知识点详解（含示例）、图表/代码说明、案例分析、思考题、参考文献推荐。使用Markdown格式组织。`;
const PATH_AGENT_PROMPT = `你是一个学习路径规划师。请根据学生画像量身定制学习计划。

## 输出要求
使用 Markdown 格式组织输出，结构清晰美观，至少包含以下章节：

### 1. 学习路径总览
- 用有序列表列出 3 个学习阶段（基础 → 进阶 → 实战）
- 每个阶段标注预计耗时和核心目标

### 2. 薄弱点专项突破
- 列出当前最需要加强的 2-3 个知识点
- 每个薄弱点给出具体的学习建议和练习方向

### 3. 每日学习计划建议
- 用表格给出一个参考周计划（周一至周日）
- 每天包含 1-2 个具体任务和预计时长

### 4. 关键里程碑
- 列出 3-4 个阶段性检验节点
- 说明每个里程碑的验收标准

### 5. 推荐学习资源
- 推荐 3-5 个与本主题相关的学习资源（平台、关键词、难度）
- 标注适合当前水平的内容

使用 ## / ### 标题层级、表格、列表、加粗等 Markdown 语法，使输出结构清晰、便于阅读。`;

function setupSSE(req: express.Request, res: express.Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
}
function sendSSEEvent(res: express.Response, data: any) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function startServer() {
  // ============= 初始化 MySQL 数据库 =============
  mysqlAvailable = await initMySQLDB();
  if (mysqlAvailable) {
    console.log("[MySQL] MySQL 数据库已连接，用户登录信息将存储到 MySQL");
  } else {
    console.log("[MySQL] MySQL 不可用，回退到 JSON 文件存储");
  }

  const app = express();
  app.set("trust proxy", 1); // Trust first proxy for rate limiter behind load balancer
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: "1mb" }));
  // app.use(globalLimiter); // disabled for development

  // Middleware to auto-create user on valid token
  const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    let token = req.headers.authorization?.replace("Bearer token_", "");
    if (!token) {
      // Fallback to query parameter for EventSource SSE connections (no custom headers)
      token = (req.query.token as string)?.replace("token_", "");
    }
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
      token = decodeURIComponent(token);
    } catch(e) {}
    const username = token; 
    const db = readDB();
    if (!db.users[username]) {
      // Auto-recreate user if database was wiped by container restart
      db.users[username] = { password: "recreated_by_token", profile: {}, chats: [], favorites: [] };
      writeDB(db);
    }
    (req as any).username = username;
    next();
  };

  // Auth endpoints
  app.get("/api/debug-env", (_req, res) => {
    res.json({
      LLM_PROVIDER: process.env.LLM_PROVIDER,
      SPARK_API_KEY: process.env.SPARK_API_KEY ? "***" + process.env.SPARK_API_KEY.slice(-4) : "not set",
      SPARK_MODEL: process.env.SPARK_MODEL,
      MYSQL_ENABLED: mysqlAvailable,
    });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "用户名和密码不能为空" });
    }

    // 优先使用 MySQL 验证
    if (mysqlAvailable) {
      const user = await mysqlGetUser(username);
      if (user && user.password === password) {
        // 同步到 JSON DB，确保其他功能正常
        const db = readDB();
        if (!db.users[username]) {
          db.users[username] = { password, birthday: user.birthday, primarySchool: user.primarySchool };
          writeDB(db);
        }
        return res.json({ success: true, token: "token_" + username, username });
      }
      return res.status(401).json({ success: false, message: "用户名或密码错误" });
    }

    // 回退到 JSON DB
    const db = readDB();
    if (db.users[username] && db.users[username].password === password) {
      res.json({ success: true, token: "token_" + username, username });
    } else {
      res.status(401).json({ success: false, message: "用户名或密码错误" });
    }
  });

  app.post("/api/auth/register", async (req, res) => {
    const { username, password, phone } = req.body;
    if (!username || !password || !phone) {
      return res.status(400).json({ success: false, message: "用户名、密码和手机号不能为空" });
    }
    // 验证手机号必须是11位数字
    if (!/^\d{11}$/.test(phone)) {
      return res.status(400).json({ success: false, message: "手机号必须为11位数字" });
    }

    // 优先使用 MySQL 存储
    if (mysqlAvailable) {
      const created = await mysqlCreateUser(username, password, phone);
      if (!created) {
        return res.status(400).json({ success: false, message: "用户名已存在" });
      }
      // 同步到 JSON DB，确保其他功能正常
      const db = readDB();
      db.users[username] = { password, phone };
      writeDB(db);
      return res.json({ success: true, message: "注册成功" });
    }

    // 回退到 JSON DB
    const db = readDB();
    if (db.users[username]) {
      res.status(400).json({ success: false, message: "用户名已存在" });
    } else {
      db.users[username] = { password, phone };
      writeDB(db);
      res.json({ success: true, message: "注册成功" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    const { username, phone, newPassword } = req.body;
    if (!username || !phone || !newPassword) {
      return res.status(400).json({ success: false, message: "用户名、手机号和新密码不能为空" });
    }

    // 优先使用 MySQL
    if (mysqlAvailable) {
      const { mysqlUpdatePasswordByPhone, mysqlVerifyUser } = await import('./db-mysql.js');
      const verified = await mysqlVerifyUser(username, phone);
      if (!verified) {
        return res.status(400).json({ success: false, message: "验证信息错误，用户名与手机号不匹配" });
      }
      const updateResult = await mysqlUpdatePasswordByPhone(phone, newPassword);
      // 同步到 JSON DB
      const db = readDB();
      if (updateResult.success && updateResult.username && db.users[updateResult.username]) {
        db.users[updateResult.username].password = newPassword;
        writeDB(db);
      }
      return res.json({ success: true, message: "密码重置成功" });
    }

    // 回退到 JSON DB
    const db = readDB();
    let foundUsername = null;
    for (const user in db.users) {
       if (user === username && db.users[user].phone === phone) {
          foundUsername = user;
          break;
       }
    }

    if (foundUsername) {
      db.users[foundUsername].password = newPassword;
      writeDB(db);
      res.json({ success: true, message: "密码重置成功" });
    } else {
      res.status(400).json({ success: false, message: "验证信息错误，用户名与手机号不匹配" });
    }
  });

  // Profile endpoints
  app.get("/api/user-profile", authMiddleware, (req, res) => {
    const username = (req as any).username;
    const profile = getUserProfile(username);
    res.json(profile);
  });

  app.post("/api/user-profile", authMiddleware, (req, res) => {
    const username = (req as any).username;
    saveUserProfile(username, req.body);
    res.json({ success: true });
  });

  // Chat endpoint
  app.post("/api/chat", authMiddleware, async (req, res) => {
    try {
      const username = (req as any).username;
      const { messages, userProfile } = req.body;
      const validation = validateMessages(messages);
      if (!validation.valid) return res.status(400).json({ error: validation.reason });

      logUserAction(username, "chat", `提问: ${messages[messages.length - 1]?.content || ''}`);
      storeConversationContext(username, messages);

      const systemMsg = { role: "system" as const, content: PROFILE_AGENT_PROMPT + `\n\n当前学生画像: ${JSON.stringify(userProfile || {})}` };
      const sanitizedMessages = messages.map((m: any) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.role === "user" ? sanitizeUserContent(m.content) : m.content,
      }));

      const response = await agentConfigs.profile.client.chat.completions.create({
        model: agentConfigs.profile.model,
        messages: [systemMsg, ...sanitizedMessages],
      });

      const assistantResponse = response.choices[0].message.content;

      // Trigger profile update with full conversation (including AI response)
      const fullMessages = [...sanitizedMessages, { role: "assistant", content: assistantResponse }];
      updateProfileFromConversation(username, fullMessages).catch((e) =>
        console.error("[Profile] Background update after chat failed:", e)
      );

      res.json({ text: assistantResponse });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/chat/stream", authMiddleware, async (req, res) => {
    setupSSE(req, res);
    try {
      const username = (req as any).username;
      const { messages, userProfile } = req.body;

      logUserAction(username, "chat_stream", `提问: ${messages[messages.length - 1]?.content || ''}`);
      storeConversationContext(username, messages);

      // Record chat behavioral event for calendar
      const db = readDB();
      if (!db.users[username].behavioralEvents) db.users[username].behavioralEvents = [];
      db.users[username].behavioralEvents.push({
        timestamp: new Date().toISOString(),
        eventType: "chat",
        payload: { messageCount: messages.length, lastMessage: (messages[messages.length - 1]?.content || '').substring(0, 100) },
      });
      writeDB(db);

      const systemMsg = { role: "system" as const, content: PROFILE_AGENT_PROMPT + `\n\n当前学生画像: ${JSON.stringify(userProfile || {})}` };
      const stream = await agentConfigs.profile.client.chat.completions.create({
        model: agentConfigs.profile.model,
        messages: [systemMsg, ...messages],
        stream: true,
      });

      let fullResponse = "";
      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) {
          fullResponse += content;
          sendSSEEvent(res, { content });
        }
      }
      sendSSEEvent(res, { content: "", done: true });

      // Trigger profile update AFTER stream completes, with full conversation including AI response
      const fullMessages = [...messages, { role: "assistant", content: fullResponse }];
      updateProfileFromConversation(username, fullMessages).catch((e) =>
        console.error("[Profile] Background update after stream failed:", e)
      );
    } catch (e: any) {
      sendSSEEvent(res, { error: e.message });
    } finally {
      res.end();
    }
  });

  // Agent 2: 导师辅导
  app.post("/api/tutor", authMiddleware, async (req, res) => {
    try {
      const username = (req as any).username;
      const { messages, userProfile, resourceContext } = req.body;
      const validation = validateMessages(messages);
      if (!validation.valid) return res.status(400).json({ error: validation.reason });

      logUserAction(username, "tutor_chat", `辅导提问: ${messages[messages.length - 1]?.content || ''}`);
      storeConversationContext(username, messages);

      const resourceHint = resourceContext ? `\n\n当前学习资料内容（请结合此内容回答学生问题）:\n${resourceContext}` : '';
      const systemMsg = { role: "system" as const, content: TUTOR_AGENT_PROMPT + `\n\n学生画像: ${JSON.stringify(userProfile || {})}${resourceHint}` };
      const sanitizedMessages = messages.map((m: any) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.role === "user" ? sanitizeUserContent(m.content) : m.content,
      }));

      const response = await agentConfigs.tutor.client.chat.completions.create({
        model: agentConfigs.tutor.model,
        temperature: 0.7,
        messages: [systemMsg, ...sanitizedMessages],
      });

      const assistantResponse = response.choices[0].message.content;

      // Trigger profile update with full conversation (including AI response)
      const fullMessages = [...sanitizedMessages, { role: "assistant", content: assistantResponse }];
      updateProfileFromConversation(username, fullMessages).catch((e) =>
        console.error("[Profile] Background update after tutor chat failed:", e)
      );

      res.json({ text: assistantResponse });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/tutor/stream", authMiddleware, async (req, res) => {
    setupSSE(req, res);
    try {
      const username = (req as any).username;
      const { messages, userProfile, resourceContext } = req.body;

      logUserAction(username, "tutor_stream", `辅导提问: ${messages[messages.length - 1]?.content || ''}`);
      storeConversationContext(username, messages);

      const resourceHint = resourceContext ? `\n\n当前学习资料内容:\n${resourceContext}` : '';
      const systemMsg = { role: "system" as const, content: TUTOR_AGENT_PROMPT + `\n\n学生画像: ${JSON.stringify(userProfile || {})}${resourceHint}` };
      const stream = await agentConfigs.tutor.client.chat.completions.create({
        model: agentConfigs.tutor.model,
        messages: [systemMsg, ...messages],
        stream: true,
      });

      let fullResponse = "";
      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) {
          fullResponse += content;
          sendSSEEvent(res, { content });
        }
      }
      sendSSEEvent(res, { content: "", done: true });

      // Trigger profile update AFTER stream completes, with full conversation including AI response
      const fullMessages = [...messages, { role: "assistant", content: fullResponse }];
      updateProfileFromConversation(username, fullMessages).catch((e) =>
        console.error("[Profile] Background update after tutor stream failed:", e)
      );
    } catch (e: any) {
      sendSSEEvent(res, { error: e.message });
    } finally {
      res.end();
    }
  });

  // ============= Agent 3: 资源生成 =============
  app.post("/api/generate-resource", authMiddleware, async (req, res) => {
    try {
      const username = (req as any).username;
      const { userProfile, topic, type } = req.body;
      if (!topic || typeof topic !== "string" || topic.length > 1000) return res.status(400).json({ error: "请输入有效的知识点" });

      logUserAction(username, "generate_resource", `查看资料: ${type} - ${topic}`);

      const promptMap: Record<string, string> = { explanation: EXPLANATION_AGENT_PROMPT, mindmap: MINDMAP_AGENT_PROMPT, quiz: QUIZ_AGENT_PROMPT, "video-code": VIDEO_CODE_AGENT_PROMPT, reading: READING_AGENT_PROMPT };
      const systemInstruction = (promptMap[type] || EXPLANATION_AGENT_PROMPT) + `\n\n学生画像: ${JSON.stringify(userProfile || {})}`;

      const response = await agentConfigs.resource.client.chat.completions.create({
        model: agentConfigs.resource.model,
        temperature: 0.5,
        max_tokens: 16384,
        messages: [{ role: "system", content: systemInstruction }, { role: "user", content: `知识点: ${sanitizeUserContent(topic)}` }],
      });

      res.json({ text: response.choices[0].message.content });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============= Agent 4: 路径规划 =============
  app.post("/api/plan-path", authMiddleware, async (req, res) => {
    try {
      const username = (req as any).username;
      logUserAction(username, "plan_path", `重新生成了学习路径`);
      
      const { userProfile } = req.body;
      const response = await agentConfigs.path.client.chat.completions.create({
        model: agentConfigs.path.model,
        temperature: 0.5,
        messages: [{ role: "system", content: PATH_AGENT_PROMPT }, { role: "user", content: `请根据以下学生画像生成个性化学习路径:\n${JSON.stringify(userProfile || {}, null, 2)}` }],
      });
      res.json({ text: response.choices[0].message.content });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });


  // Chats endpoints
  app.get("/api/chats", authMiddleware, (req, res) => {
    const username = (req as any).username;
    const db = readDB();
    res.json(db.users[username].chats || []);
  });

  app.post("/api/chats", authMiddleware, (req, res) => {
    const username = (req as any).username;
    const db = readDB();
    db.users[username].chats = req.body;
    writeDB(db);
    res.json({ success: true });
  });

  // Favorites endpoints
  app.get("/api/favorites", authMiddleware, (req, res) => {
    const username = (req as any).username;
    const db = readDB();
    res.json({ favorites: db.users[username].favorites || [], folders: db.users[username].folders || ['全部收藏', '默认分类'] });
  });

  app.post("/api/favorites", authMiddleware, (req, res) => {
    const username = (req as any).username;
    const db = readDB();
    if (req.body.favorites) db.users[username].favorites = req.body.favorites;
    if (req.body.folders) db.users[username].folders = req.body.folders;
    writeDB(db);
    logUserAction(username, "favorite", "更新了收藏夹");
    res.json({ success: true });
  });

  app.post("/api/generate-title", authMiddleware, async (req, res) => {
    try {
      const { content } = req.body;
      const response = await agentConfigs.profile.client.chat.completions.create({
        model: agentConfigs.profile.model,
        messages: [{ role: "user", content: `为这段话生成一个不超过15个字的简短标题：\n"${sanitizeUserContent(content)}"\n请直接返回标题，不要加其他任何废话和标点符号。` }],
        temperature: 0.3,
      });
      res.json({ title: response.choices[0].message.content?.trim() || "新对话" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============= Learning Behavior Events =============
  app.post("/api/learning-events", authMiddleware, (req, res) => {
    const username = (req as any).username;
    const { events } = req.body;

    if (!events) return res.status(400).json({ error: "events required" });

    const eventArray = Array.isArray(events) ? events : [events];
    const db = readDB();
    if (!db.users[username]) return res.status(404).json({ error: "user not found" });
    if (!db.users[username].behavioralEvents) db.users[username].behavioralEvents = [];

    for (const evt of eventArray) {
      if (!evt.eventType || !evt.payload) continue;
      db.users[username].behavioralEvents.push({
        timestamp: new Date().toISOString(),
        eventType: evt.eventType,
        payload: evt.payload,
      });
      // Also keep existing log for backward compatibility
      logUserAction(username, evt.eventType, JSON.stringify(evt.payload).substring(0, 500));
    }

    // Trim old events to prevent unbounded growth (keep last 500)
    if (db.users[username].behavioralEvents.length > 500) {
      db.users[username].behavioralEvents = db.users[username].behavioralEvents.slice(-500);
    }

    writeDB(db);

    // Check if behavioral thresholds are met for incremental resource adaptation
    checkBehavioralThresholds(username, db).catch((e) =>
      console.error("[Behavioral] Threshold check failed:", e)
    );

    // Auto-check chapter completion from behavioral events
    const progressChanged = autoCheckChapterCompletion(username, db);

    // Push updated profile (with real calendar) to connected SSE clients
    broadcastProfileUpdate(username);

    res.json({ success: true, count: eventArray.length, chapterProgressChanged: progressChanged });
  });

  // ============= SSE Profile Update Stream =============
  app.get("/api/profile/stream", authMiddleware, (req, res) => {
    const username = (req as any).username;
    setupSSE(req, res);

    // Register this client
    if (!profileSSEClients.has(username)) {
      profileSSEClients.set(username, []);
    }
    profileSSEClients.get(username)!.push(res);

    // Send initial keepalive
    res.write(":ok\n\n");

    // Send initial profile data immediately
    const currentProfile = getUserProfile(username);
    const currentChapterProgress = getChapterProgress(username);
    const db2 = readDB();
    const currentNotifications = db2.users[username]?.notifications || [];
    sendSSEEvent(res, {
      type: "profile_connected",
      profile: currentProfile,
      chapterProgress: currentChapterProgress,
      notifications: currentNotifications,
      timestamp: new Date().toISOString(),
    });

    // Remove on close
    req.on("close", () => {
      const clients = profileSSEClients.get(username);
      if (clients) {
        const idx = clients.indexOf(res);
        if (idx > -1) clients.splice(idx, 1);
        if (clients.length === 0) profileSSEClients.delete(username);
      }
    });
  });

  // ============= Chapter Progress Endpoints =============
  app.get("/api/chapter-progress", authMiddleware, (req, res) => {
    const username = (req as any).username;
    const progress = getChapterProgress(username);
    // Also trigger auto-check on read to keep progress fresh
    const db = readDB();
    autoCheckChapterCompletion(username, db);
    const updatedProgress = getChapterProgress(username);
    res.json(updatedProgress);
  });

  app.post("/api/chapter-progress", authMiddleware, (req, res) => {
    const username = (req as any).username;
    const { chapterId } = req.body;
    if (!chapterId) return res.status(400).json({ error: "chapterId required" });

    const progress = getChapterProgress(username);
    const chapter = progress.chapters.find((c: any) => c.id === chapterId);
    if (!chapter) return res.status(404).json({ error: "chapter not found" });

    chapter.status = "completed";
    chapter.progress = 100;
    chapter.completedItems = chapter.totalItems;
    chapter.completedAt = new Date().toISOString();
    saveChapterProgress(username, progress);

    // Log action and broadcast
    logUserAction(username, "chapter_complete", `标记完成: ${chapter.title}`);
    broadcastProfileUpdate(username);

    console.log(`[ChapterProgress] Manual complete: ${chapter.title} by ${username}`);
    res.json({ success: true, chapter });
  });

  // ============= Extended Links (Video Resource Agent) =============
  const extendedLinksCache = new Map<string, { data: any; timestamp: number }>();

  app.post("/api/extended-links", authMiddleware, async (req, res) => {
    try {
      const username = (req as any).username;
      const { topic } = req.body;
      if (!topic || typeof topic !== "string") {
        return res.status(400).json({ error: "topic required" });
      }

      // Check cache (1 hour TTL)
      const cacheKey = `${username}:${topic}`;
      const cached = extendedLinksCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 3600000) {
        return res.json(cached.data);
      }

      logUserAction(username, "extended_links", `搜索公开资源: ${topic}`);

      // Get user profile for personalization
      const db3 = readDB();
      const userLevel = db3.users[username]?.profile?.gradeLevel
        || db3.users[username]?.profile?.educationLevel
        || "未指定";

      const prompt = `你是一个学习资源推荐专家。学生水平：${userLevel}，学习主题：${topic}。

请推荐5个适合${userLevel}学生的高质量公开学习资源。

## 输出要求
纯JSON，不要包裹：

{
  "links": [
    {
      "title": "<资源标题，具体明确>",
      "platform": "<Bilibili / 中国大学MOOC / 网易云课堂>",
      "searchQuery": "<在平台上能搜到该资源的精确中文关键词>",
      "description": "<1句话描述内容和为什么适合${userLevel}学生>",
      "level": "初级 / 中级 / 高级",
      "duration": "<估计时长>"
    }
  ]
}

## 规则
1. 只输出纯JSON
2. 推荐的难度必须匹配${userLevel}水平：如果是初高中，不要推荐大学课程；如果是大学，不要推荐小学内容
3. 优先中文平台
4. 不要编造URL
5. 必须与${topic}直接相关`;

      const response = await agentConfigs.resource.client.chat.completions.create({
        model: agentConfigs.resource.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
        max_tokens: 4096,
      });

      let content = response.choices[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      let parsed: any = { links: [] };

      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.warn("[ExtendedLinks] JSON parse error, raw:", content.substring(0, 200));
        }
      }

      // Store in user profile for persistence
      const db2 = readDB();
      if (!db2.users[username].profile) db2.users[username].profile = {};
      if (!db2.users[username].profile.resources) db2.users[username].profile.resources = {};
      if (!db2.users[username].profile.resources.extended) db2.users[username].profile.resources.extended = {};
      db2.users[username].profile.resources.extended.externalLinks = parsed.links;
      db2.users[username].profile.resources.extended.externalLinksTopic = topic;
      db2.users[username].profile.resources.extended.externalLinksGeneratedAt = new Date().toISOString();
      writeDB(db2);

      // Cache
      extendedLinksCache.set(cacheKey, { data: parsed, timestamp: Date.now() });

      broadcastProfileUpdate(username);
      console.log(`[ExtendedLinks] Generated ${parsed.links.length} links for topic "${topic}"`);

      res.json(parsed);
    } catch (e: any) {
      console.error("[ExtendedLinks] Failed:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ========== Vite Middleware ==========
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => { res.sendFile(path.join(distPath, "index.html")); });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();

