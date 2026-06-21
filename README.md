# 🎓 IntelliLearn Platform（智慧优学）

一个现代化的 AI 驱动学习平台，提供智能问答、个性化学习路径、学习资源生成和多维度学习分析。

## ✨ 功能特性

- **🤖 智能问答助手** — 通过自然对话了解学生背景，提供学习指导
- **👨‍🏫 AI 导师辅导** — 苏格拉底式教学法，引导学生自主思考
- **📚 学习资源生成** — 自动生成知识点文档、思维导图、练习题、代码示例
- **🗺️ 个性化学习路径** — 根据学生画像定制三阶段学习计划
- **📊 学习画像分析** — 六维能力模型评估（知识基础、认知风格、易错领域等）
- **📅 学习日历 & 趋势** — 可视化学习活跃度、每日学习时长、连续学习天数
- **📖 章节进度追踪** — 自动检测习题/文档/代码完成情况，解锁下一阶段
- **🔔 实时推送** — SSE 实时同步学习画像、进度和通知
- **🔐 用户认证** — 注册、登录、密码重置，支持 MySQL + JSON 双存储

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19, TypeScript, Vite, Tailwind CSS |
| 可视化 | Recharts, ECharts |
| 图标 | Lucide React |
| 后端 | Express.js (Node.js) |
| 数据库 | MySQL (mysql2)，JSON 文件回退 |
| AI | DeepSeek / 讯飞星火（OpenAI 兼容接口） |
| 构建 | Vite + esbuild |

## 📁 项目结构

```
intellilearn-platform-sql/
├── src/                      # 前端源码
│   ├── components/           # React 组件
│   │   ├── Layout.tsx        # 页面布局（导航栏、侧边栏）
│   │   └── resources/        # 学习资源模块组件
│   │       ├── CodeModule.tsx
│   │       ├── DocumentModule.tsx
│   │       ├── ExerciseModule.tsx
│   │       ├── ExtendedModule.tsx
│   │       └── MindmapModule.tsx
│   ├── lib/
│   │   └── utils.ts          # 工具函数
│   ├── pages/
│   │   ├── Auth.tsx          # 登录/注册/忘记密码
│   │   ├── Home.tsx          # 主页（聊天、画像分析）
│   │   ├── Profile.tsx       # 个人中心
│   │   └── Resources.tsx     # 学习资源页
│   ├── index.css             # 全局样式
│   └── main.tsx              # 入口
├── server.ts                 # Express 后端（API 路由、LLM 调用、数据库）
├── db-mysql.ts               # MySQL 数据库操作层
├── package.json              # 依赖和脚本
├── tsconfig.json             # TypeScript 配置
├── vite.config.ts            # Vite 配置
└── .env.example              # 环境变量模板
```

## 🚀 快速开始

### 前置要求

- Node.js 18+
- MySQL 8.0+（可选，无 MySQL 时使用 JSON 文件存储）

### 1. 克隆项目

```bash
git clone <your-repo-url>
cd intellilearn-platform-sql
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
```

然后编辑 `.env` 文件，填入你的配置：

```env
# MySQL 数据库
MYSQL_HOST="localhost"
MYSQL_PORT=3306
MYSQL_USER="root"
MYSQL_PASSWORD="your_password"
MYSQL_DATABASE="intellilearn"

# LLM 提供商：deepseek 或 spark
LLM_PROVIDER="deepseek"

# DeepSeek API
DEEPSEEK_API_KEY="your_deepseek_api_key"
DEEPSEEK_MODEL="deepseek-chat"

# 或者使用讯飞星火
# SPARK_API_KEY="your_spark_api_key"
# SPARK_BASE_URL="https://spark-api-open.xf-yun.com/v1"
# SPARK_MODEL="4.0Ultra"
```

> ⚠️ **注意**：`.env` 文件包含敏感信息，已在 `.gitignore` 中排除，**请勿提交到 Git**。

### 4. 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:3000` 即可使用。

### 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm start` | 启动生产服务器 |
| `npm run lint` | TypeScript 类型检查 |
| `npm run clean` | 清理构建产物 |

## 🔧 环境变量说明

| 变量 | 必填 | 说明 |
|------|------|------|
| `MYSQL_HOST` | 否 | MySQL 服务器地址 |
| `MYSQL_PORT` | 否 | MySQL 端口（默认 3306） |
| `MYSQL_USER` | 否 | MySQL 用户名 |
| `MYSQL_PASSWORD` | 否 | MySQL 密码 |
| `MYSQL_DATABASE` | 否 | 数据库名 |
| `LLM_PROVIDER` | 是 | LLM 提供商：`deepseek` 或 `spark` |
| `DEEPSEEK_API_KEY` | 条件 | DeepSeek API 密钥 |
| `DEEPSEEK_MODEL` | 否 | DeepSeek 模型（默认 `deepseek-chat`） |
| `SPARK_API_KEY` | 条件 | 讯飞星火 API 密钥 |
| `SPARK_MODEL` | 否 | 星火模型 |
| `PORT` | 否 | 服务端口（默认 3000） |
| `NODE_ENV` | 否 | `production` 启用生产模式 |

## 🗄️ 数据库

优先使用 MySQL，连接失败时自动回退到本地 `db.json` 文件存储。

MySQL 启动时会自动创建 `users` 表。无需手动建表。

## 📄 License

MIT
