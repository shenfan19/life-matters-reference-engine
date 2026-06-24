// GlobalModelToolbar.tsx — shared toolbar row: download model / reload, always visible across
// Overview / Simulation / Optimization tabs, with tab-specific content appended on the right.

import React, { useState } from 'react';
import { Button, Checkbox, Popover, Tooltip } from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ModelFile } from '../../types';

interface GlobalModelToolbarProps {
  selectedModel: ModelFile | null;
  isOtherRunning: boolean;
  simRunning: boolean;
  optRunning: boolean;
  hasOptResult: boolean;
  onDownload: (opts: { withResults: boolean; flattenImports: boolean }) => void;
  onReload: () => void;
  rightContent?: React.ReactNode;
  scsMode?: boolean;
  autoSaveLocal?: boolean;
  onAutoSaveLocalChange?: (v: boolean) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  c: Record<string, string>;
}

export function GlobalModelToolbar({
  selectedModel, isOtherRunning, simRunning, optRunning, hasOptResult,
  onDownload, onReload, rightContent,
  scsMode, autoSaveLocal, onAutoSaveLocalChange,
  t, c,
}: GlobalModelToolbarProps) {
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [withResults, setWithResults] = useState(true);
  const [flattenImports, setFlattenImports] = useState(true);

  const downloadDisabled = !selectedModel || isOtherRunning || optRunning;
  const reloadDisabled = !selectedModel || isOtherRunning || simRunning || optRunning;
  const reloadTip = simRunning ? t('sim.ctrl.reload_tip_running')
    : optRunning ? t('sim.ctrl.reload_tip_opt')
    : t('sim.ctrl.reload_tip');

  return (
    <div style={{ width: '100%', flexShrink: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '6px 10px', borderBottom: `1px solid ${c.border}`, background: c.panel }}>
      {rightContent}

      {rightContent && <div style={{ width: 1, height: 16, background: c.border }} />}

      <Popover
        open={downloadOpen}
        onOpenChange={open => { if (!downloadDisabled) setDownloadOpen(open); }}
        trigger="click"
        content={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 160 }}>
            <Checkbox checked={withResults && hasOptResult} disabled={!hasOptResult}
              onChange={e => setWithResults(e.target.checked)}>
              {t('sim.ctrl.with_results')}
            </Checkbox>
            <Checkbox checked={flattenImports}
              onChange={e => setFlattenImports(e.target.checked)}>
              {t('sim.ctrl.flatten_imports')}
            </Checkbox>
            <Button size="small" type="primary" style={{ marginTop: 4 }}
              onClick={() => { onDownload({ withResults: withResults && hasOptResult, flattenImports }); setDownloadOpen(false); }}>
              {t('sim.ctrl.dl_btn')}
            </Button>
          </div>
        }
      >
        <Button size="small" icon={<DownloadOutlined />}
          disabled={downloadDisabled}
          style={{ whiteSpace: 'nowrap', color: c.textSec }}
        >{t('sim.ctrl.model_label')}</Button>
      </Popover>

      <Tooltip title={reloadTip}>
        <Button size="small" icon={<ReloadOutlined />}
          onClick={onReload}
          disabled={reloadDisabled}
          style={{ whiteSpace: 'nowrap', color: c.textSec }}
        >{t('sim.ctrl.reload_label')}</Button>
      </Tooltip>

      {!scsMode && onAutoSaveLocalChange && (
        <Tooltip title={t('sim.ctrl.auto_save_local_tip')}>
          <Checkbox checked={!!autoSaveLocal}
            onChange={e => onAutoSaveLocalChange(e.target.checked)}
            style={{ color: c.textSec, whiteSpace: 'nowrap' }}
          >{t('sim.ctrl.auto_save_local')}</Checkbox>
        </Tooltip>
      )}
    </div>
  );
}
