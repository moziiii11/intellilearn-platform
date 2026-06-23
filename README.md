# 🎓 IntelliLearn Platform（智慧优学）

一个现代化的 AI 驱动学习平台，提供智能问答、个性化学习路径、学习资源生成和多维度学习分析。

## ✨ 功能特性

- **🤖 AI 主动问候** — 新用户登录后 AI 自动发起对话，了解学习阶段和需求
- **🧠 智能问答助手** — 通过自然对话了解学生背景，提供学习指导
- **👨‍🏫 AI 导师辅导** — 苏格拉底式教学法，引导学生自主思考
- **📚 学习资源生成** — 自动生成知识点文档、思维导图、练习题、代码示例
- **📝 LaTeX 公式渲染** — 全平台 Markdown 支持数学公式（$...$ / $$...$$），KaTeX 渲染
- **🔗 拓展学习推荐** — AI 推荐公开题库（LeetCode/牛客网等）、视频教程（B站）、拓展阅读（知乎/CSDN）
- **🔄 实践项目轮换** — 9 套分级项目模板，一键换一换，附带参考来源
- **🗺️ 个性化学习路径** — 根据学生画像定制三阶段学习计划（基于首次对话生成）
- **📊 学习画像分析** — 六维能力模型评估（知识基础、认知风格、易错领域等）
- **📅 学习日历 & 趋势** — 可视化学习活跃度、每日学习时长、连续学习天数
- **📖 章节进度追踪** — 自动检测习题/文档/代码完成情况，解锁下一阶段
- **🔔 实时推送** — SSE 实时同步学习画像、进度和通知
- **🔐 用户认证** — 注册、登录、密码重置，手机号校验，bcrypt 加密，MySQL + JSON 双存储

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19, TypeScript, Vite, Tailwind CSS |
| Markdown | react-markdown, remark-gfm, remark-math, rehype-katex, KaTeX |
| 可视化 | Recharts, ECharts |
| 图标 | Lucide React |
| 后端 | Express.js (Node.js), bcryptjs |
| 数据库 | MySQL (mysql2)，JSON 文件回退 |
| AI | DeepSeek / 讯飞星火（OpenAI 兼容接口） |
| 构建 | Vite + esbuild |

## 📁 项目结构

```
intellilearn-platform/
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
│   │   ├── Home.tsx          # 主页（AI 问答、历史记录、用户画像）
│   │   ├── Profile.tsx       # 个人中心（学情看板、打卡日历、收藏夹）
│   │   └── Resources.tsx     # 学习资源页（课程文档、习题、拓展材料）
│   ├── UserContext.tsx       # 全局状态管理（用户、聊天、收藏、SSE）
│   ├── App.tsx               # 路由配置
│   ├── index.css             # 全局样式
│   └── main.tsx              # 应用入口
├── server.ts                 # Express 后端（API 路由、LLM 调用、数据库）
├── db-mysql.ts               # MySQL 数据库操作层
├── index.html                # HTML 入口
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
DEEPSEEK_MODEL="deepseek-v4-pro"

# 或者使用讯飞星火
# SPARK_API_KEY="your_spark_api_key"
# SPARK_BASE_URL="https://spark-api-open.xf-yun.com/v1"
# SPARK_MODEL="4.0Ultra"
```

> ⚠️ **注意**：`.env` 文件包含敏感信息，已在 `.gitignore` 中排除。

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
| `DEEPSEEK_MODEL` | 否 | DeepSeek 模型（默认 `deepseek-v4-pro`） |
| `SPARK_API_KEY` | 条件 | 讯飞星火 API 密钥 |
| `SPARK_MODEL` | 否 | 星火模型 |
| `PORT` | 否 | 服务端口（默认 3000） |
| `NODE_ENV` | 否 | `production` 启用生产模式 |

## 🗄️ 数据库

优先使用 MySQL，连接失败时自动回退到本地 `db.json` 文件存储。

MySQL 启动时会自动创建 `users` 表。无需手动建表。

## 📄 License

MIT


## 更新日志

### 2026.06.22

**🔐 注册登录重构**
- 密码加密：接入 `bcryptjs`，所有密码哈希存储
- 手机号校验：注册时前端+后端双重 11 位数字校验
- 忘记密码流程：支持手机号验证后重置密码
- 数据库整合：接入 MySQL `www_db`，MySQL 故障时自动回退 JSON 文件存储
- 新增 `.env`，MySQL 连接参数集中配置

**🎨 界面优化**
- 应用标题改为「智慧优学」
- 登录/注册页全面改版：渐入动画、毛玻璃卡片、密码显示切换、注册成功弹窗
- 课程文档模块：Markdown 渲染优化，新增文本高亮和笔记功能
- 拓展材料弹窗重做：视频教程播放器、拓展阅读弹窗、实践项目弹窗
- 习题模块 UI 升级：答题反馈和解析展示优化

**📂 收藏夹系统**
- 个人中心新增收藏夹侧抽屉，支持搜索、分类筛选、分页
- 拓展材料支持收藏（拓展阅读 + 实践项目）
- 收藏数据持久化到服务端，跨设备同步

### 2026.06.23

**🐛 Bug 修复**
- **数据隔离（Critical）**：修复注册新账号后继承原账号聊天记录和收藏的问题
- **新用户画像标签**：修复新注册用户出现默认画像标签的问题，现在首次对话后才生成
- **收藏状态重置**：修复拓展材料弹窗收藏后关闭再打开状态丢失的 bug

**🚀 性能优化**
- **拓展材料加速**：`max_tokens` 从 16384 按类型降至 2K-8K，响应时间缩短约 50%
- **拓展阅读改为直接链接**：去掉 AI 生成内容的慢弹窗，改为推荐知乎/CSDN/掘金等平台文章链接
- 增加双层缓存（内存 + 画像持久化）

**✨ 体验优化**
- **AI 主动问候**：新用户登录后 AI 自动发送欢迎消息，主动询问学习阶段
- **图标替换**：AI 问答标题和历史记录 ✨→✏️
- **公开学习资源升级**：新增「公开练习题库」（LeetCode/牛客网/洛谷），题库+视频双通道
- **实践项目增强**：去掉"开始项目"按钮，新增 🔄 换一换，9 套项目模板轮换
- **公式渲染**：全局接入 `remark-math` + `rehype-katex`，支持 LaTeX 数学公式
