import { useEffect, useRef } from 'react';

interface Props {
  pluginId: string;
  componentPath?: string;
  isDarkMode?: boolean;
}

/**
 * PluginLoader - 真正的自动发现方案
 * 
 * 原理：使用 iframe 加载 Backend 生成的独立插件页面
 * 优点：
 * - ✅ 学者丢文件夹即可用，无需注册
 * - ✅ 插件完全隔离，不会污染主应用
 * - ✅ 支持热更新（刷新iframe即可）
 */
export default function PluginLoader({ pluginId, componentPath, isDarkMode }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const theme = isDarkMode ? 'dark' : 'light';

  useEffect(() => {
    // 监听来自插件的消息
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'plugin-message' && event.data.pluginId === pluginId) {
        console.log('Message from plugin:', event.data.data);
        // 可以在这里处理插件发来的消息
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [pluginId]);

  // 构建插件UI页面的URL，传入当前主题
  const iframeUrl = `/api/plugins/${pluginId}/ui-page?theme=${theme}`;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <iframe
        ref={iframeRef}
        src={iframeUrl}
        style={{
          width: '100%',
          flex: 1,
          border: 'none',
          borderRadius: 4
        }}
        title={`Plugin: ${pluginId}`}
        sandbox="allow-scripts allow-same-origin"
      />

      {/* 可选：添加刷新按钮 */}
      <button
        onClick={() => {
          if (iframeRef.current) {
            iframeRef.current.src = iframeUrl;
          }
        }}
        style={{
          position: 'absolute',
          top: 10,
          right: 30,
          padding: '5px 10px',
          fontSize: 12,
          background: 'var(--ant-color-bg-container, #f0f0f0)',
          color: 'var(--ant-color-text, #000)',
          border: '1px solid var(--ant-color-border, #ccc)',
          borderRadius: 4,
          cursor: 'pointer',
          zIndex: 10
        }}
      >
        🔄 刷新
      </button>
    </div>
  );
}
