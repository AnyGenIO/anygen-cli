# AnyGen CLI

[AnyGen](https://www.anygen.io) AI 驱动的内容生成平台命令行工具。

从 Discovery Document 自动生成命令，结构化 JSON 输出，适合 AI Agent 集成。

### 支持的内容类型

| 类型 | 操作 | 说明 |
|------|------|------|
| 幻灯片 / PPT | `slide` | 路演、汇报、培训材料、产品发布 |
| 文档 | `doc` | 技术设计文档、PRD、白皮书、SOP |
| 图表 | `smart_draw` | 架构图、流程图、思维导图、ER 图、UML |
| 研究报告 | `deep_research` | 行业分析、市场规模、竞争格局 |
| 数据分析 | `data_analysis` | CSV 分析、图表、仪表盘、KPI 追踪 |
| 财务研究 | `finance` | 财报分析、股票研究、公司估值 |
| 绘本 | `storybook` | 插图故事、漫画、儿童绘本 |
| 网站 | `website` | 落地页、产品页、个人作品集 |
| 图片设计 | `ai_designer` | 海报、Banner、社交媒体图、营销素材 |

运行 `anygen task operations` 查看完整列表。

## 安装

```bash
npm install -g @anygen/cli
```

需要 Node.js >= 18。

## 快速开始

```bash
# 1. 认证
anygen auth login

# 2. 创建任务
anygen task create --data '{"operation":"slide","prompt":"Q4 季度汇报"}'

# 3. 等待完成
anygen task get --params '{"task_id":"xxx"}' --wait

# 4. 下载产物
anygen task +download --task-id xxx
```

## 认证

```bash
anygen auth login                  # Web 登录（交互式，等待浏览器授权）
anygen auth login --no-wait        # Web 登录（非阻塞，返回授权 URL）
anygen auth login --api-key sk-xxx # 直接设置 API Key
export ANYGEN_API_KEY=sk-xxx       # 环境变量

anygen auth status                 # 查看当前认证状态
anygen auth logout                 # 移除已存储的 Key
```

优先级：`--api-key` flag > `ANYGEN_API_KEY` 环境变量 > 配置文件 (`~/.config/anygen/config.json`)。

## 命令

### 动态命令（从 API 自动生成）

```bash
# 创建任务（POST → --data）
anygen task create --data '{"operation":"slide","prompt":"Q4 deck"}'

# 查询任务（URL 参数 → --params）
anygen task get --params '{"task_id":"xxx"}'

# 发送修改（URL 参数 + 请求体 → --params + --data）
anygen task message send --params '{"task_id":"xxx"}' --data '{"content":"修改标题"}'

# 上传文件
anygen file upload --data '{"file":"./data.csv"}'

# 轮询等待完成
anygen task get --params '{"task_id":"xxx"}' --wait
```

### Helper 命令

```bash
# 下载已完成任务的产物
anygen task +download --task-id xxx --output-dir ./output

# 下载缩略图预览
anygen task +download --task-id xxx --thumbnail
```

### Schema 内省

```bash
# JSON 输出
anygen schema task.create

# 带颜色的可读格式（必填标记、枚举值）
anygen schema task.create --pretty

# Dry run —— 预览请求但不发送
anygen task create --data '{"operation":"slide","prompt":"测试"}' --dry-run
```

### Skill 安装

```bash
# 交互式 —— 箭头键选择平台
anygen skill install

# 非交互式 —— 所有平台
anygen skill install -y

# 指定平台
anygen skill install --platform claude-code -y

# 列出可用 Skill
anygen skill list
```

## 选项

| 选项 | 说明 |
|------|------|
| `--params <json>` | URL/路径参数（JSON 格式） |
| `--data <json>` | 请求体（JSON 格式，用于 POST/PUT） |
| `--dry-run` | 预览请求但不发送 |
| `--wait` | 轮询直到终态（task.get / message.list） |
| `--timeout <ms>` | 轮询超时时间（毫秒） |

## 错误处理

所有错误输出结构化 JSON 到 stdout：

```json
{
  "success": false,
  "error": {
    "type": "validation",
    "message": "Missing --data (required fields: operation, prompt)",
    "hint": "Run: anygen schema task.create"
  }
}
```

错误类型：`validation`、`auth`、`permission`、`rate_limit`、`api_error`、`network`、`internal`。

详见 [docs/error-handling.md](docs/error-handling.md)。

## 架构

```
┌──────────────────────────────────────────────────┐
│                  CLI 入口 (commander)              │
│  index.ts — auth | schema | skill                │
├──────────┬───────────────────────────────────────┤
│ Dynamic  │         Helper (+)                     │
│ 命令     │         task +download                 │
│(dynamic) │        (task-download)                  │
├──────────┴───────────────────────────────────────┤
│               execute.ts                          │
│  认证 → 校验 → dry-run → callApi → 轮询 → 输出   │
├──────────────────────────────────────────────────┤
│               api/client + utils/download         │
│  HTTP 客户端 · 路径参数 · 文件下载                  │
├──────────────────────────────────────────────────┤
│               基础设施                              │
│  配置管理 · Auth · Discovery Doc 缓存              │
└──────────────────────────────────────────────────┘
```

## 项目结构

```
├── src/
│   ├── index.ts              # 入口，两阶段启动
│   ├── version.ts            # CLI 版本（唯一来源）
│   ├── errors.ts             # 错误类型、分类、JSON 输出
│   ├── api/
│   │   ├── client.ts         # HTTP 客户端（callApi）
│   │   └── auth.ts           # 认证流程（不自动登录，接收 baseUrl）
│   ├── commands/
│   │   ├── auth-cmd.ts       # auth login/status/logout
│   │   ├── dynamic.ts        # Discovery Document 驱动的命令注册
│   │   ├── execute.ts        # 命令执行引擎（认证 → 校验 → 调用 → 输出）
│   │   ├── schema-cmd.ts     # schema 命令（JSON + --pretty）
│   │   ├── task-download.ts  # Helper: task +download
│   │   ├── poll.ts           # 轮询工具（--wait）
│   │   └── skill-cmd.ts      # skill install/list
│   ├── config/
│   │   ├── config.ts         # 配置加载（flag > env > file）
│   │   └── internal-fields.ts # 隐藏字段配置
│   ├── discovery/
│   │   ├── client.ts         # Discovery Document 获取 + 缓存
│   │   └── types.ts          # Discovery Document 类型定义
│   ├── render/
│   │   └── diagram.ts        # drawio/excalidraw → PNG 渲染
│   ├── security/
│   │   └── validate.ts       # URL/路径/文件名安全校验
│   ├── skills/
│   │   └── generator.ts      # SKILL.md 文件生成器
│   └── utils/
│       ├── download.ts       # 文件下载 + 安全校验
│       └── prompt.ts         # 交互式提示（选择、多选、确认）
├── skills/                   # 生成的 Skill 文件（随 npm 包发布）
├── docs/
│   ├── design-spec.md        # 设计规范
│   ├── error-handling.md     # 错误处理架构
│   └── testcase.md           # 测试用例
└── package.json
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `ANYGEN_API_KEY` | 认证用的 API Key |

## 开发

```bash
npm install          # 安装依赖
npm run build        # 编译 TypeScript
npm test             # 运行测试
npx tsc --noEmit     # 仅类型检查

# 开发模式（无需编译）
npx tsx src/index.ts task create --help
```

## License

MIT
