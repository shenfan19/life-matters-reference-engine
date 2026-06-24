// useExportImport.ts — custom hook for sim-run CSV import/export (overlay comparison)
//
// Owns: importedSimRuns, simRunCounterRef
// Receives: selectedModel + date range + current run data + comparedPlans + t
// Returns: importedSimRuns, importSimCSV, removeImportedRun, handleExportSimCSV, simRunCounterRef

import { useRef, useState } from 'react';
import { message } from 'antd';
import { zip as fflateZip } from 'fflate';
import type { ModelFile, PlanResult, SimulationDataPoint } from '../../types';
import { PLAN_COLORS } from '../sim_tab/simUtils';

export type ImportedSimRun = { key: string; label: string; color: string; data: any[] };

interface UseExportImportParams {
  selectedModel: ModelFile | null;
  simStartDate: string;
  simEndDate: string;
  simulationData: SimulationDataPoint[];
  dataPerRun: SimulationDataPoint[][];
  comparedPlans: PlanResult[];
  t: (key: string, params?: Record<string, string | number>) => string;
}

export function useExportImport({
  selectedModel, simStartDate, simEndDate,
  simulationData, dataPerRun, comparedPlans,
  t,
}: UseExportImportParams) {
  const [importedSimRuns, setImportedSimRuns] = useState<ImportedSimRun[]>([]);
  // Tracks total runs created so colors don't repeat within a session
  const simRunCounterRef = useRef(0);

  const importSimCSV = (csvText: string, fileName: string) => {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) { message.warning(t('sim.msg.csv_empty')); return; }
    const headers = lines[0].split(',').map((h: string) => h.trim());
    const data: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map((v: string) => v.trim());
      if (row.length < headers.length) continue;
      const point: any = {};
      headers.forEach((h: string, idx: number) => { point[h] = parseFloat(row[idx]); });
      data.push(point);
    }
    if (!data.length) { message.warning(t('sim.msg.csv_no_data')); return; }
    const label = fileName.replace(/\.csv$/i, '') || t('sim.import.default_label', { n: simRunCounterRef.current + 1 });
    const color = PLAN_COLORS[simRunCounterRef.current % PLAN_COLORS.length];
    simRunCounterRef.current += 1;
    const key = `imported-${Date.now()}`;
    setImportedSimRuns(prev => [...prev, { key, label, color, data }]);
    message.success(t('sim.msg.sim_uploaded', { label, n: data.length }));
  };

  const removeImportedRun = (key: string) => {
    setImportedSimRuns(prev => prev.filter(r => r.key !== key));
  };

  // ── export all plans to CSV / zip ────────────────────────────────────────────
  const handleExportSimCSV = () => {
    const modelName = (selectedModel?.content?.metadata?.name || 'sim').replace(/\s+/g, '_');
    const baseName = `${modelName}_${simStartDate}_${simEndDate}`;

    // Build combined plan list (mirrors what SimPlotTab receives as comparedPlans)
    const allPlans = [
      ...(simulationData.length > 0 && importedSimRuns.length > 0
        ? [{ id: 'current-sim', label: t('sim.tab.current'), data: simulationData as any[], runsData: dataPerRun }]
        : []),
      ...comparedPlans.map(p => ({ id: p.id, label: p.label, data: p.data as any[], runsData: p.runsData })),
      ...importedSimRuns.map(r => ({ id: r.key, label: r.label, data: r.data, runsData: [] as any[][] })),
    ];
    const plansWithData = allPlans.filter(p => p.data.length > 0);

    // Single sim (no overlays): wide-format CSV with all variable columns
    if (plansWithData.length === 0) {
      if (!simulationData.length) return;
      const keys = Object.keys(simulationData[0]);
      const rows = simulationData.map(row => keys.map(k => String((row as any)[k] ?? '')).join(','));
      const csv = [keys.join(','), ...rows].join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url; a.download = `${baseName}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      message.success(t('sim.msg.dl_sim_done', { n: simulationData.length }));
      return;
    }

    // Multi-plan: zip with one CSV per variable, each CSV has all plan columns
    const ref = plansWithData[0];
    const varNames = Object.keys(ref.data[0] || {}).filter(k => k !== 'step' && k !== 'time');
    if (!varNames.length) return;
    const planLabels = plansWithData.map(p => p.label);
    const encoder = new TextEncoder();
    const zipFiles: Record<string, Uint8Array> = {};
    for (const varName of varNames) {
      const header = ['time_s', 'time_h', ...planLabels].join(',');
      const rows = ref.data.map((d: any, idx: number) => {
        const ts = d.time ?? 0;
        const vals = plansWithData.map(p => String((p.data[idx]?.[varName] as number) ?? ''));
        return [String(ts), (ts / 3600).toFixed(4), ...vals].join(',');
      });
      zipFiles[`${varName}.csv`] = encoder.encode([header, ...rows].join('\n'));
    }
    fflateZip(zipFiles, { level: 6 }, (err, data) => {
      if (err) { message.error(t('sim.msg.export_failed')); return; }
      const blob = new Blob([data], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${baseName}.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      message.success(t('sim.msg.dl_sim_done', { n: ref.data.length }));
    });
  };

  return {
    importedSimRuns, setImportedSimRuns, simRunCounterRef,
    importSimCSV, removeImportedRun, handleExportSimCSV,
  };
}
