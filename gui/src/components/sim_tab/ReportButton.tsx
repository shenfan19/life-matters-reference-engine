import React, { useState } from 'react';
import { Button, Dropdown, Tooltip } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { ModelFile, SimulationDataPoint, StepUnit } from '../../types';
import { descriptionText } from '../../core/modelUtils';
import { varToDataUrl } from './SimChart';

interface ReportButtonProps {
  selectedModel: ModelFile | null;
  outputVars: string[];
  formulas: Record<string, any>;
  simulationData: SimulationDataPoint[];
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
  optResult: any;
  optElapsed: number;
  optMethod: string;
  fontSize: number;
  t: (key: string, params?: Record<string, string | number>) => string;
  c: Record<string, string>;
}

export function ReportButton({
  selectedModel, outputVars, formulas, simulationData, inputParams,
  simStartDate, simEndDate, stepValue, stepUnit, batchSize,
  objectives, constraints, optAlgo, optPop, optGen,
  optResult, optElapsed, optMethod,
  fontSize, t, c,
}: ReportButtonProps) {
  const [generating, setGenerating] = useState(false);

  if (!selectedModel) return null;

  const meta: any = selectedModel?.content?.metadata ?? selectedModel?.content?.meta ?? {};
  const allV: Record<string, any> = selectedModel?.content?.variables || {};
  const refs: string[] = Array.isArray(meta?.references) ? meta.references : [];
  const metaDescText = descriptionText(meta.description);
  const hasData = simulationData.length > 0;
  const hasOptResult = !!(optResult?.best_f || optResult?.pareto_front?.length);

  const refStr = (ref: unknown, locator?: unknown): string => {
    const base = !ref ? '' : Array.isArray(ref) ? ref.filter(Boolean).join('; ') : String(ref);
    const loc = !locator ? '' : Array.isArray(locator) ? locator.filter(Boolean).join('; ') : String(locator);
    return base && loc ? `${base} (${loc})` : base;
  };

  const varTypeBadge = (type: string) => ({
    state: t('sim.var.type.state'), input: t('sim.var.type.input'),
    parameter: t('sim.var.type.parameter'), evidence: t('sim.var.type.evidence'),
  })[type] || type || '—';

  const formatElapsed = (s: number) => {
    const sec = Math.round(s);
    const m = Math.floor(sec / 60);
    const ss = String(sec % 60).padStart(2, '0');
    return `${m}:${ss}`;
  };

  function buildMd(): string {
    const lines: string[] = [];
    const ts = new Date().toISOString().slice(0, 10);
    lines.push(`# ${t('sim.report.md.title')}\n\n> ${t('sim.report.md.generated_at')}: ${ts}\n`);

    lines.push(`## ${t('sim.report.section.intro')}\n`);
    lines.push(`${metaDescText || t('sim.report.no_intro')}\n`);
    if (meta.tags?.length) lines.push(`${t('sim.report.tags')}${meta.tags.join('  ·  ')}\n`);

    lines.push(`## ${t('sim.tabs.variables')}\n`);
    lines.push(`| ${t('sim.intro.col.name')} | ${t('sim.intro.col.description')} | ${t('sim.intro.type')} | ${t('sim.intro.init_value')} | ${t('sim.intro.unit')} | ${t('sim.intro.col.reference')} |\n|------|------|------|------|------|------|`);
    Object.entries(allV).forEach(([name, d]: [string, any]) => {
      lines.push(`| \`${name}\` | ${d.description || '—'} | ${varTypeBadge(d.type)} | ${d.value ?? '—'} | ${d.unit || '—'} | ${refStr(d.reference, d.locator) || '—'} |`);
    });
    lines.push('');

    if (Object.keys(formulas).length > 0) {
      lines.push(`## ${t('sim.tabs.formulas')}\n`);
      lines.push(`| ${t('sim.intro.col.name')} | ${t('sim.intro.col.description')} | ${t('sim.intro.col.expression')} | ${t('sim.intro.col.condition')} | ${t('sim.intro.col.reference')} |\n|------|------|------|------|------|`);
      Object.entries(formulas).forEach(([name, fd]: [string, any]) => {
        const cond = fd.condition && fd.condition !== true && fd.condition !== 'true' ? String(fd.condition) : '—';
        const expr = typeof fd.dynamics === 'object' && fd.dynamics
          ? Object.entries(fd.dynamics).map(([v2, e]) => `${v2} = ${e}`).join('; ')
          : String(fd.dynamics ?? '');
        lines.push(`| \`${name}\` | ${fd.description || '—'} | ${expr || '—'} | ${cond} | ${refStr(fd.reference, fd.locator) || '—'} |`);
      });
      lines.push('');
    }

    if (refs.length > 0) {
      lines.push(`## ${t('sim.report.section.refs')}\n`);
      refs.forEach((r, i) => lines.push(`[${i + 1}] ${r}`));
      lines.push('');
    }

    lines.push(`## ${t('sim.report.section.simcfg')}\n\n| ${t('sim.report.md.param_col')} | ${t('sim.report.md.value_col')} |\n|------|-----|`);
    lines.push(`| ${t('sim.report.md.time_range_field')} | ${simStartDate} ~ ${simEndDate} |\n| ${t('sim.report.md.step_field')} | ${stepValue} ${stepUnit} |\n| ${t('sim.report.md.batch_field')} | ${batchSize} |`);
    if (Object.keys(inputParams).length) {
      lines.push(`\n${t('sim.report.md.input_params_hd')}\n\n| ${t('sim.report.simcfg.variable')} | ${t('sim.report.simcfg.meaning')} | ${t('sim.report.simcfg.value')} |\n|------|------|-----|`);
      Object.entries(inputParams).forEach(([k, v]) => lines.push(`| \`${k}\` | ${allV[k]?.description || '—'} | ${v} |`));
    }
    lines.push('');

    lines.push(`## ${t('sim.report.section.sim_result')}\n`);
    if (!hasData) {
      lines.push(`${t('sim.report.no_data')}\n`);
    } else {
      outputVars.forEach((varName, idx) => {
        const d = allV[varName] || {};
        const caption = [varName, d.description, d.unit ? `(${d.unit})` : ''].filter(Boolean).join('  ');
        lines.push(`\n**${caption}**\n`);
        const dataUrl = varToDataUrl(varName, idx, simulationData, fontSize);
        if (dataUrl) lines.push(`![${varName}](${dataUrl})\n`);
      });
      lines.push('');
    }

    if (objectives.length > 0 || constraints.length > 0) {
      lines.push(`## ${t('sim.report.md.opt_title')}\n`);
      if (objectives.length) { lines.push(`${t('sim.report.md.objectives_hd')}\n`); objectives.forEach(o => lines.push(`- ${o.direction === 'maximize' ? t('sim.report.md.maximize') : t('sim.report.md.minimize')} \`${o.variable}\``)); }
      if (constraints.length) { lines.push(`\n${t('sim.report.md.constraints_hd')}\n`); constraints.forEach(con => lines.push(`- \`${con.variable}\` ${con.op} ${con.value}`)); }
      lines.push(`\n${t('sim.report.md.algo_line', { algo: optAlgo, pop: optPop, gen: optGen })}\n`);
    }

    if (hasOptResult) {
      lines.push(`## ${t('sim.report.md.opt_result_title')}\n`);
      lines.push(`| ${t('sim.report.md.field_col')} | ${t('sim.report.md.value_col')} |\n|------|-----|`);
      lines.push(`| ${t('sim.report.opt_result.method_label')} | ${optResult.method || optMethod || '—'} |`);
      lines.push(`| ${t('sim.report.opt_result.n_solutions_label')} | ${optResult.n_solutions ?? optResult.pareto_front?.length ?? 0} |`);
      lines.push(`| ${t('sim.report.opt_result.elapsed_label')} | ${formatElapsed(optElapsed)} |`);
      const objNames = (optResult.objectives || objectives || []) as Array<{ variable: string; direction: string }>;
      (optResult.best_f || []).forEach((v: number, i: number) => {
        const o = objNames[i];
        const dir = o?.direction === 'maximize' ? t('sim.report.md.maximize') : t('sim.report.md.minimize');
        lines.push(`| \`${o?.variable ?? `f${i}`}\` (${dir}) | ${v} |`);
      });
      if (optResult.best_x?.length) {
        lines.push(`| ${t('sim.report.opt_result.decision_vars_label')} | ${(optResult.best_x as number[]).map((v, i) => `x${i}=${v}`).join(', ')} |`);
      }
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
        const cells = line.split('|').filter((_, i, a) => i > 0 && i < a.length - 1).map(cell => cell.trim());
        if (cells.every(cell => /^[-:]+$/.test(cell))) return;
        if (!inTable) { html += '<table>'; inTable = true; }
        html += '<tr>' + cells.map(cell => `<td>${cell.replace(/`([^`]+)`/g, (_, m) => `<code>${esc(m)}</code>`)}</td>`).join('') + '</tr>';
      } else { if (inTable) { html += '</table>'; inTable = false; } if (line.trim()) html += `<p>${line.replace(/`([^`]+)`/g, (_, m) => `<code>${esc(m)}</code>`)}</p>`; }
    });
    if (inTable) html += '</table>';
    return html + '</body>';
  }

  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: [
          { key: 'html', label: t('sim.report.html_preview') },
          { key: 'md', label: generating ? t('sim.report.generating') : t('sim.report.export_md'), disabled: generating },
          { key: 'docx', label: <Tooltip title={t('sim.report.docx_wip')}><span>{t('sim.report.export_docx')}</span></Tooltip>, disabled: true },
          { key: 'pdf', label: <Tooltip title={t('sim.report.pdf_wip')}><span>{t('sim.report.export_pdf')}</span></Tooltip>, disabled: true },
        ],
        onClick: ({ key }) => {
          if (key === 'html') {
            const w = window.open('', '_blank');
            if (w) { w.document.write(buildHtml(buildMd())); w.document.close(); }
          } else if (key === 'md') {
            setGenerating(true);
            const blob = new Blob([buildMd()], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `report_${(meta.name || 'sim').replace(/\s+/g, '_')}_${Date.now()}.md`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            setTimeout(() => setGenerating(false), 500);
          }
        },
      }}
    >
      <Button size="small" icon={<DownloadOutlined />} style={{ whiteSpace: 'nowrap', color: c.textSec }}>
        {t('sim.report.export_label')}
      </Button>
    </Dropdown>
  );
}
