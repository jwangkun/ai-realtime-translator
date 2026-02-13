# AI 实时同传翻译

一个基于 Mistral AI 的实时语音转写和翻译应用，支持多国语言的实时同声传译。

## 功能特点

- 🎤 **实时语音转写** - 边说边转，实时显示文字
- 🌍 **多语言翻译** - 支持 12 种语言的实时翻译
- 📝 **双语对照显示** - 左右对照，原文译文一目了然
- ⚡ **低延迟流式处理** - 音频流实时处理，快速响应
- 🎨 **现代 UI** - 基于 shadcn/ui 的简洁美观界面

## 支持的语言

- 🇨🇳 中文
- 🇬🇧 English
- 🇪🇸 Español
- 🇫🇷 Français
- 🇩🇪 Deutsch
- 🇮🇹 Italiano
- 🇵🇹 Português
- 🇯🇵 日本語
- 🇰🇷 한국어
- 🇷🇺 Русский
- 🇸🇦 العربية
- 🇮🇳 हिन्दी

## 技术栈

- **前端**: React + TypeScript + Vite
- **UI 组件**: shadcn/ui + Tailwind CSS
- **后端**: Express + WebSocket
- **AI 模型**: Mistral AI (Voxtral + Mistral Large)
- **实时通信**: WebSocket

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/your-username/realtime-translator.git
cd realtime-translator
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

复制 `.env.example` 为 `.env` 并填入你的 Mistral API Key：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```
MISTRAL_API_KEY=your_api_key_here
PORT=3002
```

> 你可以在 [Mistral AI Console](https://console.mistral.ai/) 获取 API Key

### 4. 启动应用

```bash
npm run dev
```

应用将在以下地址运行：
- 前端: http://localhost:5173
- 后端: http://localhost:3002

## 使用方法

1. 打开浏览器访问 http://localhost:5173
2. 选择源语言（你说的语言）和目标语言（翻译成的语言）
3. 点击底部的麦克风按钮开始录音
4. 对着麦克风说话，文字会实时显示在左右两侧
   - 左侧：原文转写
   - 右侧：翻译结果
5. 点击停止按钮结束录音

## 项目结构

```
realtime-translator/
├── server/
│   └── index.ts          # Express + WebSocket 服务器
├── src/
│   ├── components/
│   │   └── ui/           # shadcn/ui 组件
│   ├── lib/
│   │   └── utils.ts      # 工具函数
│   ├── App.tsx           # 主应用组件
│   ├── index.css         # 全局样式
│   └── main.tsx          # 入口文件
├── .env.example          # 环境变量示例
├── .gitignore
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

## API 说明

### WebSocket 消息

#### 客户端发送

```typescript
// 发送音频数据
{
  type: 'audio',
  audio: string,        // Base64 编码的音频数据
  sourceLanguage: string,
  targetLanguage: string
}

// 停止录音
{
  type: 'stop',
  audio: string,
  sourceLanguage: string,
  targetLanguage: string
}

// 更新语言配置
{
  type: 'config',
  sourceLanguage: string,
  targetLanguage: string
}
```

#### 服务器返回

```typescript
// 转写和翻译结果
{
  type: 'transcription',
  sourceText: string,   // 原文
  targetText: string,   // 译文
  isFinal: boolean      // 是否为最终结果
}
```

### REST API

#### 翻译文本

```
POST /api/translate
Content-Type: application/json

{
  "text": "要翻译的文本",
  "sourceLanguage": "zh",
  "targetLanguage": "en"
}
```

#### 健康检查

```
GET /api/health
```

## 开发

### 构建生产版本

```bash
npm run build
```

### 仅启动后端服务器

```bash
npm run server
```

## 注意事项

- 需要浏览器支持麦克风权限
- 建议使用 Chrome 或 Edge 浏览器以获得最佳体验
- 网络延迟可能影响实时转写效果
- API 调用会产生费用，请注意 Mistral AI 的定价

## License

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
