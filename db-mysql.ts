import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

// ============= MySQL Connection Pool =============
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "localhost",
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "intellilearn",
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
          birthday VARCHAR(50) DEFAULT '',
          primary_school VARCHAR(100) DEFAULT '',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_username (username)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
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
  birthday: string;
  primarySchool: string;
} | null> {
  try {
    const [rows] = await pool.execute<any[]>(
      "SELECT username, password, birthday, primary_school FROM users WHERE username = ?",
      [username]
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      username: row.username,
      password: row.password,
      birthday: row.birthday || "",
      primarySchool: row.primary_school || "",
    };
  } catch (e: any) {
    console.error("[MySQL] Error getting user:", e.message);
    return null;
  }
}

export async function mysqlCreateUser(
  username: string,
  password: string,
  birthday: string = "",
  primarySchool: string = ""
): Promise<boolean> {
  try {
    await pool.execute(
      "INSERT INTO users (username, password, birthday, primary_school) VALUES (?, ?, ?, ?)",
      [username, password, birthday, primarySchool]
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

export async function mysqlUpdatePassword(
  username: string,
  newPassword: string
): Promise<boolean> {
  try {
    const [result] = await pool.execute<any>(
      "UPDATE users SET password = ? WHERE username = ?",
      [newPassword, username]
    );
    return result.affectedRows > 0;
  } catch (e: any) {
    console.error("[MySQL] Error updating password:", e.message);
    return false;
  }
}

export async function mysqlVerifyUser(
  username: string,
  birthday: string,
  primarySchool: string
): Promise<boolean> {
  try {
    const [rows] = await pool.execute<any[]>(
      "SELECT id FROM users WHERE username = ? AND birthday = ? AND primary_school = ?",
      [username, birthday, primarySchool]
    );
    return rows.length > 0;
  } catch (e: any) {
    console.error("[MySQL] Error verifying user:", e.message);
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
