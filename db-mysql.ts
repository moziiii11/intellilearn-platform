import mysql from "mysql2/promise";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";

dotenv.config();

// ============= MySQL Connection Pool =============
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "localhost",
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "www_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4",
  enableKeepAlive: true,        // TCP 心跳保活
  keepAliveInitialDelay: 10000, // 每 10 秒发一次心跳
  connectTimeout: 10000,        // 连接超时 10 秒
});

// 连接池错误处理：自动清理断开的连接
pool.on("error", (err: any) => {
  if (err.code === "ECONNRESET" || err.code === "PROTOCOL_CONNECTION_LOST") {
    console.log("[MySQL] 连接已断开，连接池将自动重建");
  }
});

// ============= Initialize Database Tables =============
export async function initMySQLDB(): Promise<boolean> {
  try {
    const connection = await pool.getConnection();
    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(100) NOT NULL UNIQUE,
          password VARCHAR(255) NOT NULL,
          phone VARCHAR(20) DEFAULT '',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_username (username),
          INDEX idx_phone (phone)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      
      // Attempt to add phone column if it was created before this update
      try {
        await connection.execute(`ALTER TABLE users ADD COLUMN phone VARCHAR(20) DEFAULT ''`);
      } catch (e: any) { /* Ignore "Duplicate column name" */ }

      try {
        await connection.execute(`ALTER TABLE users ADD INDEX idx_phone (phone)`);
      } catch (e: any) { /* Ignore "Duplicate key name" */ }

      // 添加 role 字段（admin / user）
      try {
        await connection.execute(`ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user'`);
      } catch (e: any) { /* Ignore duplicate */ }

      // ===== 学习数据表（从 JSON 迁移到 MySQL）=====

      // 1. 用户画像表 — 替代 db.json 中 users[username].profile
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS user_profile (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(100) NOT NULL UNIQUE,
          profile_data JSON NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_profile_username (username),
          FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // 2. 聊天记录表
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS chats (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(100) NOT NULL,
          chat_data JSON NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_chats_username (username),
          FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // 3. 收藏夹表
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS favorites (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(100) NOT NULL UNIQUE,
          fav_data JSON NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_fav_username (username),
          FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // 4. 学习行为事件表 — 替代 db.json 中 users[username].behavioralEvents
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS learning_events (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(100) NOT NULL,
          event_type VARCHAR(50) NOT NULL,
          payload JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_events_username (username),
          INDEX idx_events_type (event_type),
          INDEX idx_events_time (created_at),
          FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // 5. 错题本表
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS wrong_book (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(100) NOT NULL,
          question_id VARCHAR(100) NOT NULL,
          question_data JSON NOT NULL,
          err_count INT DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uk_user_question (username, question_id),
          INDEX idx_wrong_username (username),
          FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // 6. 闪卡表
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS flashcards (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(100) NOT NULL,
          card_id VARCHAR(100) NOT NULL,
          card_data JSON NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_user_card (username, card_id),
          INDEX idx_flash_username (username),
          FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // 7. 番茄钟记录表
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS pomodoro_sessions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(100) NOT NULL,
          session_data JSON NOT NULL,
          session_date DATE NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_pomo_username (username),
          INDEX idx_pomo_date (session_date),
          FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // 8. 章节进度表
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS chapter_progress (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(100) NOT NULL UNIQUE,
          progress_data JSON NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_chapter_username (username),
          FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // 9. 复习历史表
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS review_history (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(100) NOT NULL,
          record_id VARCHAR(100) NOT NULL,
          record_data JSON NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_review_record (username, record_id),
          INDEX idx_review_username (username),
          FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      console.log("[MySQL] Database tables initialized successfully (13 tables)");

      // 确保至少有一个管理员：如果没有任何 admin，把最早注册的用户升为管理员
      try {
        const [adminRows] = await connection.execute<any[]>(
          "SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'"
        );
        if ((adminRows[0] as any).cnt === 0) {
          await connection.execute(
            "UPDATE users SET role = 'admin' WHERE id = (SELECT MIN(id) FROM (SELECT id FROM users) AS t) AND role != 'admin' LIMIT 1"
          );
          console.log("[MySQL] 🛡️  自动设置首位用户为管理员");
        }
      } catch (e: any) {
        // 忽略错误（admin 列可能还不存在等）
      }

      return true;
    } finally {
      connection.release();
    }
  } catch (e: any) {
    console.error("[MySQL] Failed to initialize database:", e.message);
    console.error("[MySQL] Falling back to JSON file storage for auth");
    return false;
  }
}

// ============= User CRUD Operations =============

export async function mysqlGetUser(username: string): Promise<{
  username: string;
  password: string;
  phone: string;
  role: string;
} | null> {
  try {
    const [rows] = await pool.execute<any[]>(
      "SELECT username, password, phone, role FROM users WHERE username = ?",
      [username]
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      username: row.username,
      password: row.password,
      phone: row.phone || "",
      role: row.role || "user",
    };
  } catch (e: any) {
    console.error("[MySQL] Error getting user:", e.message);
    return null;
  }
}

// ============= 管理员相关 =============

export async function mysqlGetAllUsers(): Promise<any[]> {
  try {
    const [rows] = await pool.execute<any[]>(
      "SELECT username, phone, role, created_at FROM users ORDER BY created_at DESC"
    );
    return rows;
  } catch (e: any) {
    console.error("[MySQL] Get all users error:", e.message);
    return [];
  }
}

export async function mysqlSetUserRole(username: string, role: string): Promise<boolean> {
  try {
    await pool.execute(
      "UPDATE users SET role = ? WHERE username = ?",
      [role, username]
    );
    return true;
  } catch (e: any) {
    console.error("[MySQL] Set user role error:", e.message);
    return false;
  }
}

export async function mysqlGetAdminStats(): Promise<any> {
  try {
    // 全部用 pool.query，统一返回 [rows, fields]
    const [totalUsersR] = await pool.query<any[]>("SELECT COUNT(*) as cnt FROM users");
    const [events7dR] = await pool.query<any[]>(
      "SELECT COUNT(*) as cnt FROM learning_events WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"
    );
    const [eventsTodayR] = await pool.query<any[]>(
      "SELECT COUNT(*) as cnt FROM learning_events WHERE DATE(created_at) = CURDATE()"
    );
    // 统计有实际消息的对话条数
    const [totalChatsR] = await pool.query<any[]>(
      "SELECT COALESCE(SUM(JSON_LENGTH(chat_data)), 0) as cnt FROM chats WHERE JSON_LENGTH(chat_data) > 0"
    );
    const [totalCardsR] = await pool.query<any[]>("SELECT COUNT(*) as cnt FROM flashcards");
    const [totalWrongR] = await pool.query<any[]>("SELECT COUNT(*) as cnt FROM wrong_book");
    const [totalReviewsR] = await pool.query<any[]>("SELECT COUNT(*) as cnt FROM review_history");
    const [dailyEvents] = await pool.query<any[]>(
      "SELECT DATE(created_at) as date, COUNT(*) as count FROM learning_events WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY DATE(created_at) ORDER BY date"
    );
    const [eventTypes] = await pool.query<any[]>(
      "SELECT event_type, COUNT(*) as count FROM learning_events GROUP BY event_type ORDER BY count DESC"
    );
    const [avgAccuracyR] = await pool.query<any[]>(
      "SELECT COALESCE(AVG(CAST(JSON_EXTRACT(record_data, '$.accuracy') AS UNSIGNED)), 0) as cnt FROM review_history"
    );

    return {
      totalUsers: totalUsersR[0]?.cnt || 0,
      eventsLast7Days: events7dR[0]?.cnt || 0,
      eventsToday: eventsTodayR[0]?.cnt || 0,
      totalChats: totalChatsR[0]?.cnt || 0,
      totalCards: totalCardsR[0]?.cnt || 0,
      totalWrong: totalWrongR[0]?.cnt || 0,
      totalReviews: totalReviewsR[0]?.cnt || 0,
      avgAccuracy: Math.round(avgAccuracyR[0]?.cnt || 0),
      dailyEvents: dailyEvents || [],
      eventTypes: eventTypes || [],
    };
  } catch (e: any) {
    console.error("[MySQL] Get admin stats error:", e.message);
    return {};
  }
}

export async function mysqlCreateUser(
  username: string,
  password: string,
  phone: string = ""
): Promise<boolean> {
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.execute(
      "INSERT INTO users (username, password, phone) VALUES (?, ?, ?)",
      [username, hashedPassword, phone]
    );
    console.log(`[MySQL] User created: ${username}`);
    return true;
  } catch (e: any) {
    if (e.code === "ER_DUP_ENTRY") {
      console.log(`[MySQL] User already exists: ${username}`);
      return false;
    }
    console.error("[MySQL] Error creating user:", e.message);
    return false;
  }
}

export async function mysqlUpdatePasswordByPhone(
  phone: string,
  newPassword: string
): Promise<{ success: boolean; username?: string }> {
  try {
    // Note: If multiple users have the same phone, this updates all or just the first matched
    // Usually phone is unique, but we didn't add unique constraint for phone
    const [rows] = await pool.execute<any[]>("SELECT username FROM users WHERE phone = ? LIMIT 1", [phone]);
    if (rows.length === 0) return { success: false };
    const username = rows[0].username;

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const [result] = await pool.execute<any>(
      "UPDATE users SET password = ? WHERE phone = ?",
      [hashedPassword, phone]
    );
    return { success: result.affectedRows > 0, username };
  } catch (e: any) {
    console.error("[MySQL] Error updating password by phone:", e.message);
    return { success: false };
  }
}

export async function mysqlVerifyUser(
  username: string,
  phone: string
): Promise<boolean> {
  try {
    const [rows] = await pool.execute<any[]>(
      "SELECT id FROM users WHERE username = ? AND phone = ?",
      [username, phone]
    );
    return rows.length > 0;
  } catch (e: any) {
    console.error("[MySQL] Error verifying user by username and phone:", e.message);
    return false;
  }
}

export async function mysqlVerifyUserByPhone(
  phone: string
): Promise<boolean> {
  try {
    const [rows] = await pool.execute<any[]>(
      "SELECT id FROM users WHERE phone = ?",
      [phone]
    );
    return rows.length > 0;
  } catch (e: any) {
    console.error("[MySQL] Error verifying user by phone:", e.message);
    return false;
  }
}

export async function mysqlVerifyPassword(
  plainPassword: string,
  hashedPassword: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(plainPassword, hashedPassword);
  } catch (e: any) {
    console.error("[MySQL] Error verifying password:", e.message);
    return false;
  }
}

// ============= Health Check =============
export async function mysqlPing(): Promise<boolean> {
  try {
    const connection = await pool.getConnection();
    connection.release();
    return true;
  } catch {
    return false;
  }
}

// ============= 用户画像 CRUD =============
export async function mysqlGetProfile(username: string): Promise<any | null> {
  try {
    const [rows] = await pool.query<any[]>(
      "SELECT profile_data FROM user_profile WHERE username = ?",
      [username]
    );
    if (rows.length === 0) return null;
    const raw = rows[0].profile_data;
    // mysql2 的 query() 通常自动解析 JSON，但以防万一
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e: any) {
    console.error("[MySQL] Get profile error:", e.message);
    return null;
  }
}

export async function mysqlSaveProfile(username: string, profile: any): Promise<boolean> {
  try {
    await pool.execute(
      "INSERT INTO user_profile (username, profile_data) VALUES (?, ?) ON DUPLICATE KEY UPDATE profile_data = VALUES(profile_data)",
      [username, JSON.stringify(profile)]
    );
    return true;
  } catch (e: any) {
    console.error("[MySQL] Save profile error:", e.message);
    return false;
  }
}

// ============= 聊天记录 CRUD =============
export async function mysqlGetChats(username: string): Promise<any[] | null> {
  try {
    const [rows] = await pool.execute<any[]>(
      "SELECT chat_data FROM chats WHERE username = ?",
      [username]
    );
    if (rows.length === 0) return null;
    return rows[0].chat_data;
  } catch (e: any) {
    console.error("[MySQL] Get chats error:", e.message);
    return null;
  }
}

export async function mysqlSaveChats(username: string, chats: any[]): Promise<boolean> {
  // 过滤空对话 + 去重（按 id）
  const valid = chats.filter(c => c.messages && c.messages.length > 0);
  const seen = new Set();
  const unique = valid.filter(c => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
  try {
    await pool.execute(
      "INSERT INTO chats (username, chat_data) VALUES (?, ?) ON DUPLICATE KEY UPDATE chat_data = VALUES(chat_data), updated_at = CURRENT_TIMESTAMP",
      [username, JSON.stringify(unique)]
    );
    return true;
  } catch (e: any) {
    console.error("[MySQL] Save chats error:", e.message);
    return false;
  }
}

// ============= 收藏夹 CRUD =============
export async function mysqlGetFavorites(username: string): Promise<any | null> {
  try {
    const [rows] = await pool.execute<any[]>(
      "SELECT fav_data FROM favorites WHERE username = ?",
      [username]
    );
    if (rows.length === 0) return null;
    return rows[0].fav_data;
  } catch (e: any) {
    console.error("[MySQL] Get favorites error:", e.message);
    return null;
  }
}

export async function mysqlSaveFavorites(username: string, favData: any): Promise<boolean> {
  try {
    await pool.execute(
      "INSERT INTO favorites (username, fav_data) VALUES (?, ?) ON DUPLICATE KEY UPDATE fav_data = VALUES(fav_data), updated_at = CURRENT_TIMESTAMP",
      [username, JSON.stringify(favData)]
    );
    return true;
  } catch (e: any) {
    console.error("[MySQL] Save favorites error:", e.message);
    return false;
  }
}

// ============= 学习行为事件 CRUD =============
export async function mysqlGetEvents(username: string, limit = 500): Promise<any[]> {
  try {
    const [rows] = await pool.query<any[]>(
      "SELECT event_type, payload, created_at as timestamp FROM learning_events WHERE username = ? ORDER BY created_at DESC LIMIT ?",
      [username, limit]
    );
    return rows.reverse().map(r => ({
      eventType: r.event_type,
      payload: r.payload,
      // MySQL TIMESTAMP 可能返回 Date 对象，统一转 ISO 字符串
      timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
    }));
  } catch (e: any) {
    console.error("[MySQL] Get events error:", e.message);
    return [];
  }
}

export async function mysqlInsertEvents(
  username: string,
  events: { eventType: string; payload: any; timestamp: string }[]
): Promise<boolean> {
  if (events.length === 0) return true;
  try {
    for (const e of events) {
      // 把 ISO 8601 (2026-06-22T09:44:35.094Z) 转成 MySQL DATETIME 格式
      const mysqlTime = new Date(e.timestamp).toISOString().slice(0, 19).replace("T", " ");
      await pool.query(
        "INSERT INTO learning_events (username, event_type, payload, created_at) VALUES (?, ?, ?, ?)",
        [username, e.eventType, JSON.stringify(e.payload), mysqlTime]
      );
    }
    // 限制每个用户最多保留 500 条
    await pool.query(
      `DELETE FROM learning_events WHERE username = ? AND id NOT IN (SELECT id FROM (SELECT id FROM learning_events WHERE username = ? ORDER BY created_at DESC LIMIT 500) AS tmp)`,
      [username, username]
    );
    return true;
  } catch (e: any) {
    console.error("[MySQL] Insert events error:", e.message);
    return false;
  }
}

// ============= 错题本 CRUD =============
export async function mysqlGetWrongBook(username: string): Promise<Record<string, any>> {
  try {
    const [rows] = await pool.execute<any[]>(
      "SELECT question_id, question_data, err_count FROM wrong_book WHERE username = ?",
      [username]
    );
    const result: Record<string, any> = {};
    for (const row of rows) {
      result[row.question_id] = { q: row.question_data, errCount: row.err_count };
    }
    return result;
  } catch (e: any) {
    console.error("[MySQL] Get wrong book error:", e.message);
    return {};
  }
}

export async function mysqlSaveWrongQuestion(
  username: string, questionId: string, questionData: any, errCount: number
): Promise<boolean> {
  try {
    await pool.execute(
      "INSERT INTO wrong_book (username, question_id, question_data, err_count) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE question_data = VALUES(question_data), err_count = VALUES(err_count), updated_at = CURRENT_TIMESTAMP",
      [username, questionId, JSON.stringify(questionData), errCount]
    );
    return true;
  } catch (e: any) {
    console.error("[MySQL] Save wrong question error:", e.message);
    return false;
  }
}

export async function mysqlDeleteWrongQuestion(username: string, questionId: string): Promise<boolean> {
  try {
    await pool.execute(
      "DELETE FROM wrong_book WHERE username = ? AND question_id = ?",
      [username, questionId]
    );
    return true;
  } catch (e: any) {
    console.error("[MySQL] Delete wrong question error:", e.message);
    return false;
  }
}

// ============= 闪卡 CRUD =============
export async function mysqlGetFlashcards(username: string): Promise<any[]> {
  try {
    const [rows] = await pool.execute<any[]>(
      "SELECT card_data FROM flashcards WHERE username = ?",
      [username]
    );
    return rows.map(r => r.card_data);
  } catch (e: any) {
    console.error("[MySQL] Get flashcards error:", e.message);
    return [];
  }
}

export async function mysqlSaveFlashcards(username: string, cards: any[]): Promise<number> {
  if (cards.length === 0) return 0;
  let addedCount = 0;
  try {
    for (const card of cards) {
      const [result] = await pool.execute<any>(
        "INSERT INTO flashcards (username, card_id, card_data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE card_data = VALUES(card_data)",
        [username, card.id, JSON.stringify(card)]
      );
      if (result.affectedRows === 1) addedCount++; // 只有新插入的才算
    }
    return addedCount;
  } catch (e: any) {
    console.error("[MySQL] Save flashcards error:", e.message);
    return 0;
  }
}

export async function mysqlUpdateFlashcard(username: string, cardId: string, cardData: any): Promise<boolean> {
  try {
    await pool.execute(
      "UPDATE flashcards SET card_data = ? WHERE username = ? AND card_id = ?",
      [JSON.stringify(cardData), username, cardId]
    );
    return true;
  } catch (e: any) {
    console.error("[MySQL] Update flashcard error:", e.message);
    return false;
  }
}

export async function mysqlDeleteFlashcard(username: string, cardId: string): Promise<boolean> {
  try {
    await pool.execute(
      "DELETE FROM flashcards WHERE username = ? AND card_id = ?",
      [username, cardId]
    );
    return true;
  } catch (e: any) {
    console.error("[MySQL] Delete flashcard error:", e.message);
    return false;
  }
}

// ============= 番茄钟记录 CRUD =============
export async function mysqlGetPomodoroSessions(username: string): Promise<any[]> {
  try {
    const [rows] = await pool.execute<any[]>(
      "SELECT session_data FROM pomodoro_sessions WHERE username = ? ORDER BY created_at DESC LIMIT 500",
      [username]
    );
    return rows.map(r => r.session_data);
  } catch (e: any) {
    console.error("[MySQL] Get pomodoro error:", e.message);
    return [];
  }
}

export async function mysqlSavePomodoroSession(username: string, session: any): Promise<boolean> {
  try {
    await pool.execute(
      "INSERT INTO pomodoro_sessions (username, session_data, session_date) VALUES (?, ?, ?)",
      [username, JSON.stringify(session), session.date || new Date().toISOString().split("T")[0]]
    );
    // 限制 500 条
    await pool.execute(
      `DELETE FROM pomodoro_sessions WHERE username = ? AND id NOT IN (SELECT id FROM (SELECT id FROM pomodoro_sessions WHERE username = ? ORDER BY created_at DESC LIMIT 500) AS tmp)`,
      [username, username]
    );
    return true;
  } catch (e: any) {
    console.error("[MySQL] Save pomodoro error:", e.message);
    return false;
  }
}

// ============= 章节进度 CRUD =============
export async function mysqlGetChapterProgress(username: string): Promise<any | null> {
  try {
    const [rows] = await pool.execute<any[]>(
      "SELECT progress_data FROM chapter_progress WHERE username = ?",
      [username]
    );
    if (rows.length === 0) return null;
    return rows[0].progress_data;
  } catch (e: any) {
    console.error("[MySQL] Get chapter progress error:", e.message);
    return null;
  }
}

export async function mysqlSaveChapterProgress(username: string, progress: any): Promise<boolean> {
  try {
    await pool.execute(
      "INSERT INTO chapter_progress (username, progress_data) VALUES (?, ?) ON DUPLICATE KEY UPDATE progress_data = VALUES(progress_data), updated_at = CURRENT_TIMESTAMP",
      [username, JSON.stringify(progress)]
    );
    return true;
  } catch (e: any) {
    console.error("[MySQL] Save chapter progress error:", e.message);
    return false;
  }
}

// ============= 复习历史 CRUD =============
export async function mysqlGetReviewHistory(username: string): Promise<any[]> {
  try {
    const [rows] = await pool.execute<any[]>(
      "SELECT record_data FROM review_history WHERE username = ? ORDER BY created_at DESC",
      [username]
    );
    return rows.map(r => r.record_data);
  } catch (e: any) {
    console.error("[MySQL] Get review history error:", e.message);
    return [];
  }
}

export async function mysqlSaveReviewRecord(username: string, record: any): Promise<boolean> {
  try {
    await pool.execute(
      "INSERT INTO review_history (username, record_id, record_data) VALUES (?, ?, ?)",
      [username, record.id, JSON.stringify(record)]
    );
    return true;
  } catch (e: any) {
    console.error("[MySQL] Save review record error:", e.message);
    return false;
  }
}

export async function mysqlDeleteReviewRecord(username: string, recordId: string): Promise<boolean> {
  try {
    await pool.execute(
      "DELETE FROM review_history WHERE username = ? AND record_id = ?",
      [username, recordId]
    );
    return true;
  } catch (e: any) {
    console.error("[MySQL] Delete review record error:", e.message);
    return false;
  }
}

// ============= 批量获取用户所有数据（用于 JSON → MySQL 迁移）=============
export async function mysqlGetAllUserData(username: string): Promise<any> {
  const [profile, chats, favorites, events, wrongBook, flashcards, pomodoro, chapterProgress, reviewHistory] =
    await Promise.all([
      mysqlGetProfile(username),
      mysqlGetChats(username),
      mysqlGetFavorites(username),
      mysqlGetEvents(username),
      mysqlGetWrongBook(username),
      mysqlGetFlashcards(username),
      mysqlGetPomodoroSessions(username),
      mysqlGetChapterProgress(username),
      mysqlGetReviewHistory(username),
    ]);

  return {
    profile,
    chats: chats || [],
    favorites: favorites || { favorites: [], folders: ["全部收藏", "默认分类"] },
    behavioralEvents: events,
    wrongBook,
    flashcards,
    pomodoroSessions: pomodoro,
    chapterProgress: chapterProgress || { chapters: [] },
    reviewHistory,
  };
}

export default pool;
