import React from 'react';
import { Tooltip } from 'antd';
import type { ModelFile, SimulationDataPoint, StepUnit } from '../types';
import { getC } from '../core/theme';
import { VAR_COLORS, varToDataUrl } from './SimChart';
import { getDescriptionSections, descriptionText, descriptionSummary } from '../core/modelUtils';

const ALL_REPORT_SECTIONS = [
  { key: 'intro',     label: 'Description', desc: '模型背景与适用场景说明' },
  { key: 'overview',  label: '模型概览',    desc: '名称、描述、标签、变量总数' },
  { key: 'formulas',  label: '方程列表',    desc: '所有方程含义及激活条件' },
  { key: 'variables', label: '变量汇总',    desc: '所有变量类型、含义及最终值' },
  { key: 'simcfg',    label: '仿真配置',    desc: '时间范围、步长、输入参数值' },
  { key: 'plots',     label: 'Plot 曲线',   desc: '各输出变量仿真轨迹图' },
  { key: 'opt',       label: '优化结果',    desc: '目标函数、约束条件及结果' },
  { key: 'refs',      label: '参考文献',    desc: 'IEEE 编号格式引用列表' },
] as const;
type ReportSection = typeof ALL_REPORT_SECTIONS[number]['key'];

interface SimReportTabProps {
  selectedModel: ModelFile | null;
  simulationData: SimulationDataPoint[];
  dataPerRun: SimulationDataPoint[][];
  outputVars: string[];
  stateVars: Array<{ name: string; [k: string]: any }>;
  inputVars: Array<{ name: string; [k: string]: any }>;
  formulas: Record<string, any>;
  inputParams: Record<string, number>;
  simStartDate: string;
  simEndDate: string;
  stepValue: number;
  stepUnit: StepUnit;
  batchSize: number;
  objectives: Array<{ variable: string; direction: 'minimize' | 'maximize' }>;
  constraints: Array<{ variable: string; op: '≤' | '≥'; value: number }>;
  optAlgo: string;
  optPop: number;
  optGen: number;
  mode: 'sim' | 'opt';
  reportSections: Set<string>;
  setReportSections: React.Dispatch<React.SetStateAction<Set<string>>>;
  openReportPreviews: Set<string>;
  setOpenReportPreviews: React.Dispatch<React.SetStateAction<Set<string>>>;
  reportGenerating: boolean;
  setReportGenerating: React.Dispatch<React.SetStateAction<boolean>>;
  isDarkMode: boolean;
  c: ReturnType<typeof getC>;
  t: (key: string) => string;
  fontSize: number;
}

const SimReportTab: React.FC<SimReportTabProps> = ({
  selectedModel, simulationData, dataPerRun, outputVars, stateVars, inputVars, formulas,
  inputParams, simStartDate, simEndDate, stepValue, stepUnit, batchSize,
  objectives, constraints, optAlgo, optPop, optGen, mode,
  reportSections, setReportSections, openReportPreviews, setOpenReportPreviews,
  reportGenerating, setReportGenerating, isDarkMode, c, t, fontSize,
}) => {
  const meta: any = selectedModel?.content?.metadata ?? selectedModel?.content?.meta ?? {};
  const allV: Record<string, any> = selectedModel?.content?.variables || {};
  const hasData = simulationData.length > 0;
  const latestStep = simulationData[simulationData.length - 1];
  const metaDescText = descriptionText(meta.description);
  const metaDescSummary = descriptionSummary(meta.description);

  // Reference collection
  const allRefs: string[] = [];
  const refIdx = new Map<string, number>();
  function collectRefs(val: unknown): number[] {
    if (!val) return [];
    const arr = (Array.isArray(val) ? val : [val]) as string[];
    return arr.filter(Boolean).map(r => {
      if (refIdx.has(r)) return refIdx.get(r)!;
      allRefs.push(r); refIdx.set(r, allRefs.length); return allRefs.length;
    });
  }
  function citeStr(val: unknown): string {
    const nums = collectRefs(val);
    return nums.length ? ' ' + nums.map(n => `[${n}]`).join('') : '';
  }
  collectRefs((meta as any).references ?? (meta as any).reference);
  Object.values(allV).forEach((d: any) => collectRefs(d.reference));
  Object.values(formulas).forEach((fd: any) => collectRefs(fd.reference));

  function sectionBadge(key: ReportSection): string {
    if (key === 'intro')     return metaDescText ? '有描述' : '无描述';
    if (key === 'overview')  return `${stateVars.length + inputVars.length} 个变量`;
    if (key === 'formulas')  return `${Object.keys(formulas).length} 个`;
    if (key === 'variables') return `${Object.keys(allV).length} 个`;
    if (key === 'simcfg')    return `${Object.keys(inputParams).length} 项输入`;
    if (key === 'plots')     return hasData ? `${outputVars.length} 条曲线` : '需先仿真';
    if (key === 'opt')       return `${objectives.length} 目标`;
    if (key === 'refs')      return allRefs.length > 0 ? `${allRefs.length} 条` : '无';
    return '';
  }

  const TH = ({ children }: { children: React.ReactNode }) => (
    <th style={{ padding: '4px 8px', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', fontWeight: 700, color: c.textMute, textAlign: 'left', borderBottom: `1px solid ${c.border}`, background: c.sectionHd }}>{children}</th>
  );
  const TD = ({ children, mono }: { children: React.ReactNode; mono?: boolean }) => (
    <td style={{ padding: '4px 8px', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', color: c.text, fontFamily: mono ? 'monospace' : 'inherit', borderBottom: `1px solid ${c.border}` }}>{children}</td>
  );

  function renderSectionContent(key: ReportSection): React.ReactNode {
    if (key === 'intro') return (
      <div style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)', color: c.text, lineHeight: 1.8 }}>
        {metaDescText
          ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{metaDescText}</p>
          : <span style={{ color: c.textMute }}>暂无简介</span>
        }
        {meta.tags?.length ? <div style={{ marginTop: 8, color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)' }}>标签：{meta.tags.join('  ·  ')}</div> : null}
      </div>
    );
    if (key === 'overview') return (
      <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
        <tr><TD>名称</TD><TD mono>{meta.name || selectedModel?.title || '—'}</TD></tr>
        <tr><TD>描述</TD><TD>{(metaDescSummary || '—').slice(0, 120)}</TD></tr>
        {meta.tags?.length ? <tr><TD>标签</TD><TD>{meta.tags.join(', ')}</TD></tr> : null}
        <tr><TD>状态变量</TD><TD mono>{stateVars.length} 个</TD></tr>
        <tr><TD>输入变量</TD><TD mono>{inputVars.length} 个</TD></tr>
        <tr><TD>方程数</TD><TD mono>{Object.keys(formulas).length} 个</TD></tr>
      </tbody></table>
    );
    if (key === 'simcfg') return (
      <div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}><tbody>
          <tr><TD>时间范围</TD><TD mono>{simStartDate} ~ {simEndDate}</TD></tr>
          <tr><TD>步长</TD><TD mono>{stepValue} {stepUnit}</TD></tr>
          <tr><TD>批量大小</TD><TD mono>{batchSize}</TD></tr>
        </tbody></table>
        {Object.keys(inputParams).length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><TH>变量</TH><TH>含义</TH><TH>值</TH></tr></thead>
            <tbody>{Object.entries(inputParams).map(([k, v]) => (
              <tr key={k}><TD mono>{k}</TD><TD>{allV[k]?.description || '—'}</TD><TD mono>{String(v)}</TD></tr>
            ))}</tbody>
          </table>
        )}
      </div>
    );
    if (key === 'variables') return (
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><TH>变量名</TH><TH>含义</TH><TH>类型</TH><TH>初始值</TH><TH>最终值</TH><TH>单位</TH></tr></thead>
        <tbody>{Object.entries(allV).map(([name, d]: [string, any]) => {
          const finalVal = latestStep?.[name] != null ? Number(latestStep[name]).toFixed(3) : '—';
          const cite = citeStr(d.reference);
          return <tr key={name}><TD mono>{name}</TD>
            <TD>{d.description || '—'}{cite && <span style={{ color: c.primary, fontFamily: 'monospace', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)' }}>{cite}</span>}</TD>
            <TD>{d.type || '—'}</TD><TD mono>{d.value ?? '—'}</TD><TD mono>{finalVal}</TD><TD>{d.unit || '—'}</TD></tr>;
        })}</tbody>
      </table>
    );
    if (key === 'formulas') return (
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><TH>方程名</TH><TH>含义</TH><TH>条件</TH><TH>影响变量</TH></tr></thead>
        <tbody>{Object.entries(formulas).map(([name, fd]: [string, any]) => {
          const cond = fd.condition && fd.condition !== true && fd.condition !== 'true' ? String(fd.condition) : '常驻';
          const affected = Object.keys(fd.dynamics || {}).join(', ') || '—';
          const cite = citeStr(fd.reference);
          return <tr key={name}><TD mono>{name}</TD>
            <TD>{fd.description || '—'}{cite && <span style={{ color: c.primary, fontFamily: 'monospace', fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)' }}>{cite}</span>}</TD>
            <TD mono>{cond}</TD><TD mono>{affected}</TD></tr>;
        })}</tbody>
      </table>
    );
    if (key === 'plots') {
      if (!hasData) return <div style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', padding: '8px 0' }}>尚无数据，请先运行仿真</div>;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {outputVars.map((varName, idx) => {
            const varInfo = allV[varName];
            return (
              <div key={varName}>
                <div style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', fontWeight: 600, color: c.text, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: VAR_COLORS[idx % VAR_COLORS.length], display: 'inline-block' }} />
                  <span style={{ fontFamily: 'monospace' }}>{varName}</span>
                  {varInfo?.description && <span style={{ color: c.textMute, fontWeight: 400 }}>{varInfo.description}</span>}
                  {varInfo?.unit && <span style={{ color: c.textMute, fontWeight: 400 }}>({varInfo.unit})</span>}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    if (key === 'refs') return (
      <div style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', color: c.text, lineHeight: 1.9 }}>
        {allRefs.length === 0
          ? <span style={{ color: c.textMute }}>当前模型无参考文献</span>
          : allRefs.map((ref, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
                <span style={{ color: c.primary, fontWeight: 700, flexShrink: 0, fontFamily: 'monospace', minWidth: 28 }}>[{i + 1}]</span>
                <span>{ref}</span>
              </div>
            ))
        }
      </div>
    );
    if (key === 'opt') return (
      <div style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.7857)', color: c.text }}>
        {objectives.length > 0 && <><div style={{ fontWeight: 700, marginBottom: 4 }}>目标函数</div>
          {objectives.map((o, i) => <div key={i} style={{ fontFamily: 'monospace', paddingLeft: 8 }}>
            {o.direction === 'maximize' ? '↑' : '↓'} {o.variable}</div>)}</>}
        {constraints.length > 0 && <><div style={{ fontWeight: 700, margin: '8px 0 4px' }}>约束条件</div>
          {constraints.map((c2, i) => <div key={i} style={{ fontFamily: 'monospace', paddingLeft: 8 }}>
            {c2.variable} {c2.op} {c2.value}</div>)}</>}
        <div style={{ marginTop: 8, color: c.textMute }}>算法: {optAlgo} · 种群: {optPop} · 代数: {optGen}</div>
      </div>
    );
    return null;
  }

  function buildMd(): string {
    const lines: string[] = [];
    const ts = new Date().toLocaleString('zh-CN');
    lines.push(`# 仿真报告\n\n> 生成时间：${ts}\n`);
    if (reportSections.has('intro') && metaDescText) {
      lines.push(`## Description\n`);
      lines.push(`${metaDescText}\n`);
      if (meta.tags?.length) lines.push(`**标签**：${meta.tags.join('  ·  ')}\n`);
    }
    if (reportSections.has('overview')) {
      lines.push(`## 模型概览\n`);
      lines.push(`| 字段 | 值 |\n|------|-----|`);
      lines.push(`| 名称 | ${meta.name || selectedModel?.title || '—'} |`);
      lines.push(`| 描述 | ${(metaDescSummary || '—').replace(/\n/g, ' ')} |`);
      if (meta.tags?.length) lines.push(`| 标签 | ${meta.tags.join(', ')} |`);
      lines.push(`| 状态变量数 | ${stateVars.length} |\n| 输入变量数 | ${inputVars.length} |\n| 方程数 | ${Object.keys(formulas).length} |\n`);
    }
    if (reportSections.has('simcfg')) {
      lines.push(`## 仿真配置\n\n| 参数 | 值 |\n|------|-----|`);
      lines.push(`| 时间范围 | ${simStartDate} ~ ${simEndDate} |\n| 步长 | ${stepValue} ${stepUnit} |\n| 批量大小 | ${batchSize} |`);
      if (Object.keys(inputParams).length) {
        lines.push(`\n**输入参数**\n\n| 变量 | 含义 | 值 |\n|------|------|-----|`);
        Object.entries(inputParams).forEach(([k, v]) => lines.push(`| \`${k}\` | ${allV[k]?.description || '—'} | ${v} |`));
      }
      lines.push('');
    }
    if (reportSections.has('variables')) {
      lines.push(`## 变量汇总\n\n| 变量名 | 含义 | 类型 | 初始值 | 最终值 | 单位 |\n|--------|------|------|--------|--------|------|`);
      Object.entries(allV).forEach(([name, d]: [string, any]) => {
        const fv = latestStep?.[name] != null ? Number(latestStep[name]).toFixed(3) : '—';
        lines.push(`| \`${name}\` | ${d.description || '—'}${citeStr(d.reference)} | ${d.type || '—'} | ${d.value ?? '—'} | ${fv} | ${d.unit || '—'} |`);
      });
      lines.push('');
    }
    if (reportSections.has('formulas')) {
      lines.push(`## 方程列表\n\n| 方程名 | 含义 | 条件 | 影响变量 |\n|--------|------|------|----------|`);
      Object.entries(formulas).forEach(([name, fd]: [string, any]) => {
        const cond = fd.condition && fd.condition !== true && fd.condition !== 'true' ? String(fd.condition) : '常驻';
        lines.push(`| \`${name}\` | ${fd.description || '—'}${citeStr(fd.reference)} | ${cond} | ${Object.keys(fd.dynamics || {}).join(', ') || '—'} |`);
      });
      lines.push('');
    }
    if (reportSections.has('plots') && hasData) {
      lines.push(`## Plot 曲线\n`);
      outputVars.forEach((varName, idx) => {
        const d = allV[varName] || {};
        const caption = [varName, d.description, d.unit ? `(${d.unit})` : ''].filter(Boolean).join('  ');
        lines.push(`\n**${caption}**\n`);
        const dataUrl = varToDataUrl(varName, idx, simulationData, fontSize);
        if (dataUrl) lines.push(`![${varName}](${dataUrl})\n`);
      });
      lines.push('');
    }
    if (reportSections.has('opt') && mode === 'opt') {
      lines.push(`## 优化配置\n`);
      if (objectives.length) { lines.push(`**目标函数**\n`); objectives.forEach(o => lines.push(`- ${o.direction === 'maximize' ? '最大化' : '最小化'} \`${o.variable}\``)); }
      if (constraints.length) { lines.push(`\n**约束条件**\n`); constraints.forEach(c2 => lines.push(`- \`${c2.variable}\` ${c2.op} ${c2.value}`)); }
      lines.push(`\n算法: ${optAlgo} · 种群: ${optPop} · 代数: ${optGen}\n`);
    }
    if (reportSections.has('refs') && allRefs.length > 0) {
      lines.push(`## 参考文献\n`);
      allRefs.forEach((ref, i) => lines.push(`[${i + 1}] ${ref}`));
      lines.push('');
    }
    return lines.join('\n');
  }

  function buildHtml(md: string): string {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rows = md.split('\n');
    const tableFont = fontSize * 13 / 14;
    const codeFont = fontSize * 12 / 14;
    let html = `<style>body{font-family:system-ui,sans-serif;font-size:${fontSize}px;max-width:900px;margin:40px auto;padding:0 20px;color:#1a2e22;line-height:1.6}` +
      'h1{color:#007A33;border-bottom:2px solid #007A33;padding-bottom:8px}h2{color:#007A33;margin-top:32px}' +
      `table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #dde5de;padding:6px 10px;text-align:left;font-size:${tableFont}px}` +
      `th{background:#f2f4f2;font-weight:700}code{background:#f2f4f2;padding:1px 4px;border-radius:3px;font-size:${codeFont}px}` +
      'blockquote{border-left:3px solid #b7eb8f;margin:0;padding-left:12px;color:#555}</style><body>';
    let inTable = false;
    rows.forEach(line => {
      if (line.startsWith('# '))       { if (inTable) { html += '</table>'; inTable = false; } html += `<h1>${esc(line.slice(2))}</h1>`; }
      else if (line.startsWith('## ')) { if (inTable) { html += '</table>'; inTable = false; } html += `<h2>${esc(line.slice(3))}</h2>`; }
      else if (line.startsWith('> '))  { html += `<blockquote>${esc(line.slice(2))}</blockquote>`; }
      else if (/^\*\*.*\*\*$/.test(line)) { html += `<p><strong>${esc(line.slice(2, -2))}</strong></p>`; }
      else if (/^!\[/.test(line)) {
        const m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
        if (m) html += `<img alt="${esc(m[1])}" src="${m[2]}" style="width:100%;max-width:680px;margin:4px 0;display:block">`;
      }
      else if (line.startsWith('- ')) { html += `<li>${line.slice(2).replace(/`([^`]+)`/g, (_, m) => `<code>${esc(m)}</code>`)}</li>`; }
      else if (line.startsWith('|')) {
        const cells = line.split('|').filter((_, i, a) => i > 0 && i < a.length - 1).map(c => c.trim());
        if (cells.every(c => /^[-:]+$/.test(c))) return;
        if (!inTable) { html += '<table>'; inTable = true; }
        html += '<tr>' + cells.map(c => `<td>${c.replace(/`([^`]+)`/g, (_, m) => `<code>${esc(m)}</code>`)}</td>`).join('') + '</tr>';
      } else { if (inTable) { html += '</table>'; inTable = false; } if (line.trim()) html += `<p>${line.replace(/`([^`]+)`/g, (_, m) => `<code>${esc(m)}</code>`)}</p>`; }
    });
    if (inTable) html += '</table>';
    return html + '</body>';
  }

  const canExport = reportSections.size > 0;
  const btnBase: React.CSSProperties = {
    padding: '6px 16px', borderRadius: 5, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)', fontWeight: 600,
    cursor: 'pointer', transition: 'opacity 0.15s',
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, padding: '10px 16px', borderBottom: `1px solid ${c.border}`, background: c.panel }}>
        <button onClick={() => { const w = window.open('', '_blank'); if (w) { w.document.write(buildHtml(buildMd())); w.document.close(); } }}
          disabled={!canExport} style={{ ...btnBase, border: `1px solid ${c.primary}`, background: 'transparent', color: c.primary, opacity: canExport ? 1 : 0.4 }}>
          ⬡ HTML 预览
        </button>
        <button
          onClick={() => {
            setReportGenerating(true);
            const blob = new Blob([buildMd()], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `report_${(meta.name || 'sim').replace(/\s+/g, '_')}_${Date.now()}.md`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            setTimeout(() => setReportGenerating(false), 500);
          }}
          disabled={!canExport || reportGenerating}
          style={{ ...btnBase, border: 'none', background: canExport ? c.primary : c.border, color: '#fff', opacity: canExport && !reportGenerating ? 1 : 0.4 }}>
          {reportGenerating ? '生成中…' : '↓ 导出 .md'}
        </button>
        <button
          onClick={() => {
            if (!hasData) return;
            const hasMC = dataPerRun.length > 1;
            const baseCols = Object.keys(simulationData[0]).filter(k => k !== 'step');
            const varCols = baseCols.filter(k => k !== 'time');
            const mcRunCols = hasMC ? varCols.flatMap(k => dataPerRun.map((_, i) => `${k}_run${i}`)) : [];
            const header = [...baseCols.map(k => { const desc = allV[k]?.description; return desc ? `${k}(${desc})` : k; }), ...mcRunCols].join(',');
            const rows = simulationData.map((row, idx) => {
              const base = baseCols.map(k => row[k] != null ? String(row[k]) : '').join(',');
              if (!hasMC) return base;
              return `${base},${varCols.flatMap(k => dataPerRun.map(rd => (rd[idx]?.[k] as number) ?? '')).join(',')}`;
            });
            const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `trajectory_${(meta.name || 'sim').replace(/\s+/g, '_')}_${Date.now()}.csv`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
          }}
          disabled={!hasData}
          style={{ ...btnBase, border: `1px solid ${c.border}`, background: 'transparent', color: hasData ? c.text : c.textMute, opacity: hasData ? 1 : 0.4 }}>
          ↓ 轨迹 .csv
        </button>
        <Tooltip title="DOCX 导出功能开发中">
          <button disabled style={{ ...btnBase, border: `1px solid ${c.border}`, background: 'transparent', color: c.textMute, cursor: 'not-allowed', opacity: 0.4 }}>
            ↓ 导出 .docx
          </button>
        </Tooltip>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', gap: 8, padding: '6px 8px' }}>
        <div style={{ width: 160, flexShrink: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.6429)', fontWeight: 700, color: c.textMute, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 4px 6px' }}>输出章节</div>
          {ALL_REPORT_SECTIONS.map(s => {
            const checked = reportSections.has(s.key);
            const disabledPlots = s.key === 'plots' && !hasData;
            const disabledOpt = s.key === 'opt' && mode !== 'opt';
            const isDisabled = disabledPlots || disabledOpt;
            const tooltipText = disabledPlots ? '需先完成仿真才能显示曲线' : disabledOpt ? '仅在优化模式下可用' : '';
            const row = (
              <label key={s.key} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                cursor: isDisabled ? 'not-allowed' : 'pointer', opacity: isDisabled ? 0.4 : 1,
                background: checked && !isDisabled ? (isDarkMode ? '#1a3a22' : '#e8f5e9') : c.panel,
                border: `1px solid ${checked && !isDisabled ? c.primary : c.border}`,
                borderRadius: 6, transition: 'all 0.12s',
              }}>
                <input type="checkbox" checked={checked} disabled={isDisabled}
                  onChange={() => {
                    setReportSections(p => { const s2 = new Set(p); s2.has(s.key) ? s2.delete(s.key) : s2.add(s.key); return s2; });
                    setOpenReportPreviews(p => { const s2 = new Set(p); checked ? s2.delete(s.key) : s2.add(s.key); return s2; });
                  }}
                  style={{ accentColor: c.primary, width: 12, height: 12, flexShrink: 0 }} />
                <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)', color: checked && !isDisabled ? c.primary : c.text }}>{s.label}</span>
              </label>
            );
            return tooltipText ? <Tooltip key={s.key} title={tooltipText} placement="right">{row}</Tooltip> : row;
          })}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {reportSections.size === 0 && (
            <div style={{ color: c.textMute, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)', padding: '32px 0', textAlign: 'center' }}>请在左侧勾选章节</div>
          )}
          {ALL_REPORT_SECTIONS.filter(s => reportSections.has(s.key)).map(s => {
            const isOpen = openReportPreviews.has(s.key);
            const badge = sectionBadge(s.key);
            return (
              <div key={s.key} style={{ border: `1px solid ${c.border}`, borderRadius: 6, overflow: 'hidden', background: c.panel, flexShrink: 0 }}>
                <div
                  onClick={() => setOpenReportPreviews(p => { const s2 = new Set(p); s2.has(s.key) ? s2.delete(s.key) : s2.add(s.key); return s2; })}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', background: isOpen ? c.sectionHd : 'transparent', userSelect: 'none' }}
                >
                  <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.6429)', color: c.textMute, transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'none', display: 'inline-block' }}>▶</span>
                  <span style={{ fontWeight: 600, fontSize: 'calc(var(--lm-font-size, 14px) * 0.8571)', color: c.text, flex: 1 }}>{s.label}</span>
                  {badge && <span style={{ fontSize: 'calc(var(--lm-font-size, 14px) * 0.7143)', color: c.primary, fontFamily: 'monospace', background: c.primary + '15', padding: '1px 7px', borderRadius: 8 }}>{badge}</span>}
                </div>
                {isOpen && (
                  <div style={{ padding: '10px 12px', borderTop: `1px solid ${c.border}` }}>
                    {renderSectionContent(s.key)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SimReportTab;
