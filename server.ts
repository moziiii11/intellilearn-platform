import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import fs from "fs";
import { jsonrepair } from "jsonrepair";
import bcrypt from "bcryptjs";
import {
  initMySQLDB, mysqlGetUser, mysqlCreateUser, mysqlVerifyUser, mysqlVerifyPassword, mysqlPing,
  mysqlGetProfile, mysqlSaveProfile,
  mysqlGetChats, mysqlSaveChats,
  mysqlGetFavorites, mysqlSaveFavorites,
  mysqlGetEvents, mysqlInsertEvents,
  mysqlGetWrongBook, mysqlSaveWrongQuestion, mysqlDeleteWrongQuestion,
  mysqlGetFlashcards, mysqlSaveFlashcards, mysqlUpdateFlashcard, mysqlDeleteFlashcard,
  mysqlGetPomodoroSessions, mysqlSavePomodoroSession,
  mysqlGetChapterProgress, mysqlSaveChapterProgress,
  mysqlGetReviewHistory, mysqlSaveReviewRecord, mysqlDeleteReviewRecord,
  mysqlGetAllUsers, mysqlSetUserRole, mysqlGetAdminStats,
} from "./db-mysql.js";

dotenv.config();
if (fs.existsSync(".env.example")) {
  const envExample = dotenv.parse(fs.readFileSync(".env.example"));
  for (const k in envExample) {
    if (!process.env[k]) {
      process.env[k] = envExample[k];
    }
  }
}


// ============= Database Setup (JSON File — Safe Write) =============
const DB_FILE = path.join(process.cwd(), "db.json");
const DB_BACKUP_FILE = path.join(process.cwd(), "db.backup.json");

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {} }, null, 2));
    return { users: {} };
  }
  try {
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    if (!raw.trim()) throw new Error("Empty DB");
    return JSON.parse(raw);
  } catch(e: any) {
    console.error("[DB] CRITICAL: Failed to read/parse db.json:", e.message);
    // Try to recover from backup instead of wiping everything
    if (fs.existsSync(DB_BACKUP_FILE)) {
      try {
        const backupRaw = fs.readFileSync(DB_BACKUP_FILE, "utf-8");
        const backupData = JSON.parse(backupRaw);
        console.log("[DB] Recovered from backup file (db.backup.json)");
        fs.writeFileSync(DB_FILE, backupRaw);
        return backupData;
      } catch (backupErr: any) {
        console.error("[DB] Backup recovery also failed:", backupErr.message);
      }
    }
    // Last resort: create a fresh DB but keep a corrupted copy for forensics
    const corruptedBackup = DB_FILE.replace(".json", ".corrupted." + Date.now() + ".json");
    try { fs.copyFileSync(DB_FILE, corruptedBackup); } catch {}
    console.error(`[DB] All recovery failed. Corrupted DB saved to ${corruptedBackup}. Starting fresh.`);
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {} }, null, 2));
    return { users: {} };
  }
}

function writeDB(data: any) {
  // Write to temp file first, then atomically rename (prevents partial writes)
  const tmpFile = DB_FILE + ".tmp." + Date.now();
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  // Create backup before replacing
  if (fs.existsSync(DB_FILE)) {
    try { fs.copyFileSync(DB_FILE, DB_BACKUP_FILE); } catch {}
  }
  fs.renameSync(tmpFile, DB_FILE);
}

/**
 * Atomic read-modify-write: reads the latest data, passes it to the updater
 * callback, then writes the result safely via temp-file + rename.
 * Nesting is tracked via _atomicDepth so inner calls share the same db snapshot.
 *
 * IMPORTANT: The updater must be synchronous. No async/await inside.
 */
let _atomicDepth = 0;
let _atomicDB: any = null;

function atomicDBUpdate<T>(updater: (db: any) => T): T {
  const isOutermost = _atomicDepth === 0;
  if (isOutermost) {
    _atomicDepth++;
    try {
      _atomicDB = readDB();
      const result = updater(_atomicDB);
      writeDB(_atomicDB);
      return result;
    } finally {
      _atomicDB = null;
      _atomicDepth--;
    }
  } else {
    // Nested call: reuse same db object, don't re-read or re-write
    _atomicDepth++;
    try {
      return updater(_atomicDB);
    } finally {
      _atomicDepth--;
    }
  }
}

function hasUserEngaged(username: string, db: any): boolean {
  const user = db.users[username];
  if (!user) return false;
  const hasConversations = user.conversationHistory && user.conversationHistory.length > 0;
  const hasBehavioralEvents = user.behavioralEvents && user.behavioralEvents.length > 0;
  const hasChats = user.chats && user.chats.length > 0;
  const hasProfileFromLLM = user.profile && user.profile.lastUpdated;
  return hasConversations || hasBehavioralEvents || hasChats || hasProfileFromLLM;
}

// ============= 统一获取学习行为事件（MySQL 优先，JSON 兜底）=============
async function getBehavioralEvents(username: string): Promise<any[]> {
  if (mysqlAvailable) {
    const events = await mysqlGetEvents(username);
    if (events.length > 0) return events;
  }
  // fallback: JSON
  const db = readDB();
  return db.users[username]?.behavioralEvents || [];
}

function buildProfileResponse(username: string, behavioralEvents: any[], profile: any) {
  const hasEvents = behavioralEvents.length > 0;
  if (!hasEvents && Object.keys(profile?.abilityScores || {}).length === 0) {
    return {
      name: username,
      ...profile,
      calendar: { totalActive: 0, maxStreak: 0, data: [] },
      trendData: [],
      abilityScores: {},
    };
  }
  const realCalendar = buildCalendarFromBehavioralEvents(behavioralEvents);
  const realTrend = buildTrendFromBehavioralEvents(behavioralEvents);
  const realScores = buildSubjectScoresFromBehavioralEvents(behavioralEvents, profile);
  return {
    name: username,
    ...profile,
    calendar: realCalendar,
    trendData: realTrend,
    abilityScores: realScores,
  };
}

async function getUserProfile(username: string) {
  // 纯 MySQL 读取画像
  let profile: any = null;
  if (mysqlAvailable) {
    profile = await mysqlGetProfile(username);
  }

  // JSON 只做紧急兜底
  if (!profile) {
    const db = readDB();
    profile = db.users[username]?.profile || {};
  }

  if (!profile || Object.keys(profile).length === 0) {
    // 检查用户是否存在（MySQL 或 JSON）
    const db = readDB();
    if (!db.users[username] && mysqlAvailable) {
      const user = await mysqlGetUser(username);
      if (!user) return null;
    } else if (!db.users[username]) {
      return null;
    }
    return {
      name: username,
      calendar: { totalActive: 0, maxStreak: 0, data: [] },
      trendData: [],
      abilityScores: {},
    };
  }

  const behavioralEvents = await getBehavioralEvents(username);
  return buildProfileResponse(username, behavioralEvents, profile);
}

async function saveUserProfile(username: string, profile: any) {
  // MySQL 主存储
  if (mysqlAvailable) {
    mysqlSaveProfile(username, profile).catch(e => console.error("[MySQL] Save profile failed:", e));
  }
  // JSON 兜底
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

  // 异步获取最新画像、章节进度和通知
  Promise.all([
    getUserProfile(username),
    getChapterProgress(username),
    Promise.resolve((() => { const db = readDB(); return db.users[username]?.notifications || []; })()),
  ]).then(([profile, chapterProgress, notifications]) => {
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
        // Client may have disconnected
      }
    }
  }).catch(e => console.error("[SSE] broadcastProfileUpdate error:", e));
}

// ============= Chapter Progress Tracking =============
function getChapterProgress(username: string) {
  let result: any = { chapters: [] };
  atomicDBUpdate((db) => {
    if (!db.users[username]) return;
    if (!db.users[username].chapterProgress) {
      db.users[username].chapterProgress = { chapters: [] };
    }
    result = db.users[username].chapterProgress;
  });
  return result;
}

function saveChapterProgress(username: string, progress: any) {
  atomicDBUpdate((db) => {
    if (!db.users[username]) return;
    db.users[username].chapterProgress = progress;
  });
  // 异步同步到 MySQL（不阻塞主流程）
  if (mysqlAvailable) {
    mysqlSaveChapterProgress(username, progress).catch(e => console.error("[MySQL] Save chapter progress failed:", e));
  }
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
    const currentPhase = (db.users[username]?.profile?.learningPath || []).find((p: any) => p.status === "current");
    const phaseChapters = progress.chapters.filter(
      (c: any) => c.phaseTitle === currentPhase?.title && c.status !== "completed"
    );
    if (currentPhase && phaseChapters.length === 0) {
      atomicDBUpdate((freshDb) => {
        const lp = freshDb.users[username]?.profile?.learningPath;
        if (!lp) return;
        const phase = lp.find((p: any) => p.status === "current");
        if (!phase) return;
        phase.status = "completed";
        phase.progress = 100;
        phase.statusMsg = "已完成 · 全部掌握";
        const nextPhase = lp.find((p: any) => p.status === "locked");
        if (nextPhase) {
          nextPhase.status = "current";
          nextPhase.progress = 0;
          nextPhase.statusMsg = "进行中 · 新阶段已解锁";
        }
      });
      console.log(`[ChapterProgress] Phase completed: ${currentPhase.title}, next phase unlocked`);
    }
  }

  return changed;
}

// ============= Build Behavioral Summary from Learning Events =============
function buildBehavioralSummary(events: any[]): string {
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
function buildCalendarFromBehavioralEvents(events: any[]) {

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
      case 'pomodoro_session':
        day.totalSeconds += (evt.payload?.duration || 25) * 60;
        subject = '番茄钟专注';
        break;
      case 'flashcard_review':
        day.totalSeconds += 30;
        subject = '闪卡复习';
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
function buildTrendFromBehavioralEvents(events: any[]) {
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
        case 'pomodoro_session': totalSeconds += (evt.payload?.duration || 25) * 60; break;
        case 'flashcard_review': totalSeconds += 30; break;
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
function buildSubjectScoresFromBehavioralEvents(events: any[], existingProfile: any) {

  // If no behavioral events exist, return empty — don't fabricate default scores
  if (events.length === 0) {
    return {};
  }

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
  const behavioralSummary = buildBehavioralSummary(
    db.users[username]?.behavioralEvents || []
  );

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

    // ===== Merge and Save (atomic to prevent race conditions) =====
    atomicDBUpdate((db2: any) => {
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
    });

    console.log(`[Profile] Successfully updated for ${username} (two-phase)`);

    // 同步到 MySQL（atomicDBUpdate 只写了 JSON，MySQL 是主存储必须同步）
    try {
      const latestProfile = readDB().users[username]?.profile;
      if (latestProfile && mysqlAvailable) {
        await mysqlSaveProfile(username, latestProfile);
        console.log(`[Profile] Synced to MySQL for ${username}`);
      }
    } catch (e: any) {
      console.error('[Profile] MySQL sync failed:', e.message);
    }

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

const CODE_EXERCISE_AGENT_PROMPT = `你是一个编程实战教学专家。请根据学生的学习阶段和当前知识点，生成一个贴合该知识点的 Python 代码实操练习题。

## 输出格式（严格遵守，不要输出任何其他内容）
每个字段以 "---FIELD_NAME---" 开头，后跟内容。字段内容中不要出现 "---" 字符串：

---TITLE---
<实验标题，简洁明了，10字以内>
---REQUIREMENT---
<任务要求，200-400字。使用 Markdown 格式化，像教材一样结构化>

## 任务要求（REQUIREMENT）格式规范
必须使用以下 Markdown 结构组织内容：

**功能要求：**
- <具体功能点1>
- <具体功能点2>
- <具体功能点3>

**输入说明：**
- <输入参数/数据格式>

**输出说明：**
- <预期输出的格式和含义>

**关键步骤：**
1. <第一步做什么>
2. <第二步做什么>
3. <第三步做什么>

涉及数学公式时使用 LaTeX 语法：行内公式用 $...$，独立公式用 $$...$$。例如：时间复杂度 $O(n^2)$，求和公式 $$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$
---HINT---
<代码提示，50-150字。给出核心思路或关键 API/函数名，但不直接给出完整答案。可使用 Markdown 行内代码 \`函数名\` 格式>
---INITIAL_CODE---
<初始代码模板，包含必要的import和占位注释，让学生在此基础编写核心逻辑>
---ANSWER---
<完整参考答案，带注释说明每一步的作用>

## 铁律
1. 只输出上述格式，不要任何开场白或结束语
2. 代码字段中的 Python 代码保持原样，不需要转义引号
3. REQUIREMENT 必须用 Markdown 结构化（**功能要求：** **输入说明：** **输出说明：** **关键步骤：**）
4. 数学表达式必须使用 LaTeX（$...$ 或 $$...$$）
5. 内容中不要出现 "---" 三个连续短横线
6. 必须贴合学生的当前学习阶段，难度适中`;

const PROJECT_AGENT_PROMPT = `你是一个编程实战项目设计专家。请根据学生的学习阶段和当前知识点，设计一个具体、有意义的实战项目。

## 输出格式（严格遵守）
每个字段以 "---FIELD_NAME---" 开头，后跟内容：

---DESC---
<项目详细描述，200-400字。要说清楚：这个项目做什么、为什么做、实际应用场景。不要泛泛而谈，要给出具体的技术方案和数据流。例如："使用 Flask 构建一个 RESTful API，实现对 Todo 任务的增删改查，数据存储在 SQLite 中。前端使用 HTML + Vanilla JS 调用 API 渲染界面。这是一个典型的全栈入门项目，涵盖了前后端分离的核心概念。">
---GOALS---
<项目学习目标，150-250字。列出 3-5 个具体可衡量的学习目标，使用 Markdown 列表格式。例如：- 掌握 Flask 路由和请求处理 - 理解 RESTful API 设计原则 - 学会 SQLite 数据库基本操作>
---STEPS---
<实现步骤，至少 5 步，每步包含具体的技术动作。使用 Markdown 编号列表。例如：1. 初始化 Flask 项目并配置路由 2. 设计 SQLite 数据表结构并创建数据库 3. 实现 CRUD API 接口（POST/GET/PUT/DELETE） 4. 编写前端 HTML 页面和 JS 交互逻辑 5. 联调前后端，处理跨域和错误情况>
---CRITERIA---
<验收标准，3-5 条可验证的完成条件，使用 Markdown 列表。例如：- 所有 API 接口返回正确的 JSON 数据和状态码 - 前端页面能完整展示、新增、修改、删除任务 - 代码有适当注释，函数命名清晰>
---TIPS---
<学习提示，100-150字。给出 2-3 条针对该项目的具体建议，如常见坑点、调试技巧、推荐工具等>

## 铁律
1. 只输出上述格式，不要任何开场白或结束语
2. 项目内容必须具体、可执行，不能泛泛而谈
3. 技术栈要与主题匹配（如 Python 主题用 Flask/Django，前端主题用 React/Vue）
4. 内容中不要出现 "---" 三个连续短横线
5. 使用 Markdown 格式化列表和强调`;

const MATERIAL_PARSE_PROMPT = `你是一个学习资料分析专家。用户上传了一份学习资料，请从中提取知识点并生成结构化学习内容。

## 输出要求
纯JSON对象（不要\`\`\`json包裹，不要解释）：

{
  "summary": "<资料摘要，Markdown格式，200-400字。概括资料的核心内容和知识体系>",
  "knowledgePoints": ["<知识点1>", "<知识点2>", "<知识点3>", ...],
  "mindmap": {
    "name": "<资料主题>",
    "value": 100,
    "children": [
      {"name": "<知识分类1>", "value": 80, "children": [{"name":"<具体点>","value":40},{"name":"<具体点>","value":40}]},
      {"name": "<知识分类2>", "value": 75, "children": [{"name":"<具体点>","value":38},{"name":"<具体点>","value":37}]},
      {"name": "<知识分类3>", "value": 70, "children": [{"name":"<具体点>","value":35},{"name":"<具体点>","value":35}]}
    ]
  },
  "exercises": [
    {"id":"q1","type":"单选题","difficulty":"易","title":"<具体题目>","options":["<A>","<B>","<C>","<D>"],"answer":0,"analysis":"<详细解析，至少80字>"},
    {"id":"q2","type":"单选题","difficulty":"易","title":"<具体题目>","options":["<A>","<B>","<C>","<D>"],"answer":1,"analysis":"<详细解析>"},
    {"id":"q3","type":"单选题","difficulty":"中","title":"<具体题目>","options":["<A>","<B>","<C>","<D>"],"answer":2,"analysis":"<详细解析>"},
    {"id":"q4","type":"单选题","difficulty":"中","title":"<具体题目>","options":["<A>","<B>","<C>","<D>"],"answer":3,"analysis":"<详细解析>"},
    {"id":"q5","type":"单选题","difficulty":"难","title":"<具体题目>","options":["<A>","<B>","<C>","<D>"],"answer":0,"analysis":"<详细解析>"}
  ]
}

## 铁律
1. 只输出纯JSON，不要包裹
2. 所有题目必须基于资料内容，不能凭空编造
3. 思维导图至少3个二级分类，每个至少2个三级节点
4. 知识点列表至少列出5个`;
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

  app.use(express.json({ limit: "50mb" }));
  // app.use(globalLimiter); // disabled for development

  // Middleware to auto-create user on valid token
  const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    let raw = req.headers.authorization || "";
    // 兼容 "Bearer token_xxx" 和 "token_xxx" 两种格式
    if (raw.startsWith("Bearer ")) raw = raw.slice(7);
    let username = raw.startsWith("token_") ? raw.slice(6) : raw;
    if (!username) {
      // Fallback to query parameter for EventSource SSE connections
      raw = (req.query.token as string) || "";
      username = raw.startsWith("token_") ? raw.slice(6) : raw;
    }
    if (!username) return res.status(401).json({ error: "Unauthorized" });
    // 循环解码，处理 URL 双重编码
    try {
      let prev = username;
      for (let i = 0; i < 3; i++) {
        const decoded = decodeURIComponent(prev);
        if (decoded === prev) break;
        prev = decoded;
      }
      username = prev;
    } catch(e) {}
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

  // ============= 管理员中间件 =============
  const adminMiddleware = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const username = (req as any).username;
    if (!username) return res.status(401).json({ error: "未登录" });
    try {
      const user = await mysqlGetUser(username);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ error: "无管理员权限" });
      }
      next();
    } catch (e) {
      return res.status(500).json({ error: "权限校验失败" });
    }
  };

  // ============= 管理员 API =============
  // 获取全平台统计数据
  app.get("/api/admin/stats", authMiddleware, adminMiddleware, async (_req, res) => {
    try {
      const stats = await mysqlGetAdminStats();
      res.json(stats);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 获取所有用户列表
  app.get("/api/admin/users", authMiddleware, adminMiddleware, async (_req, res) => {
    try {
      const users = await mysqlGetAllUsers();
      res.json(users);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 获取详情数据（点击看板卡片时展示）
  app.get("/api/admin/details", authMiddleware, adminMiddleware, async (req, res) => {
    const { type } = req.query; // events | chats | wrong | cards | reviews
    try {
      const pool = (await import("./db-mysql.js")).default;
      let data: any[] = [];
      switch (type) {
        case "events": {
          const [rows] = await pool.query<any[]>(
            "SELECT le.username, le.event_type, le.payload, le.created_at FROM learning_events le WHERE DATE(DATE_ADD(le.created_at, INTERVAL 8 HOUR)) = CURDATE() ORDER BY le.created_at DESC LIMIT 200"
          );
          data = rows;
          break;
        }
        case "chats": {
          const [rows] = await pool.query<any[]>(
            "SELECT c.username, c.chat_data, c.updated_at FROM chats c ORDER BY c.updated_at DESC LIMIT 50"
          );
          // chat_data 是用户的所有对话数组，需要展开
          for (const row of rows) {
            const raw = typeof row.chat_data === "string" ? JSON.parse(row.chat_data) : row.chat_data;
            const chats = Array.isArray(raw) ? raw : [];
            for (const chat of chats) {
              data.push({
                username: row.username,
                title: chat.title || chat.messages?.[0]?.content?.substring(0, 60) || "(无标题)",
                messageCount: chat.messages?.length || 0,
                updated_at: row.updated_at,
              });
            }
          }
          break;
        }
        case "wrong": {
          const [rows] = await pool.query<any[]>(
            "SELECT wb.username, wb.question_id, wb.question_data, wb.err_count, wb.updated_at FROM wrong_book wb ORDER BY wb.err_count DESC LIMIT 200"
          );
          data = rows.map(r => {
            const q = typeof r.question_data === "string" ? JSON.parse(r.question_data) : r.question_data;
            return {
              username: r.username,
              questionTitle: q?.title || "(无标题)",
              category: q?.categoryId || "未分类",
              difficulty: q?.difficulty || "未知",
              errCount: r.err_count,
              updated_at: r.updated_at,
            };
          });
          break;
        }
        case "cards": {
          const [rows] = await pool.query<any[]>(
            "SELECT f.username, f.card_data, f.created_at FROM flashcards f ORDER BY f.created_at DESC LIMIT 200"
          );
          data = rows.map(r => {
            const c = typeof r.card_data === "string" ? JSON.parse(r.card_data) : r.card_data;
            return {
              username: r.username,
              front: c?.front || "",
              back: c?.back || "",
              created_at: r.created_at,
            };
          });
          break;
        }
        case "reviews": {
          const [rows] = await pool.query<any[]>(
            "SELECT rh.username, rh.record_data, rh.created_at FROM review_history rh ORDER BY rh.created_at DESC LIMIT 50"
          );
          data = rows.map(r => {
            const rec = typeof r.record_data === "string" ? JSON.parse(r.record_data) : r.record_data;
            return {
              username: r.username,
              paperTitle: rec?.paperTitle || "专项复习",
              totalCount: rec?.totalCount || 0,
              correctCount: rec?.correctCount || 0,
              accuracy: rec?.accuracy || 0,
              created_at: r.created_at,
            };
          });
          break;
        }
        default:
          return res.status(400).json({ error: "无效的 type 参数" });
      }
      res.json({ type, data });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 设置用户角色
  app.post("/api/admin/users/role", authMiddleware, adminMiddleware, async (req, res) => {
    const { username, role } = req.body;
    if (!username || !["admin", "user"].includes(role)) {
      return res.status(400).json({ error: "参数无效" });
    }
    try {
      const ok = await mysqlSetUserRole(username, role);
      if (ok) {
        res.json({ success: true, message: `${username} 已${role === 'admin' ? '升级为管理员' : '降级为普通用户'}` });
      } else {
        res.status(500).json({ error: "操作失败" });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 获取当前用户角色
  app.get("/api/auth/role", authMiddleware, async (req, res) => {
    const username = (req as any).username;
    try {
      if (mysqlAvailable) {
        const user = await mysqlGetUser(username);
        return res.json({ role: user?.role || "user" });
      }
      // JSON fallback
      const db = readDB();
      return res.json({ role: db.users[username]?.role || "user" });
    } catch {
      res.json({ role: "user" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "用户名和密码不能为空" });
    }

    // 优先使用 MySQL 验证
    if (mysqlAvailable) {
      const user = await mysqlGetUser(username);
      if (user && await mysqlVerifyPassword(password, user.password)) {
        // 同步到 JSON DB，确保其他功能正常
        const db = readDB();
        if (!db.users[username]) {
          db.users[username] = { password, phone: user.phone, role: user.role };
          writeDB(db);
        }
        const safeToken = "token_" + encodeURIComponent(username);
        return res.json({ success: true, token: safeToken, username, role: user.role || "user" });
      }
      return res.status(401).json({ success: false, message: "用户名或密码错误" });
    }

    // 回退到 JSON DB
    const db = readDB();
    if (db.users[username] && await bcrypt.compare(password, db.users[username].password)) {
      const safeToken = "token_" + encodeURIComponent(username);
      res.json({ success: true, token: safeToken, username });
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
    // 密码最少8位
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: "密码长度不能少于8位" });
    }

    // 优先使用 MySQL 存储
    if (mysqlAvailable) {
      const created = await mysqlCreateUser(username, password, phone);
      if (!created) {
        return res.status(400).json({ success: false, message: "用户名已存在" });
      }
      // 同步到 JSON DB，确保其他功能正常
      const db = readDB();
      const hashedPwd = await bcrypt.hash(password, 10);
      db.users[username] = { password: hashedPwd, phone };
      writeDB(db);
      return res.json({ success: true, message: "注册成功" });
    }

    // 回退到 JSON DB
    const db = readDB();
    if (db.users[username]) {
      res.status(400).json({ success: false, message: "用户名已存在" });
    } else {
      const hashedPwd2 = await bcrypt.hash(password, 10);
      db.users[username] = { password: hashedPwd2, phone };
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
        const hashedNewPwd = await bcrypt.hash(newPassword, 10);
        db.users[updateResult.username].password = hashedNewPwd;
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
      const hashedNewPwd3 = await bcrypt.hash(newPassword, 10);
      db.users[foundUsername].password = hashedNewPwd3;
      writeDB(db);
      res.json({ success: true, message: "密码重置成功" });
    } else {
      res.status(400).json({ success: false, message: "验证信息错误，用户名与手机号不匹配" });
    }
  });

  // Profile endpoints
  app.get("/api/user-profile", authMiddleware, async (req, res) => {
    const username = (req as any).username;
    const profile = await getUserProfile(username);
    res.json(profile);
  });

  app.post("/api/user-profile", authMiddleware, async (req, res) => {
    const username = (req as any).username;
    await saveUserProfile(username, req.body);
    res.json({ success: true });
  });

  // ============= 头像上传 =============
  app.post("/api/user/avatar", authMiddleware, async (req, res) => {
    const username = (req as any).username;
    const { avatar } = req.body; // base64 或 URL
    if (!avatar || typeof avatar !== "string") {
      return res.status(400).json({ error: "头像数据无效" });
    }
    // 限制头像大小（base64 约 500KB，原图约 350KB）
    if (avatar.length > 600000) {
      return res.status(400).json({ error: "头像文件过大，请使用小于 500KB 的图片" });
    }
    try {
      // 保存到 JSON
      atomicDBUpdate((db) => {
        if (!db.users[username]) return;
        if (!db.users[username].profile) db.users[username].profile = {};
        db.users[username].profile.avatar = avatar;
      });
      // 同步到 MySQL（先读现有数据再合并，避免覆盖）
      if (mysqlAvailable) {
        try {
          const existingProfile = await mysqlGetProfile(username);
          const merged = { ...(existingProfile || {}), avatar };
          const saved = await mysqlSaveProfile(username, merged);
          if (!saved) console.error("[Avatar] MySQL 保存失败:", username);
        } catch (err: any) {
          console.error("[Avatar] MySQL 异常:", err.message);
        }
      }
      console.log(`[Avatar] 头像已保存: ${username} (${avatar.length} 字符)`);
      res.json({ success: true, avatar });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============= 获取头像 =============
  app.get("/api/user/avatar", authMiddleware, async (req, res) => {
    const username = (req as any).username;
    try {
      // 优先从 MySQL profile 读取
      if (mysqlAvailable) {
        const profile = await mysqlGetProfile(username);
        if (profile?.avatar) {
          console.log(`[Avatar] MySQL 读取成功: ${username} (${profile.avatar.length} 字符)`);
          return res.json({ avatar: profile.avatar });
        }
      }
      const db = readDB();
      const avatar = db.users[username]?.profile?.avatar || null;
      console.log(`[Avatar] JSON 读取: ${username} → ${avatar ? '有头像(' + avatar.length + '字符)' : '无头像'}`);
      res.json({ avatar });
    } catch (e: any) {
      console.error("[Avatar] 读取失败:", e.message);
      res.json({ avatar: null });
    }
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

      const promptMap: Record<string, string> = { explanation: EXPLANATION_AGENT_PROMPT, mindmap: MINDMAP_AGENT_PROMPT, quiz: QUIZ_AGENT_PROMPT, "video-code": VIDEO_CODE_AGENT_PROMPT, reading: READING_AGENT_PROMPT, "code-exercise": CODE_EXERCISE_AGENT_PROMPT, project: PROJECT_AGENT_PROMPT };
      const systemInstruction = (promptMap[type] || EXPLANATION_AGENT_PROMPT) + `\n\n学生画像: ${JSON.stringify(userProfile || {})}`;

      // Optimize max_tokens per type for faster generation
      const tokenMap: Record<string, number> = {
        mindmap: 2048,       // JSON tree structure — small
        quiz: 4096,          // 8 quiz questions — medium
        "code-exercise": 4096,  // Structured code exercise
        project: 3072,         // Project plan
        "video-code": 6144,  // Code examples — medium-large
        explanation: 8192,   // Detailed explanation — large
        reading: 8192,       // Reading material — large
      };

      const response = await agentConfigs.resource.client.chat.completions.create({
        model: agentConfigs.resource.model,
        temperature: 0.5,
        max_tokens: tokenMap[type] || 4096,
        messages: [{ role: "system", content: systemInstruction }, { role: "user", content: `知识点: ${sanitizeUserContent(topic)}` }],
      });

      const rawText = response.choices[0].message.content || "";

      // code-exercise / project 类型：从分隔符格式中解析字段
      if (type === "code-exercise" || type === "project") {
        try {
          const extract = (marker: string) => {
            // 用 split 按 ---MARKER--- 分割，取后半段的开头到下一个 --- 标记之前
            const markerStr = "---" + marker + "---";
            const idx = rawText.indexOf(markerStr);
            if (idx === -1) return "";
            const after = rawText.substring(idx + markerStr.length);
            // 找到下一个 ---XXX--- 标记作为结束边界
            const nextMarker = after.match(/---[A-Z_]+---/);
            return nextMarker ? after.substring(0, nextMarker.index!).trim() : after.trim();
          };

          const parsed =
            type === "project"
              ? {
                  desc: extract("DESC") || "",
                  goals: extract("GOALS") || "",
                  steps: extract("STEPS") || "",
                  criteria: extract("CRITERIA") || "",
                  tips: extract("TIPS") || "",
                }
              : {
                  title: extract("TITLE") || "代码实验",
                  language: "Python",
                  requirement: extract("REQUIREMENT") || "",
                  hint: extract("HINT") || "",
                  initialCode: extract("INITIAL_CODE") || "# 请编写代码",
                  answer: extract("ANSWER") || "# 暂无参考答案",
                };

          res.json({ text: rawText, data: parsed });
        } catch (parseErr: any) {
          console.error("[CodeExercise] Parse failed:", parseErr.message);
          console.error("[CodeExercise] Raw (first 800 chars):", rawText.substring(0, 800));
          res.status(500).json({ error: "代码实验数据解析失败，请重试" });
        }
      } else {
        res.json({ text: rawText });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============= 自适应学习路径 =============
  app.post("/api/adaptive-path", authMiddleware, async (req, res) => {
    try {
      const username = (req as any).username;
      const db = readDB();
      const profile = db.users[username]?.profile || {};
      const wrongBook = db.users[username]?.wrongBook || {};
      const events = db.users[username]?.behavioralEvents || [];
      const learningPath = profile.learningPath || [];

      if (learningPath.length === 0) return res.json({ path: learningPath, adjusted: false });

      // 分析当前阶段
      const currentPhase = learningPath.find((p: any) => p.status === "current");
      if (!currentPhase) return res.json({ path: learningPath, adjusted: false });

      // 统计当前阶段错题
      const phaseItems = currentPhase.items || [];
      const wrongRecords = Object.values(wrongBook) as any[];
      const phaseWrong = wrongRecords.filter((r: any) =>
        phaseItems.some((item: string) => r.q?.title?.includes(item) || r.q?.analysis?.includes(item))
      );

      // 错题率 > 30% → 需要补习
      const totalExercises = events.filter((e: any) =>
        e.eventType === "exercise_answer" &&
        phaseItems.some((item: string) => e.payload?.questionTitle?.includes(item))
      ).length;

      const errorRate = totalExercises > 0 ? phaseWrong.length / Math.max(totalExercises, 1) : 0;

      let adjusted = false;

      if (errorRate > 0.3 && phaseWrong.length >= 2) {
        // 在 current phase 后面插入复习阶段
        const weakPoints = [...new Set(phaseWrong.map((r: any) => r.q?.title || "").filter(Boolean))];
        const reviewPhase = {
          title: `${currentPhase.title} 重点复习`,
          status: "locked",
          statusMsg: "薄弱环节 · 建议巩固",
          items: weakPoints.slice(0, 5),
          progress: 0,
          isReview: true,
        };

        // 将复习阶段插入到 current 之后
        const idx = learningPath.indexOf(currentPhase);
        const newPath = [...learningPath];
        newPath.splice(idx + 1, 0, reviewPhase);

        // 更新锁定状态
        newPath.forEach((p: any, i: number) => {
          if (i === idx) p.status = "current";
          else if (i === idx + 1) p.status = "locked";
          else if (i > idx + 1 && p.status === "locked") p.status = "locked";
        });

        await atomicDBUpdate((freshDb: any) => {
          if (!freshDb.users[username].profile) freshDb.users[username].profile = {};
          freshDb.users[username].profile.learningPath = newPath;
        });

        res.json({ path: newPath, adjusted: true, weakPoints, errorRate: Math.round(errorRate * 100) });
      } else {
        res.json({ path: learningPath, adjusted: false, errorRate: Math.round(errorRate * 100) });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============= 增强聊天（支持难度级别 + 追问模式）=============
  app.post("/api/chat/enhanced", authMiddleware, async (req, res) => {
    setupSSE(req, res);
    try {
      const username = (req as any).username;
      const { messages, userProfile, difficulty = "auto", followUpMode = false } = req.body;
      const validation = validateMessages(messages);
      if (!validation.valid) { res.end(); return; }

      logUserAction(username, "chat_enhanced", `难度:${difficulty} 追问:${followUpMode}`);
      storeConversationContext(username, messages);

      // 难度级别 prompt
      const difficultyPrompts: Record<string, string> = {
        beginner: "请用最简单、最基础的方式解释，多用生活化的比喻和例子。假设学生是零基础入门。",
        intermediate: "请用标准的技术解释，包含代码示例和实际应用场景。",
        expert: "请深入讲解底层原理、算法复杂度和架构设计思路。可以涉及相关学术论文和前沿进展。",
        auto: "请根据学生的问题自行判断合适的难度级别。",
      };

      const followUpPrompt = followUpMode
        ? "\n\n【苏格拉底式追问模式】回答完后，请在末尾提出1-2个引导性问题，帮助学生进一步思考。用 '🤔 **思考题：**' 开头。"
        : "";

      const systemMsg = {
        role: "system" as const,
        content: TUTOR_AGENT_PROMPT + `\n\n难度级别：${difficulty}\n${difficultyPrompts[difficulty] || difficultyPrompts.auto}${followUpPrompt}\n\n学生画像: ${JSON.stringify(userProfile || {})}`,
      };

      const sanitizedMessages = messages.map((m: any) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.role === "user" ? sanitizeUserContent(m.content) : m.content,
      }));

      const stream = await agentConfigs.tutor.client.chat.completions.create({
        model: agentConfigs.tutor.model,
        temperature: 0.7,
        max_tokens: 4096,
        messages: [systemMsg, ...sanitizedMessages],
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

      // 记录行为事件
      const db = readDB();
      if (!db.users[username].behavioralEvents) db.users[username].behavioralEvents = [];
      db.users[username].behavioralEvents.push({
        timestamp: new Date().toISOString(),
        eventType: "chat_enhanced",
        payload: { difficulty, followUpMode, messageCount: messages.length },
      });
      writeDB(db);

      const fullMessages = [...sanitizedMessages, { role: "assistant", content: fullResponse }];
      updateProfileFromConversation(username, fullMessages).catch(() => {});
    } catch (e: any) {
      sendSSEEvent(res, { error: e.message });
    } finally {
      res.end();
    }
  });

  // ============= 资料上传与AI解析 =============
  app.post("/api/upload-material", authMiddleware, async (req, res) => {
    try {
      const username = (req as any).username;
      const { fileName, fileContent } = req.body;

      if (!fileContent || typeof fileContent !== "string") {
        return res.status(400).json({ error: "请上传有效的文件内容" });
      }

      // 检测文件类型，拒绝二进制内容（当前模型仅支持文本）
      const isImage = fileContent.startsWith("data:image/");
      const isBase64Data = fileContent.startsWith("data:");

      if (isImage) {
        return res.status(400).json({
          error: "当前 AI 模型仅支持文本文件解析，暂不支持图片识别。请上传 .txt / .md / .csv / .json 等文本格式，或将图片中的文字手动录入后上传。"
        });
      }

      if (isBase64Data) {
        return res.status(400).json({
          error: "当前 AI 模型仅支持文本内容解析。请上传文本格式文件（.txt / .md / .py / .js 等）。"
        });
      }

      // 截取前 15000 字符发送给 AI（避免 token 超限）
      const truncatedContent = fileContent.length > 15000
        ? fileContent.substring(0, 15000) + "\n...(内容已截断)"
        : fileContent;

      // 检测是否为可读文本（排除二进制垃圾字符）
      const printableCount = [...truncatedContent].filter(c => {
        const code = c.charCodeAt(0);
        return (code >= 32 && code <= 126) || code === 10 || code === 13 || code === 9 || code > 127;
      }).length;
      const printableRatio = printableCount / Math.max(truncatedContent.length, 1);

      if (printableRatio < 0.7) {
        return res.status(400).json({
          error: "文件内容无法识别为文本。PDF / Word / PPT 等二进制格式暂不支持直接解析，请将内容复制粘贴为纯文本后上传。"
        });
      }

      logUserAction(username, "upload_material", `上传资料: ${fileName || "未命名文件"}`);

      const prompt = MATERIAL_PARSE_PROMPT + `\n\n## 资料内容\n文件名：${fileName || "未命名"}\n内容：\n${truncatedContent}`;

      const response = await agentConfigs.resource.client.chat.completions.create({
        model: agentConfigs.resource.model,
        temperature: 0.5,
        max_tokens: 8192,
        messages: [{ role: "user", content: prompt }],
      });

      let resultText = response.choices[0]?.message?.content || "";
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      let parsed: any = null;

      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonrepair(jsonMatch[0]));
        } catch (e) {
          console.warn("[Upload] JSON parse error:", e);
        }
      }

      if (!parsed || !parsed.summary) {
        return res.status(500).json({ error: "AI 解析失败，请稍后重试" });
      }

      // 将解析结果存入用户画像，与现有模块衔接
      const db = readDB();
      if (db.users[username]) {
        const profile = db.users[username].profile || {};
        const uploadedMaterials = profile.uploadedMaterials || [];

        const materialEntry = {
          id: `mat-${Date.now()}`,
          fileName: fileName || "未命名",
          uploadedAt: new Date().toISOString(),
          summary: parsed.summary,
          knowledgePoints: parsed.knowledgePoints || [],
          mindmap: parsed.mindmap || null,
          exercises: parsed.exercises || [],
        };

        uploadedMaterials.push(materialEntry);
        profile.uploadedMaterials = uploadedMaterials;
        db.users[username].profile = profile;
        writeDB(db);

        // 广播 SSE 更新
        broadcastProfileUpdate(username);
      }

      res.json({ success: true, data: parsed });
    } catch (e: any) {
      console.error("[Upload] Error:", e);
      res.status(500).json({ error: e.message || "上传处理失败" });
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
  app.get("/api/chats", authMiddleware, async (req, res) => {
    const username = (req as any).username;
    // 优先从 MySQL 读取
    if (mysqlAvailable) {
      const mysqlChats = await mysqlGetChats(username);
      if (mysqlChats !== null) return res.json(mysqlChats);
    }
    const db = readDB();
    res.json(db.users[username].chats || []);
  });

  app.post("/api/chats", authMiddleware, async (req, res) => {
    const username = (req as any).username;
    // 只保留用户实际发过消息的对话
    const validChats = (req.body || []).filter((c: any) =>
      c.messages && c.messages.some((m: any) => m.role === "user")
    );
    const db = readDB();
    db.users[username].chats = validChats;
    writeDB(db);
    // 同步到 MySQL
    if (mysqlAvailable) mysqlSaveChats(username, validChats).catch(() => {});
    res.json({ success: true });
  });

  // Favorites endpoints
  app.get("/api/favorites", authMiddleware, async (req, res) => {
    const username = (req as any).username;
    // 优先从 MySQL 读取
    if (mysqlAvailable) {
      const mysqlFav = await mysqlGetFavorites(username);
      if (mysqlFav !== null) return res.json(mysqlFav);
    }
    const db = readDB();
    res.json({ favorites: db.users[username].favorites || [], folders: db.users[username].folders || ['全部收藏', '默认分类'] });
  });

  app.post("/api/favorites", authMiddleware, async (req, res) => {
    const username = (req as any).username;
    const db = readDB();
    if (req.body.favorites) db.users[username].favorites = req.body.favorites;
    if (req.body.folders) db.users[username].folders = req.body.folders;
    writeDB(db);
    // 同步到 MySQL
    if (mysqlAvailable) {
      mysqlSaveFavorites(username, req.body).catch(() => {});
    }
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
  app.post("/api/learning-events", authMiddleware, async (req, res) => {
    const username = (req as any).username;
    const { events } = req.body;

    if (!events) return res.status(400).json({ error: "events required" });

    const eventArray = Array.isArray(events) ? events : [events];
    const db = readDB();
    if (!db.users[username]) return res.status(404).json({ error: "user not found" });
    if (!db.users[username].behavioralEvents) db.users[username].behavioralEvents = [];

    const now = new Date().toISOString();
    for (const evt of eventArray) {
      if (!evt.eventType || !evt.payload) continue;
      db.users[username].behavioralEvents.push({
        timestamp: now,
        eventType: evt.eventType,
        payload: evt.payload,
      });
      logUserAction(username, evt.eventType, JSON.stringify(evt.payload).substring(0, 500));
    }

    // Trim old events (keep last 500)
    if (db.users[username].behavioralEvents.length > 500) {
      db.users[username].behavioralEvents = db.users[username].behavioralEvents.slice(-500);
    }

    writeDB(db);

    // 异步同步到 MySQL（mysqlInsertEvents 内部会转换时间格式）
    if (mysqlAvailable) {
      mysqlInsertEvents(username, eventArray.map(e => ({
        eventType: e.eventType,
        payload: e.payload,
        timestamp: e.timestamp || now,
      }))).catch(e => console.error("[MySQL] Insert events async error:", e));
    }

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
  app.get("/api/profile/stream", authMiddleware, async (req, res) => {
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
    const currentProfile = await getUserProfile(username);
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
      const { topic, linkType } = req.body;
      if (!topic || typeof topic !== "string") {
        return res.status(400).json({ error: "topic required" });
      }
      // linkType: "exercise" (题库, default) or "reading" (阅读链接)
      const resourceType = linkType === "reading" ? "reading" : "exercise";

      // Check cache (1 hour TTL) — separate caches for exercise vs reading
      const cacheKey = `${username}:${resourceType}:${topic}`;
      const cached = extendedLinksCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 3600000) {
        return res.json(cached.data);
      }

      logUserAction(username, "extended_links", `搜索公开资源(${resourceType}): ${topic}`);

      // Get user profile for personalization
      const db3 = readDB();
      const userLevel = db3.users[username]?.profile?.gradeLevel
        || db3.users[username]?.profile?.educationLevel
        || "未指定";

      const isReading = resourceType === "reading";
      const prompt = isReading ? `你是一个学习资源推荐专家。学生水平：${userLevel}，学习主题：${topic}。

请推荐5个适合${userLevel}学生的高质量公开阅读资源（技术文章、教材章节、博客深度解析、论文综述等）。

## 输出要求
纯JSON，不要包裹：

{
  "links": [
    {
      "title": "<文章/教材名称，具体明确>",
      "platform": "<知乎专栏 / CSDN / 掘金 / 思否 / 中国大学MOOC课件 / 豆瓣图书 / 知网>",
      "searchQuery": "<在平台上能搜到该资源的精确中文关键词>",
      "description": "<1句话描述该阅读材料的内容和为什么适合${userLevel}学生>",
      "level": "初级 / 中级 / 高级",
      "duration": "<估计阅读时长，如：15分钟 / 1小时>"
    }
  ]
}

## 规则
1. 只输出纯JSON
2. 推荐的难度必须匹配${userLevel}水平
3. 优先中文平台，推荐真实可搜索到的优质文章
4. 不要编造URL
5. 必须与${topic}直接相关
6. 推荐深度阅读材料（文章/教材），不要推荐视频` : `你是一个学习资源推荐专家。学生水平：${userLevel}，学习主题：${topic}。

请推荐5个适合${userLevel}学生的高质量公开练习资源（题库、刷题平台、习题集、竞赛题等）。

## 输出要求
纯JSON，不要包裹：

{
  "links": [
    {
      "title": "<题库/习题集名称，具体明确>",
      "platform": "<LeetCode / 牛客网 / 洛谷 / AcWing / 中国大学MOOC习题 / 学堂在线 / 教材配套习题>",
      "searchQuery": "<在平台上能搜到该资源的精确中文关键词>",
      "description": "<1句话描述该题库的题型和为什么适合${userLevel}学生练习>",
      "level": "初级 / 中级 / 高级",
      "questionCount": "<估计题目数量，如：200+题 / 50套卷>"
    }
  ]
}

## 规则
1. 只输出纯JSON
2. 推荐的难度必须匹配${userLevel}水平
3. 优先中文平台和国内常用题库平台
4. 不要编造URL
5. 必须与${topic}直接相关，是真实存在或可搜索到的题库资源
6. 不要推荐视频课程或教程，只推荐练习题目资源`;

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

  // ============= 错题本智能复习 =============

  // 知识考点提取提示词
  const KNOWLEDGE_POINT_EXTRACT_PROMPT = `你是一个学科知识分析专家。下面是一份学生的错题列表，每道题包含题目描述、分类、难度和解析。

请仔细分析每道错题涉及的知识点/考点，提取并汇总所有考点信息。

## 输出要求
纯JSON，不要包裹，格式如下：

{
  "knowledgePoints": [
    {
      "id": "kp-1",
      "name": "<考点名称，简洁明确，如'动态规划-状态转移方程'>",
      "categoryId": "<该考点对应的题目分类ID>",
      "categoryName": "<分类名称>",
      "questionIds": ["<涉及该考点的题目ID列表>"],
      "errorCount": <相关错题的总错误次数>,
      "description": "<1-2句话描述该考点的内容和为什么学生需要加强>",
      "difficulty": "易/中/难"
    }
  ],
  "summary": "<整体薄弱情况的一句话总结>"
}

## 规则
1. 每个考点名称要具体、有针对性（如"指针与内存管理"而非"编程基础"）
2. 考点去重合并：如果多道题涉及同一个考点，合并为一个条目
3. 考点数量控制在3-8个
4. errorCount 等于所有涉及该考点的错题的errCount之和
5. 只输出纯JSON`;

  // 专项试卷生成提示词
  const REVIEW_PAPER_GENERATE_PROMPT = `你是一个命题专家。请根据学生选中的复习考点，生成一套针对性专项练习试卷。

## 题目要求
- 总共5-8道单选题
- 覆盖学生选中的所有考点
- 难度比例：易30%、中40%、难30%
- 每道题必须包含：具体题目描述、4个选项(A/B/C/D)、正确答案索引(0-3)、至少100字的详细解析、所属考点ID

## 输出要求
纯JSON，不要包裹，格式如下：

{
  "paperTitle": "<试卷标题>",
  "questions": [
    {
      "id": "rv-q1",
      "title": "<题目描述>",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "answer": 0,
      "analysis": "<详细解析，至少100字>",
      "difficulty": "易/中/难",
      "knowledgePointId": "<对应考点ID>",
      "knowledgePointName": "<对应考点名称>"
    }
  ]
}`;

  // 学习总结分析提示词
  const RESULT_ANALYSIS_PROMPT = `你是一个学习分析专家。请根据学生的错题本复习测试结果，生成一份全面的学习总结反馈报告。

## 输出要求
纯JSON，不要包裹，按以下4个字段分别输出每个模块的Markdown内容：

{
  "summaryReport": "<## 📊 学习总结反馈报告\\n\\n在这里写总体表现总结，包含总题数、正确率、整体评价、与历史表现的对比分析等>",
  "weakPointAnalysis": "<## 🔴 薄弱考点分析\\n\\n在这里列出仍需加强的考点，每项包含：考点名称、正确率、具体薄弱表现>",
  "solutionApproaches": "<## 💡 同类题型解题思路\\n\\n针对出错的题型，提供具体的解题方法论，每类题型给出通用的解题步骤和技巧>",
  "reviewSuggestions": "<## 📋 针对性复习建议\\n\\n给出2-4条具体的复习建议，每条建议包含可执行的行动方案>"
}

## 规则
1. 只输出纯JSON，不要有任何markdown包裹
2. 每个字段的内容使用Markdown格式（## 标题、- 列表、**加粗**、表格等）
3. 内容要具体、有针对性，结合错题详情分析
4. 每个模块内容至少150字`;

  // 按 ## 标题拆分 Markdown 报告为4个模块
  function parseReportSections(md: string) {
    const result: any = {
      summaryReport: "",
      weakPointAnalysis: "",
      solutionApproaches: "",
      reviewSuggestions: "",
    };

    // 按 ## 标题分割（保留分隔符）
    const sections = md.split(/(?=^## )/m);
    for (const section of sections) {
      const trimmed = section.trim();
      if (!trimmed) continue;
      if (trimmed.includes("成绩总览") || trimmed.includes("学习总结") || trimmed.includes("总结反馈")) {
        result.summaryReport = trimmed;
      } else if (trimmed.includes("薄弱考点")) {
        result.weakPointAnalysis = trimmed;
      } else if (trimmed.includes("解题思路") || trimmed.includes("题型")) {
        result.solutionApproaches = trimmed;
      } else if (trimmed.includes("复习建议") || trimmed.includes("建议")) {
        result.reviewSuggestions = trimmed;
      } else if (!result.summaryReport) {
        // 第一个不匹配的段落归入 summaryReport
        result.summaryReport = trimmed;
      } else if (!result.weakPointAnalysis) {
        result.weakPointAnalysis = trimmed;
      } else if (!result.solutionApproaches) {
        result.solutionApproaches = trimmed;
      } else {
        result.reviewSuggestions = trimmed;
      }
    }

    // 如果只有一个大段落，全部放入 summaryReport
    if (!result.weakPointAnalysis && !result.solutionApproaches && !result.reviewSuggestions && result.summaryReport) {
      // 尝试按更宽松的规则二次拆分
      const parts = result.summaryReport.split(/(?=###?\s)/);
      if (parts.length >= 3) {
        for (const part of parts) {
          const t = part.trim();
          if (!t) continue;
          if (t.includes("成绩总览") || t.includes("总结")) {
            result.summaryReport = t;
          } else if (t.includes("薄弱") || t.includes("考点")) {
            result.weakPointAnalysis = t;
          } else if (t.includes("解题") || t.includes("思路") || t.includes("题型")) {
            result.solutionApproaches = t;
          } else if (t.includes("建议") || t.includes("复习")) {
            result.reviewSuggestions = t;
          }
        }
      }
    }

    return result;
  }

  // 端点1: 提取错题考点
  app.post("/api/wrong-book/extract-knowledge-points", authMiddleware, async (req, res) => {
    try {
      const username = (req as any).username;
      const { wrongQuestions } = req.body;
      console.log(`[WrongBook] Extract request from user "${username}", wrongQuestions count: ${wrongQuestions?.length || 0}`);
      if (!wrongQuestions || !Array.isArray(wrongQuestions) || wrongQuestions.length === 0) {
        return res.status(400).json({ error: "错题数据不能为空" });
      }

      // 构建错题文本描述
      const questionsText = wrongQuestions.map((item: any, idx: number) => {
        return `错题${idx + 1}：
题目ID: ${item.q.id}
分类: ${item.q.categoryId}
题型: ${item.q.type}
难度: ${item.q.difficulty}
题目: ${item.q.title}
解析: ${item.q.analysis}
错误次数: ${item.errCount}`;
      }).join("\n\n---\n\n");

      const userMessage = `以下是学生的错题列表，请分析提取所有知识点/考点：\n\n${questionsText}`;

      const response = await agentConfigs.resource.client.chat.completions.create({
        model: agentConfigs.resource.model,
        messages: [
          { role: "system", content: KNOWLEDGE_POINT_EXTRACT_PROMPT },
          { role: "user", content: userMessage }
        ],
        temperature: 0.3,
        max_tokens: 4096,
      });

      let content = response.choices[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      let parsed: any = { knowledgePoints: [], summary: "" };

      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.warn("[WrongBook] Knowledge point extraction JSON parse error:", e);
          return res.status(500).json({ error: "考点提取结果解析失败，请重试" });
        }
      }

      res.json(parsed);
    } catch (e: any) {
      console.error("[WrongBook] Extract knowledge points failed:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // 端点2: 生成专项复习试卷
  app.post("/api/wrong-book/generate-review-paper", authMiddleware, async (req, res) => {
    try {
      const { selectedKnowledgePoints, wrongQuestions } = req.body;
      if (!selectedKnowledgePoints || !Array.isArray(selectedKnowledgePoints) || selectedKnowledgePoints.length === 0) {
        return res.status(400).json({ error: "请至少选择一个复习考点" });
      }

      // 构建考点描述
      const kpText = selectedKnowledgePoints.map((kp: any, idx: number) => {
        const relatedQuestions = wrongQuestions
          ?.filter((item: any) => kp.questionIds?.includes(item.q.id))
          ?.map((item: any) => `"${item.q.title}"（难度:${item.q.difficulty}）`)
          ?.join("、") || "";

        return `考点${idx + 1}：
ID: ${kp.id}
名称: ${kp.name}
分类: ${kp.categoryName || ""}
难度: ${kp.difficulty}
描述: ${kp.description || ""}
相关错题: ${relatedQuestions}`;
      }).join("\n\n---\n\n");

      const userMessage = `学生选中的复习考点如下，请生成一套针对性专项练习试卷：\n\n${kpText}`;

      const response = await agentConfigs.resource.client.chat.completions.create({
        model: agentConfigs.resource.model,
        messages: [
          { role: "system", content: REVIEW_PAPER_GENERATE_PROMPT },
          { role: "user", content: userMessage }
        ],
        temperature: 0.5,
        max_tokens: 6144,
      });

      let content = response.choices[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      let parsed: any = { paperTitle: "专项复习试卷", questions: [] };

      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.warn("[WrongBook] Review paper generation JSON parse error:", e);
          return res.status(500).json({ error: "试卷生成结果解析失败，请重试" });
        }
      }

      // 确保questions数组中的每个question都有必要的字段
      if (parsed.questions && Array.isArray(parsed.questions)) {
        parsed.questions = parsed.questions.map((q: any, idx: number) => ({
          id: q.id || `rv-q${idx + 1}`,
          title: q.title || "",
          options: q.options || [],
          answer: typeof q.answer === "number" ? q.answer : 0,
          analysis: q.analysis || "",
          difficulty: q.difficulty || "中",
          knowledgePointId: q.knowledgePointId || "",
          knowledgePointName: q.knowledgePointName || "",
          type: "单选题",
          categoryId: "review",
        }));
      }

      res.json(parsed);
    } catch (e: any) {
      console.error("[WrongBook] Generate review paper failed:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // 端点3: 批改并生成学习总结
  app.post("/api/wrong-book/analyze-results", authMiddleware, async (req, res) => {
    try {
      const username = (req as any).username;
      const { answers, questions, selectedKnowledgePoints } = req.body;
      if (!answers || !questions || !Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ error: "答题数据不能为空" });
      }

      // 批改答案
      const gradingResults = questions.map((q: any, idx: number) => {
        const userAnswer = answers[q.id];
        const isCorrect = userAnswer !== undefined && userAnswer === q.answer;
        return {
          questionId: q.id,
          title: q.title,
          difficulty: q.difficulty,
          knowledgePointName: q.knowledgePointName || "",
          userAnswer: userAnswer !== undefined ? userAnswer : -1,
          correctAnswer: q.answer,
          isCorrect,
          analysis: q.analysis,
        };
      });

      const totalCount = gradingResults.length;
      const correctCount = gradingResults.filter((r: any) => r.isCorrect).length;
      const wrongCount = totalCount - correctCount;
      const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

      // 按考点统计
      const kpStats: Record<string, { total: number; correct: number; wrong: number }> = {};
      gradingResults.forEach((r: any) => {
        const kp = r.knowledgePointName || "未分类";
        if (!kpStats[kp]) kpStats[kp] = { total: 0, correct: 0, wrong: 0 };
        kpStats[kp].total++;
        if (r.isCorrect) kpStats[kp].correct++;
        else kpStats[kp].wrong++;
      });

      const weakKPs = Object.entries(kpStats)
        .filter(([_, stats]) => stats.wrong > 0)
        .map(([name, stats]) => ({
          name,
          total: stats.total,
          correct: stats.correct,
          wrong: stats.wrong,
          accuracy: Math.round((stats.correct / stats.total) * 100),
        }));

      // 构建基本信息，让LLM生成详细报告
      const wrongDetails = gradingResults
        .filter((r: any) => !r.isCorrect)
        .map((r: any, idx: number) =>
          `错题${idx + 1}: "${r.title}" | 考点: ${r.knowledgePointName} | 难度: ${r.difficulty} | 正确答案: ${String.fromCharCode(65 + r.correctAnswer)} | 用户答案: ${r.userAnswer >= 0 ? String.fromCharCode(65 + r.userAnswer) : "未作答"}`
        ).join("\n");

      const kpSummary = weakKPs.map(kp =>
        `${kp.name}: ${kp.wrong}/${kp.total}题答错，正确率${kp.accuracy}%`
      ).join("\n");

      const userMessage = `请根据以下复习测试结果生成学习总结：

总题数: ${totalCount} | 正确: ${correctCount} | 错误: ${wrongCount} | 正确率: ${accuracy}%

选中的复习考点: ${selectedKnowledgePoints?.map((kp: any) => kp.name).join("、") || "未指定"}

各考点表现:
${kpSummary}

错题详情:
${wrongDetails || "全部正确！"}`;

      const response = await agentConfigs.resource.client.chat.completions.create({
        model: agentConfigs.resource.model,
        messages: [
          { role: "system", content: RESULT_ANALYSIS_PROMPT },
          { role: "user", content: userMessage }
        ],
        temperature: 0.5,
        max_tokens: 4096,
      });

      let content = response.choices[0]?.message?.content || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      let parsedReport: any = {
        summaryReport: "",
        weakPointAnalysis: "",
        solutionApproaches: "",
        reviewSuggestions: "",
      };

      if (jsonMatch) {
        try {
          parsedReport = JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.warn("[WrongBook] Report JSON parse error, falling back to section parsing:", e);
          parsedReport = parseReportSections(content);
        }
      } else {
        // LLM 没按 JSON 格式输出，按 ## 标题拆分模块
        parsedReport = parseReportSections(content);
      }

      // 记录学习事件
      logUserAction(username, "wrong_book_review", `复习测试: ${totalCount}题, 正确率${accuracy}%`);

      res.json({
        grading: {
          totalCount,
          correctCount,
          wrongCount,
          accuracy,
          weakKPs,
          results: gradingResults,
        },
        report: parsedReport,
      });
    } catch (e: any) {
      console.error("[WrongBook] Analyze results failed:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ============= 复习历史记录 =============

  // 保存复习记录
  app.post("/api/review-history", authMiddleware, async (req, res) => {
    try {
      const username = (req as any).username;
      const { paperTitle, totalCount, correctCount, wrongCount, accuracy, questions, answers, grading, report, knowledgePoints } = req.body;

      const db = readDB();
      if (!db.users[username]) return res.status(404).json({ error: "用户不存在" });
      if (!db.users[username].reviewHistory) db.users[username].reviewHistory = [];

      const record = {
        id: "rh-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
        date: new Date().toISOString(),
        paperTitle: paperTitle || "专项复习",
        totalCount: totalCount || 0,
        correctCount: correctCount || 0,
        wrongCount: wrongCount || 0,
        accuracy: accuracy || 0,
        questions: questions || [],
        answers: answers || {},
        grading: grading || null,
        report: report || null,
        knowledgePoints: knowledgePoints || [],
      };

      db.users[username].reviewHistory.push(record);
      writeDB(db);

      // 同步到 MySQL
      if (mysqlAvailable) {
        mysqlSaveReviewRecord(username, record).catch(() => {});
      }

      console.log(`[ReviewHistory] Saved record ${record.id} for user "${username}"`);
      res.json({ success: true, id: record.id });
    } catch (e: any) {
      console.error("[ReviewHistory] Save failed:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // 获取复习记录列表
  app.get("/api/review-history", authMiddleware, async (req, res) => {
    try {
      const username = (req as any).username;
      // 优先从 MySQL 读取
      if (mysqlAvailable) {
        const mysqlHistory = await mysqlGetReviewHistory(username);
        if (mysqlHistory.length > 0) {
          const summary = mysqlHistory.map((r: any) => ({
            id: r.id, date: r.date, paperTitle: r.paperTitle,
            totalCount: r.totalCount, correctCount: r.correctCount,
            wrongCount: r.wrongCount, accuracy: r.accuracy,
            knowledgePoints: r.knowledgePoints?.map((kp: any) => kp.name) || [],
          })).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
          return res.json(summary);
        }
      }
      const db = readDB();
      const history = (db.users[username]?.reviewHistory || [])
        .map((r: any) => ({
          id: r.id, date: r.date, paperTitle: r.paperTitle,
          totalCount: r.totalCount, correctCount: r.correctCount,
          wrongCount: r.wrongCount, accuracy: r.accuracy,
          knowledgePoints: r.knowledgePoints?.map((kp: any) => kp.name) || [],
        }))
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      res.json(history);
    } catch (e: any) {
      console.error("[ReviewHistory] List failed:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // 获取单条复习记录详情
  app.get("/api/review-history/:id", authMiddleware, async (req, res) => {
    try {
      const username = (req as any).username;
      const db = readDB();
      const history = db.users[username]?.reviewHistory || [];
      const record = history.find((r: any) => r.id === req.params.id);
      if (!record) return res.status(404).json({ error: "记录不存在" });
      res.json(record);
    } catch (e: any) {
      console.error("[ReviewHistory] Get detail failed:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // 删除复习记录
  app.delete("/api/review-history/:id", authMiddleware, async (req, res) => {
    try {
      const username = (req as any).username;
      atomicDBUpdate((db) => {
        if (!db.users[username]) return;
        db.users[username].reviewHistory = (db.users[username].reviewHistory || []).filter(
          (r: any) => r.id !== req.params.id
        );
      });
      // 同步到 MySQL
      if (mysqlAvailable) {
        mysqlDeleteReviewRecord(username, req.params.id).catch(() => {});
      }
      res.json({ success: true });
    } catch (e: any) {
      console.error("[ReviewHistory] Delete failed:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // 批量删除复习记录
  app.delete("/api/review-history/batch", authMiddleware, async (req, res) => {
    try {
      const username = (req as any).username;
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids 不能为空" });
      }
      const idSet = new Set(ids);
      let deletedCount = 0;
      atomicDBUpdate((db) => {
        if (!db.users[username]) return;
        const before = (db.users[username].reviewHistory || []).length;
        db.users[username].reviewHistory = (db.users[username].reviewHistory || []).filter(
          (r: any) => !idSet.has(r.id)
        );
        deletedCount = before - db.users[username].reviewHistory.length;
      });
      // 同步到 MySQL
      if (mysqlAvailable) {
        for (const id of ids) {
          mysqlDeleteReviewRecord(username, id).catch(() => {});
        }
      }
      console.log(`[ReviewHistory] Batch deleted ${deletedCount} records for user "${username}"`);
      res.json({ success: true, deletedCount });
    } catch (e: any) {
      console.error("[ReviewHistory] Batch delete failed:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ============= 错题本持久化 =============

  // 获取错题本
  app.get("/api/wrong-book", authMiddleware, async (req, res) => {
    try {
      const username = (req as any).username;
      // 优先从 MySQL 读取
      if (mysqlAvailable) {
        const mysqlWB = await mysqlGetWrongBook(username);
        if (Object.keys(mysqlWB).length > 0) return res.json(mysqlWB);
      }
      const db = readDB();
      const wrongBook = db.users[username]?.wrongBook || {};
      res.json(wrongBook);
    } catch (e: any) {
      console.error("[WrongBook] Get failed:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // 保存/更新单道错题
  app.post("/api/wrong-book/save", authMiddleware, async (req, res) => {
    const username = (req as any).username;
    const { questionId, question, errCount } = req.body;
    console.log(`[WrongBook] 收到保存请求: user=${username} qId=${questionId} hasQ=${!!question}`);
    if (!questionId || !question) {
      console.log(`[WrongBook] 参数不完整，返回 400`);
      return res.status(400).json({ error: "参数不完整" });
    }
    try {
      atomicDBUpdate((db) => {
        if (!db.users[username]) db.users[username] = {};
        if (!db.users[username].wrongBook) db.users[username].wrongBook = {};
        db.users[username].wrongBook[questionId] = { q: question, errCount: errCount || 1 };
      });
      console.log(`[WrongBook] JSON 保存成功: user=${username}`);
      // 同步到 MySQL
      if (mysqlAvailable) {
        mysqlSaveWrongQuestion(username, questionId, question, errCount || 1)
          .then(ok => console.log(`[WrongBook] MySQL 保存: ${ok ? '成功' : '失败'}`))
          .catch(e => console.error(`[WrongBook] MySQL 异常:`, e.message));
      }
      res.json({ success: true });
    } catch (e: any) {
      console.error("[WrongBook] Save failed:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // 删除单道错题
  app.delete("/api/wrong-book/:questionId", authMiddleware, async (req, res) => {
    try {
      const username = (req as any).username;
      atomicDBUpdate((db) => {
        if (db.users[username]?.wrongBook) {
          delete db.users[username].wrongBook[req.params.questionId];
        }
      });
      // 同步到 MySQL
      if (mysqlAvailable) {
        mysqlDeleteWrongQuestion(username, req.params.questionId).catch(() => {});
      }
      res.json({ success: true });
    } catch (e: any) {
      console.error("[WrongBook] Delete failed:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ============= Spaced Repetition Flashcards =============
  app.get("/api/flashcards", authMiddleware, async (req, res) => {
    try {
      const username = (req as any).username;
      // 优先从 MySQL 读取
      if (mysqlAvailable) {
        const mysqlCards = await mysqlGetFlashcards(username);
        if (mysqlCards.length > 0) return res.json(mysqlCards);
      }
      const db = readDB();
      res.json(db.users[username]?.flashcards || []);
    } catch (e: any) {
      console.error("[Flashcards] Get failed:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/flashcards", authMiddleware, async (req, res) => {
    try {
      const username = (req as any).username;
      const { cards } = req.body;
      if (!cards || !Array.isArray(cards) || cards.length === 0) {
        return res.status(400).json({ error: "卡片数据不能为空" });
      }

      let addedCount = 0;
      atomicDBUpdate((db) => {
        if (!db.users[username]) return;
        if (!db.users[username].flashcards) db.users[username].flashcards = [];

        const existingIds = new Set(db.users[username].flashcards.map((c: any) => c.id));
        for (const card of cards) {
          if (!existingIds.has(card.id)) {
            db.users[username].flashcards.push(card);
            existingIds.add(card.id);
            addedCount++;
          }
        }

        if (addedCount > 0) {
          if (!db.users[username].notifications) db.users[username].notifications = [];
          db.users[username].notifications.push({
            id: "fc-" + Date.now(),
            type: "flashcard_created",
            message: `📇 已创建 ${addedCount} 张新闪卡`,
            timestamp: new Date().toISOString(),
            read: false,
          });
        }
      });

      // 同步到 MySQL
      if (mysqlAvailable && addedCount > 0) {
        mysqlSaveFlashcards(username, cards).catch(() => {});
      }

      broadcastProfileUpdate(username);
      res.json({ success: true });
    } catch (e: any) {
      console.error("[Flashcards] Save failed:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/flashcards/review", authMiddleware, async (req, res) => {
    try {
      const username = (req as any).username;
      const { cardId, quality } = req.body;
      if (!cardId || quality === undefined) return res.status(400).json({ error: "参数不完整" });

      atomicDBUpdate((db) => {
        if (!db.users[username]?.flashcards) return;
        const card = db.users[username].flashcards.find((c: any) => c.id === cardId);
        if (!card) return;

        const sm2 = card.sm2;
        sm2.lastReview = new Date().toISOString();

        if (quality >= 3) {
          sm2.repetitions++;
          if (sm2.repetitions === 1) sm2.interval = 1;
          else if (sm2.repetitions === 2) sm2.interval = 6;
          else sm2.interval = Math.round(sm2.interval * sm2.easeFactor);
        } else {
          sm2.repetitions = 0;
          sm2.interval = 0;
        }

        sm2.easeFactor = Math.max(1.3, sm2.easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

        if (sm2.interval > 0) {
          const next = new Date();
          next.setDate(next.getDate() + sm2.interval);
          sm2.nextReview = next.toISOString();
        } else {
          sm2.nextReview = new Date().toISOString();
        }

        if (!db.users[username].behavioralEvents) db.users[username].behavioralEvents = [];
        db.users[username].behavioralEvents.push({
          timestamp: new Date().toISOString(),
          eventType: "flashcard_review",
          payload: { cardId, quality },
        });
      });

      // 同步更新到 MySQL
      if (mysqlAvailable) {
        const db = readDB();
        const card = db.users[username]?.flashcards?.find((c: any) => c.id === cardId);
        if (card) mysqlUpdateFlashcard(username, cardId, card).catch(() => {});
      }

      broadcastProfileUpdate(username);
      res.json({ success: true });
    } catch (e: any) {
      console.error("[Flashcards] Review failed:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/flashcards/generate", authMiddleware, async (req, res) => {
    try {
      const username = (req as any).username;
      const { topic, content, count } = req.body;
      if (!topic) return res.status(400).json({ error: "主题不能为空" });

      const cardCount = Math.min(count || 10, 20);
      const db = readDB();
      const userData = db.users[username] || {};

      // ===== 1. Gather wrong-book data (错题本) =====
      const wrongBook = userData.wrongBook || {};
      const wrongEntries = Object.values(wrongBook) as any[];
      let wrongBookContext = "";
      if (wrongEntries.length > 0) {
        const wrongSummary = wrongEntries
          .slice(0, 10)
          .map((entry: any, i: number) => {
            const q = entry.q || {};
            return `${i + 1}. [${q.categoryId || "未分类"}] ${q.title || ""} — 错误${entry.errCount || 1}次`;
          })
          .join("\n");
        wrongBookContext = `\n## 学生错题本（薄弱环节）\n以下知识点学生反复出错，请重点生成这些方面的卡片：\n${wrongSummary}\n`;
      }

      // ===== 2. Gather chapter progress data (章节进度) =====
      const chapters = userData.chapterProgress?.chapters || [];
      let chapterContext = "";
      if (chapters.length > 0) {
        const inProgress = chapters.filter((c: any) => c.status === "current");
        const completed = chapters.filter((c: any) => c.status === "completed");
        chapterContext = `\n## 学生学习进度\n`;
        if (inProgress.length > 0) {
          chapterContext += `正在学习：${inProgress.map((c: any) => c.title).join("、")}\n`;
        }
        if (completed.length > 0) {
          chapterContext += `已完成：${completed.slice(0, 5).map((c: any) => c.title).join("、")}\n`;
        }
      }

      // ===== 3. Gather exercise accuracy from behavioral events =====
      const events: any[] = userData.behavioralEvents || [];
      const exerciseEvents = events.filter((e: any) => e.eventType === "exercise_answer");
      let accuracyContext = "";
      if (exerciseEvents.length > 0) {
        const byCategory: Record<string, { correct: number; total: number }> = {};
        for (const evt of exerciseEvents) {
          const cat = evt.payload?.categoryName || evt.payload?.categoryId || "未知";
          if (!byCategory[cat]) byCategory[cat] = { correct: 0, total: 0 };
          byCategory[cat].total++;
          if (evt.payload?.correct) byCategory[cat].correct++;
        }
        const weakCats = Object.entries(byCategory)
          .filter(([, v]) => v.total >= 3 && v.correct / v.total < 0.7)
          .sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total);

        if (weakCats.length > 0) {
          accuracyContext = `\n## 习题正确率分析\n以下知识点正确率偏低，需加强：\n`;
          for (const [cat, v] of weakCats.slice(0, 5)) {
            accuracyContext += `- ${cat}：正确率 ${Math.round((v.correct / v.total) * 100)}%（${v.correct}/${v.total}）\n`;
          }
        }
      }

      // ===== 4. Gather learning path (学习路径) =====
      const learningPath = userData.profile?.learningPath || [];
      let pathContext = "";
      if (learningPath.length > 0) {
        pathContext = `\n## 学习路径\n`;
        for (const phase of learningPath) {
          const items = (phase.items || []).join("、");
          pathContext += `- ${phase.title}（${phase.status === "completed" ? "已完成" : phase.status === "current" ? "进行中" : "待学习"}）：${items}\n`;
        }
      }

      // ===== Build comprehensive prompt =====
      const prompt = `你是一个闪卡生成专家。请根据学生的综合学习数据，生成${cardCount}张个性化知识闪卡。

## 学习主题
${topic}

## 参考文档内容
${content || "（无额外参考内容）"}
${wrongBookContext}
${chapterContext}
${accuracyContext}
${pathContext}

## 生成策略
1. 优先为错题本中的薄弱知识点生成闪卡（约占40%）
2. 为当前正在学习的章节生成闪卡（约占35%）
3. 为基础概念和进阶关联知识生成闪卡（约占25%）

## 输出要求
纯JSON，不要包裹：
{
  "cards": [
    {"front": "<概念问题>", "back": "<详细解释，可使用Markdown格式>"}
  ]
}

## 规则
1. 只输出纯JSON
2. 每张卡片正面是一个具体的问题或概念
3. 反面是详细的解释，至少50字
4. 内容用中文
5. 总共${cardCount}张卡片
6. 针对性：优先覆盖学生的薄弱点和当前学习内容`;

      const response = await agentConfigs.resource.client.chat.completions.create({
        model: agentConfigs.resource.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.6,
        max_tokens: 6144,
      });

      let content_text = response.choices[0]?.message?.content || "";
      const jsonMatch = content_text.match(/\{[\s\S]*\}/);
      let parsed: any = { cards: [] };

      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonrepair(jsonMatch[0]));
        } catch (e) {
          console.warn("[Flashcards] Generate JSON parse error:", e);
        }
      }

      logUserAction(username, "flashcard_generate", `生成闪卡: ${topic}`);
      res.json(parsed);
    } catch (e: any) {
      console.error("[Flashcards] Generate failed:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/flashcards/:id", authMiddleware, async (req, res) => {
    try {
      const username = (req as any).username;
      atomicDBUpdate((db) => {
        if (!db.users[username]?.flashcards) return;
        db.users[username].flashcards = db.users[username].flashcards.filter(
          (c: any) => c.id !== req.params.id
        );
      });
      // 同步到 MySQL
      if (mysqlAvailable) {
        mysqlDeleteFlashcard(username, req.params.id).catch(() => {});
      }
      res.json({ success: true });
    } catch (e: any) {
      console.error("[Flashcards] Delete failed:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ============= Pomodoro Timer =============
  app.post("/api/pomodoro-sessions", authMiddleware, async (req, res) => {
    try {
      const username = (req as any).username;
      const { duration, type, completed } = req.body;
      if (!duration || !type) return res.status(400).json({ error: "参数不完整" });

      const session = {
        id: "pomo-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
        date: new Date().toISOString().split("T")[0],
        startTime: new Date(new Date().getTime() - duration * 60000).toISOString(),
        endTime: new Date().toISOString(),
        duration,
        type,
        completed: completed !== false,
        interrupted: false,
      };

      atomicDBUpdate((db) => {
        if (!db.users[username]) return;
        if (!db.users[username].pomodoroSessions) db.users[username].pomodoroSessions = [];
        db.users[username].pomodoroSessions.push(session);

        if (!db.users[username].behavioralEvents) db.users[username].behavioralEvents = [];
        db.users[username].behavioralEvents.push({
          timestamp: new Date().toISOString(),
          eventType: "pomodoro_session",
          payload: { duration, type, completed: completed !== false },
        });

        if (db.users[username].pomodoroSessions.length > 500) {
          db.users[username].pomodoroSessions = db.users[username].pomodoroSessions.slice(-500);
        }
      });

      // 同步到 MySQL
      if (mysqlAvailable) {
        mysqlSavePomodoroSession(username, session).catch(() => {});
      }

      broadcastProfileUpdate(username);
      res.json({ success: true });
    } catch (e: any) {
      console.error("[Pomodoro] Save failed:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/pomodoro-sessions", authMiddleware, async (req, res) => {
    try {
      const username = (req as any).username;
      // 优先从 MySQL 读取
      if (mysqlAvailable) {
        const mysqlSessions = await mysqlGetPomodoroSessions(username);
        if (mysqlSessions.length > 0) return res.json(mysqlSessions);
      }
      const db = readDB();
      const sessions = db.users[username]?.pomodoroSessions || [];
      res.json(sessions);
    } catch (e: any) {
      console.error("[Pomodoro] Get failed:", e.message);
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

