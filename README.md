# 🎓 IntelliLearn Platform（智慧优学）

一个现代化的 AI 驱动学习平台，集成智能问答、个性化学习路径、全类型学习资源生成、番茄钟专注力和多维学习分析。

## ✨ 功能特性

### AI 核心
- **🤖 AI 智能问答** — 多轮对话 + SSE 流式输出，支持 Markdown / LaTeX / 代码高亮渲染
- **👨‍🏫 AI 导师辅导** — 苏格拉底式教学法，引导学生自主思考
- **📚 资料上传解析** — 上传 .txt / .md / .py / .json / .csv 等文本文件，AI 自动提取知识点、生成摘要、思维导图和配套习题

### 学习资源
- **📖 课程文档** — AI 生成结构化教材，支持高亮标注和笔记
- **🧠 思维导图** — ECharts 树图可视化，支持缩放、拖拽、节点展开收起、下载导出
- **📝 习题练习** — 章节分类 + 难度筛选 + 交互式逐题作答 + 答案与解析
- **📝 错题本** — 自动收集错题，支持分类筛选、重做、智能复习（AI 提取考点生成专项试卷）
- **💻 代码实操** — AI 根据当前学习章节自动生成 Python 练习题，内置代码编辑器 + 控制台模拟执行
- **🎴 闪卡学习** — AI 生成知识闪卡，支持翻转复习
- **🔗 拓展材料** — AI 推荐公开题库、视频教程、拓展阅读；实践项目 AI 按需生成详细方案

### 效率工具
- **⏱️ 番茄钟** — 专注 / 短休 / 长休三模式，自定义时长（1-120 分钟），白噪音背景音，每日统计
- **📂 收藏夹** — 导图、习题、拓展材料、代码实操全局收藏，分类管理

### 学习分析
- **🗺️ 动态里程碑学习路线** — 基于 AI 分析生成三阶段学习计划，进度自动追踪
- **📊 六维能力雷达图** — 知识基础、认知风格、易错领域、学习目标、专业兴趣、当前进度
- **📅 学习日历 & 趋势** — GitHub 风格热力图 + 学习时长趋势 + 连续天数统计
- **📖 章节进度追踪** — 自动检测习题 / 文档 / 代码完成情况，解锁下一阶段
- **🔄 自适应学习路径** — 错题率 > 30% 自动插入补习阶段

### 系统
- **🔐 用户认证** — 注册、登录、密码重置，手机号校验，bcrypt 加密
- **🔔 实时推送** — SSE 实时同步学习画像、进度和通知
- **💾 双存储** — MySQL 优先，连接失败自动回退 JSON 文件

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19, TypeScript, Vite, Tailwind CSS |
| 路由 | React Router v7 |
| Markdown | react-markdown, remark-gfm, remark-math, rehype-katex, KaTeX |
| 代码高亮 | Prism.js (react-syntax-highlighter) |
| 可视化 | ECharts (echarts-for-react) |
| 图标 | Lucide React |
| 后端 | Express.js (Node.js), bcryptjs, jsonrepair |
| 数据库 | MySQL (mysql2)，JSON 文件回退 |
| AI | DeepSeek / 讯飞星火（OpenAI 兼容接口，SSE 流式） |
| 构建 | Vite + esbuild |

## 📁 项目结构

```
intellilearn-platform/
├── src/                        # 前端源码
│   ├── components/             # 通用组件
│   │   ├── Layout.tsx          # 页面布局（导航栏、侧边栏、用户菜单）
│   │   └── PomodoroTimer.tsx   # 番茄钟（自定义时长、白噪音、Portal 弹窗）
│   ├── components/resources/   # 学习资源模块
│   │   ├── CodeModule.tsx      # 代码实操（AI 生成 + 编辑器 + 控制台）
│   │   ├── DocumentModule.tsx  # 课程文档（Markdown 渲染 + 高亮笔记）
│   │   ├── ExerciseModule.tsx  # 习题练习（章节筛选 + 逐题作答 + 错题本）
│   │   ├── ExtendedModule.tsx  # 拓展材料（题库/视频/阅读/实践项目）
│   │   ├── MindmapModule.tsx   # 思维导图（ECharts 树图 + 全屏 + 导出）
│   │   └── UploadModule.tsx    # 资料上传（AI 解析 + 思维导图 + 配套习题）
│   ├── components/flashcards/  # 闪卡学习模块
│   │   └── FlashcardGenerator.tsx
│   ├── lib/
│   │   └── utils.ts            # 工具函数（cn 样式合并）
│   ├── pages/
│   │   ├── Auth.tsx            # 登录 / 注册 / 忘记密码
│   │   ├── Home.tsx            # 主页（AI 问答 + 画像雷达图 + 学习日历）
│   │   ├── Profile.tsx         # 个人中心（学情看板、打卡热力图、收藏夹）
│   │   ├── Resources.tsx       # 学习资源（6 个 Tab：文档/导图/习题/代码/拓展/上传）
│   │   └── FlashcardsPage.tsx  # 闪卡学习页
│   ├── UserContext.tsx         # 全局状态（用户、聊天、收藏、SSE 推送、学习事件）
│   ├── App.tsx                 # 路由配置
│   ├── index.css               # 全局样式 + Tailwind
│   └── main.tsx                # 应用入口
├── server.ts                   # Express 后端（API、LLM Agent、数据库、行为追踪）
├── script2.ts                  # 数据库迁移脚本
├── db.json                     # JSON 文件存储（MySQL 不可用时回退）
├── db.backup.json              # 数据库备份
├── index.html                  # HTML 入口
├── package.json                # 依赖和脚本
├── tsconfig.json               # TypeScript 配置
├── vite.config.ts              # Vite 配置
└── .env.example                # 环境变量模板
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

## 🌐 API 接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/auth/register` | POST | 用户注册 |
| `/api/auth/login` | POST | 用户登录 |
| `/api/auth/reset-password` | POST | 密码重置 |
| `/api/user-profile` | GET/POST | 获取 / 更新用户画像 |
| `/api/chat/stream` | POST | AI 对话（SSE 流式） |
| `/api/chat/enhanced` | POST | 增强对话（难度 + 追问模式） |
| `/api/generate-resource` | POST | 生成学习资源（explanation / mindmap / quiz / code-exercise / project / reading） |
| `/api/upload-material` | POST | 上传资料 AI 解析 |
| `/api/chapter-progress` | POST | 更新章节进度 |
| `/api/exercise-answer` | POST | 提交习题答案 |
| `/api/wrong-book` | GET | 获取错题本 |
| `/api/wrong-book/save` | POST | 保存错题 |
| `/api/wrong-book/extract-knowledge-points` | POST | AI 提取错题考点 |
| `/api/wrong-book/generate-review-paper` | POST | AI 生成复习试卷 |
| `/api/wrong-book/analyze-results` | POST | AI 分析复习结果 |
| `/api/pomodoro-sessions` | POST | 保存番茄钟记录 |
| `/api/extended-links` | POST | 获取拓展学习链接 |
| `/api/adaptive-path` | POST | 自适应学习路径分析 |
| `/api/review-history` | GET/POST | 复习历史记录 |
| `/api/behavioral-events` | POST | 上报学习行为事件 |
| `/api/notifications` | GET | 获取通知（SSE） |

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

### 2026.07.06

**🧠 思维导图弹窗渲染修复**
- 修复全屏弹窗左右黑色侧边溢出条：`overflow-auto` → `overflow-hidden` + CSS translate 平移
- 修复图表集中在顶部、底部大量空白：`transformOrigin: "top left"` → `"center center"` + flex 居中
- 弹窗参照实践项目弹窗重新设计：头部渐变背景、底部缩放控制栏、响应式内边距
- 滚轮事件改用原生 `addEventListener({ passive: false })`，阻止页面跟随滚动
- 修复 MindmapModule 点击蓝色节点圆圈意外退出全屏：移除图表区域自动全屏 onClick
- 修复根节点标签文字截断：左侧边距 8% → 15%，字符截断上限 15 → 25

**📝 配套习题交互式做题**
- 资料上传模块配套习题：静态展示 → 交互式做题（列表 + 逐题作答）
- 支持选项选择、提交答案、正确/错误高亮反馈、答案与解析、上/下题导航
- 列表视图显示每题"已做对 / 已做错 / 未作答"状态

**💻 代码实操 AI 自动生成**
- 读取左侧学习路线当前章节知识点，AI 自动生成 Python 代码实操任务
- 切换章节自动刷新；新增"重新生成"按钮 + 骨架屏加载
- 任务要求用 Markdown 结构化（功能要求 / 输入输出说明 / 关键步骤）+ LaTeX 公式
- 代码生成从 JSON → 分隔符格式（`---FIELD---`），解决引号转义导致的解析失败
- 控制台动态解析 `print()` 语句模拟输出

**🔧 实践项目 AI 生成**
- 9 套硬编码模板 → AI 点击卡片时按需生成详细内容
- 生成 5 字段：项目描述、学习目标、实现步骤、验收标准、学习提示
- 内容通过 ReactMarkdown 渲染，具体可执行（技术栈 + 数据流 + 具体步骤）

**⏱️ 番茄钟自定义时长**
- 专注 / 短休 / 长休支持独立自定义（1-120 分钟，步长 5 分钟）
- 设置持久化 localStorage；运行时锁定编辑；+/- 按钮调节

**🐛 弹窗 Portal 修复**
- 番茄钟弹窗 + 编辑资料弹窗：`createPortal` → `document.body`
- 修复 header `backdrop-blur-md` 导致 `fixed` 遮罩被限制在 header 区域内
- 遮罩点击关闭 + 卡片 `stopPropagation`

**⚙️ 新增 API**
- `POST /api/adaptive-path`：分析错题率，>30% 自动插入补习阶段
- `POST /api/chat/enhanced`：SSE 流式，支持难度级别 + 苏格拉底式追问
- `PROJECT_AGENT_PROMPT` + `CODE_EXERCISE_AGENT_PROMPT`：结构化 AI 生成

