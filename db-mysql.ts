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
      } catch (e: any) {
        // Ignore "Duplicate column name" error
      }
      
      try {
        await connection.execute(`ALTER TABLE users ADD INDEX idx_phone (phone)`);
      } catch (e: any) {
        // Ignore "Duplicate key name" error
      }

      console.log("[MySQL] Database tables initialized successfully");
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
} | null> {
  try {
    const [rows] = await pool.execute<any[]>(
      "SELECT username, password, phone FROM users WHERE username = ?",
      [username]
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      username: row.username,
      password: row.password,
      phone: row.phone || "",
    };
  } catch (e: any) {
    console.error("[MySQL] Error getting user:", e.message);
    return null;
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

export default pool;
