# 0018 — 背景音乐 + MusicBar 播放控制条

**状态**：✅ 已实施  
**日期**：2026-04-05

## 背景

卡牌游戏缺乏听觉层次，加入背景音乐可提升沉浸感。不同 story 场景（如居里夫人的实验室、流行病应对）氛围差异显著，应支持 story 级别的独立音乐配置。播放控制需轻量，不占用过多界面空间。

## 决策

### 1. YAML 新增字段

在 `game_story.yaml` 顶层新增可选字段：

```yaml
music:
  - music/theme.mp3
  - music/ambient.mp3
```

- 路径为相对于 story 文件夹的相对路径，默认格式 MP3，亦支持 OGG / WAV
- 列表为空或字段缺失时不显示播放条

### 2. Loader 处理

`newFormatLoader.ts` 将每条路径解析为绝对 URL：

```typescript
const music = Array.isArray(rawStory.music) && rawStory.music.length > 0
  ? rawStory.music.map((p: string) => `/${storyDir}/${p}`)
  : undefined;
```

### 3. MusicBar 组件

固定高度 30px 的横条，插入在顶栏（50px）与游戏主体之间，仅当 `story.music` 有内容时渲染。

**控件布局（左→右）**：
```
◀◀  ▶/⏸  ▶▶  [───── 滚动文件名 ─────]  1/N
```

- `◀◀` / `▶▶`：切换上/下一曲，循环
- `▶` / `⏸`：播放/暂停切换
- 文件名：去除路径和扩展名后显示；长度 > 20 字符时触发 `music-scroll` CSS 动画（无缝滚动）
- 曲目计数：`当前/总数`

**状态管理**：

```typescript
const [idx, setIdx]         = useState(0);
const [playing, setPlaying] = useState(false);
const audioRef              = useRef<HTMLAudioElement>(null);
const playingRef            = useRef(false); // 避免 useEffect 闭包过期
```

- `idx` 变化时重新设置 `audio.src` 并在 `playingRef.current === true` 时自动继续播放
- `onEnded` 触发 `next()`，实现自动顺序播放

### 4. 滚动动画

在 `CardGame.css` 追加：

```css
@keyframes music-scroll {
  0%   { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
```

文本节点复制一份（`<span>{filename}</span><span padding-left:60>{filename}</span>`），使滚动首尾无缝衔接。

## 后果

- ✅ story 可配置零到多首背景音乐，无音乐时界面无变化
- ✅ 播放条仅占 30px，不影响游戏区域布局
- ✅ 支持前进/后退/播放暂停，曲目结束自动切换下一首
- ⚠️ 浏览器自动播放策略（Autoplay Policy）：用户首次点击前音频不会自动播放，需手动点击 ▶ 开始
- ⚠️ 音乐文件由 story 作者自行准备，Loader 仅构造 URL，不验证文件是否存在
