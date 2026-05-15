// sim_gui/src/components/SimRunHistory.tsx
// 历史运行记录抽屉面板。
// 每次完成的 sim / opt 运行自动存到服务器端 runs/ 目录，
// 打开此面板可查看历史列表、加载结果、删除记录、修改备注。

import React, { useEffect, useRef, useState } from 'react';
import { Button, Drawer, Empty, Input, message, Spin, Tag, Tooltip } from 'antd';
import {
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  ExperimentOutlined,
  FundOutlined,
  LoadingOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { RunMeta, RunRecord } from '../types';
import { getC } from '../core/theme';

const API_BASE = '/api';

interface SimRunHistoryProps {
  open: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  onLoadRun: (run: RunRecord) => void;
}

function fmtDate(iso: string): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso.slice(0, 16);
  }
}

function timeAgo(iso: string): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小时前`;
  const days = Math.floor(hrs / 24);
  return `${days} 天前`;
}

const SimRunHistory: React.FC<SimRunHistoryProps> = ({ open, onClose, isDarkMode, onLoadRun }) => {
  const c = getC(isDarkMode);
  const [runs, setRuns] = useState<RunMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const editInputRef = useRef<any>(null);

  const fetchRuns = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/runs`).then(r => r.json());
      if (res.success) setRuns(res.runs || []);
    } catch {
      message.error('加载历史失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchRuns();
  }, [open]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      setTimeout(() => editInputRef.current?.focus(), 50);
    }
  }, [editingId]);

  const handleLoad = async (run: RunMeta) => {
    setLoadingId(run.id);
    try {
      const res = await fetch(`${API_BASE}/runs/${run.id}`).then(r => r.json());
      if (!res.success || !res.run) { message.error('加载失败'); return; }
      onLoadRun(res.run as RunRecord);
      onClose();
    } catch {
      message.error('加载失败');
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`${API_BASE}/runs/${id}`, { method: 'DELETE' }).then(r => r.json());
      if (res.success) {
        setRuns(prev => prev.filter(r => r.id !== id));
        message.success('已删除');
      } else {
        message.error('删除失败');
      }
    } catch {
      message.error('删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  const startEdit = (run: RunMeta) => {
    setEditingId(run.id);
    setEditLabel(run.label || '');
  };

  const commitEdit = async (id: string) => {
    try {
      await fetch(`${API_BASE}/runs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: editLabel }),
      });
      setRuns(prev => prev.map(r => r.id === id ? { ...r, label: editLabel } : r));
    } catch {}
    setEditingId(null);
  };

  const TypeBadge = ({ type }: { type: string }) => (
    <Tag
      icon={type === 'sim' ? <FundOutlined /> : <ExperimentOutlined />}
      color={type === 'sim' ? 'green' : 'blue'}
      style={{ fontFamily: 'monospace', fontSize: 11, margin: 0 }}
    >
      {type.toUpperCase()}
    </Tag>
  );

  const StatusBadge = ({ status }: { status: string }) => {
    const ok = status === 'completed';
    return (
      <span style={{ fontSize: 11, color: ok ? c.primary : '#faad14', fontFamily: 'monospace' }}>
        ● {ok ? '完成' : '中断'}
      </span>
    );
  };

  const Summary = ({ run }: { run: RunMeta }) => {
    if (run.type === 'sim' && run.sim_result_summary) {
      const s = run.sim_result_summary;
      return (
        <span style={{ color: c.textMute, fontSize: 11 }}>
          {s.n_points?.toLocaleString()} 点 · {s.n_runs} 条
          {s.output_vars?.length ? ` · [${s.output_vars.slice(0, 3).join(', ')}${s.output_vars.length > 3 ? '…' : ''}]` : ''}
        </span>
      );
    }
    if (run.type === 'opt' && run.opt_result_summary) {
      const s = run.opt_result_summary;
      return (
        <span style={{ color: c.textMute, fontSize: 11 }}>
          {s.n_solutions} Pareto解 · {s.method}
          {s.elapsed ? ` · ${s.elapsed.toFixed(1)}s` : ''}
        </span>
      );
    }
    return null;
  };

  const RunItem = ({ run }: { run: RunMeta }) => {
    const isLoading = loadingId === run.id;
    const isDeleting = deletingId === run.id;
    const isEditing = editingId === run.id;

    return (
      <div style={{
        border: `1px solid ${c.border}`,
        borderRadius: 6,
        padding: '10px 12px',
        background: c.panel,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}>
        {/* Row 1: type + model name + time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <TypeBadge type={run.type} />
          <span style={{ fontWeight: 600, color: c.text, fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {run.model_name}
          </span>
          <StatusBadge status={run.status} />
          <Tooltip title={fmtDate(run.created_at)}>
            <span style={{ color: c.textMute, fontSize: 11, whiteSpace: 'nowrap' }}>
              <ClockCircleOutlined style={{ marginRight: 3 }} />{timeAgo(run.created_at)}
            </span>
          </Tooltip>
        </div>

        {/* Row 2: summary */}
        <Summary run={run} />

        {/* Row 3: label editor */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {isEditing ? (
            <Input
              ref={editInputRef}
              size="small"
              value={editLabel}
              onChange={e => setEditLabel(e.target.value)}
              onPressEnter={() => commitEdit(run.id)}
              onBlur={() => commitEdit(run.id)}
              placeholder="添加备注…"
              style={{ flex: 1, fontSize: 12 }}
            />
          ) : (
            <span
              onClick={() => startEdit(run)}
              style={{ color: run.label ? c.textSec : c.textMute, fontSize: 12, flex: 1, cursor: 'text', minHeight: 20 }}
            >
              {run.label || <span style={{ fontStyle: 'italic' }}>点击添加备注…</span>}
            </span>
          )}
          {!isEditing && (
            <Tooltip title="编辑备注">
              <Button type="text" size="small" icon={<EditOutlined />} onClick={() => startEdit(run)}
                style={{ color: c.textMute, padding: '0 4px' }} />
            </Tooltip>
          )}
        </div>

        {/* Row 4: actions */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <Tooltip title="删除此记录">
            <Button
              size="small" danger icon={isDeleting ? <LoadingOutlined /> : <DeleteOutlined />}
              onClick={() => handleDelete(run.id)}
              disabled={isDeleting}
            />
          </Tooltip>
          <Button
            size="small" type="primary"
            icon={isLoading ? <LoadingOutlined /> : undefined}
            onClick={() => handleLoad(run)}
            disabled={isLoading}
            style={{ background: c.primary, borderColor: c.primary }}
          >
            加载结果
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>运行历史</span>
          <Tooltip title="刷新列表">
            <Button type="text" size="small" icon={<ReloadOutlined />} onClick={fetchRuns} disabled={loading} />
          </Tooltip>
          <span style={{ color: c.textMute, fontSize: 12, fontWeight: 400 }}>
            {runs.length > 0 ? `${runs.length} 条记录` : ''}
          </span>
        </div>
      }
      open={open}
      onClose={onClose}
      width={380}
      placement="right"
      styles={{ body: { padding: '12px', background: isDarkMode ? '#141414' : '#f5f5f5', overflowY: 'auto' } }}
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
        </div>
      ) : runs.length === 0 ? (
        <Empty description="暂无历史运行记录" style={{ marginTop: 60 }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {runs.map(run => <RunItem key={run.id} run={run} />)}
        </div>
      )}
    </Drawer>
  );
};

export default SimRunHistory;
