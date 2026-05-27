import React from 'react';
import { getC } from '../../core/theme';

export function WorkspacePage({ controls, setup, result, progress }: {
  controls: React.ReactNode; setup: React.ReactNode; result: React.ReactNode; progress: React.ReactNode;
}) {
  return (
    <div style={{ flex: 1, width: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {controls}
      <div style={{ flex: 1, width: '100%', minHeight: 0, display: 'flex', overflow: 'hidden', gap: 8, padding: '6px 10px' }}>
        <div style={{ flex: '0 0 40%', minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {setup}
        </div>
        <div style={{ flex: '0 0 60%', minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {result}
        </div>
      </div>
      {progress}
    </div>
  );
}

export function ProgressStrip({ label, percent, detail, active, c, isDarkMode }: { label: string; percent: number; detail: string; active: boolean; c: ReturnType<typeof getC>; isDarkMode: boolean }) {
  return (
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderTop: `1px solid ${c.border}`, background: c.panel }}>
      <span style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', fontWeight: 700, textTransform: 'uppercase', minWidth: 82 }}>{label}</span>
      <div style={{ flex: 1, height: 5, background: isDarkMode ? '#2a2a2a' : '#e0e0e0', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, Math.min(100, percent))}%`, height: '100%', background: active ? c.primary : c.textMute, transition: 'width 0.3s', borderRadius: 3 }} />
      </div>
      <span style={{ color: c.textMute, fontFamily: 'monospace', whiteSpace: 'nowrap', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>{detail}</span>
    </div>
  );
}
