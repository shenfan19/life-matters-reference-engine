// Scenario Converter — redesigned UI
// Style: compact professional, monospace variable names, green-accent palette

const { Select, message } = antd;

// ── Type registry ───────────────────────────────────────────────────────────

const TYPE_DEFS = [
  { v: 'Type1',   label: 'Type 1 · 常数流',     bg: '#f6ffed', fg: '#237804' },
  { v: 'Type2',   label: 'Type 2 · 状态乘数',   bg: '#fff7e6', fg: '#ad4e00' },
  { v: 'Type3',   label: 'Type 3 · 累积状态',   bg: '#f9f0ff', fg: '#531dab' },
  { v: 'Type4',   label: 'Type 4 · 阈值触发',   bg: '#fffbe6', fg: '#874d00' },
  { v: 'Type5',   label: 'Type 5 · 概率随机',   bg: '#fff0f6', fg: '#9e1068' },
  { v: 'Type6',   label: 'Type 6 · ODE 系统',   bg: '#e6f4ff', fg: '#003eb3' },
  { v: 'D1',      label: 'D1 · 空间方程',        bg: '#fff1f0', fg: '#a8071a' },
  { v: 'D2',      label: 'D2 · 高维耦合',        bg: '#fff1f0', fg: '#a8071a' },
  { v: 'D3',      label: 'D3 · 连续随机',        bg: '#fff1f0', fg: '#a8071a' },
  { v: 'derived', label: '派生值 · 跳过',        bg: '#f5f5f5', fg: '#8c8c8c' },
];
const TYPE_MAP = Object.fromEntries(TYPE_DEFS.map(t => [t.v, t]));

function TypeBadge({ type, small = false }) {
  const t = TYPE_MAP[type] || { bg: '#f5f5f5', fg: '#8c8c8c', label: type || '?' };
  return (
    <span style={{
      display: 'inline-block', fontSize: small ? 9 : 10,
      padding: small ? '1px 4px' : '1px 7px',
      borderRadius: 3, fontFamily: 'monospace', fontWeight: 700,
      background: t.bg, color: t.fg, whiteSpace: 'nowrap',
    }}>
      {small ? (type || '?') : t.label}
    </span>
  );
}

// ── Auto type detection (frontend heuristic) ────────────────────────────────

function detectType(fname, fdef) {
  const cond = fdef.condition;
  const dynamics = fdef.dynamics || {};
  const priority = fdef.priority || 5;
  const expr = Object.values(dynamics).join(' ');

  if (priority <= 2 && (cond === true || cond === 'true')) return 'derived';
  if (typeof cond === 'string' && !['true', 'false'].includes(cond.toLowerCase())) return 'Type4';
  if (/wiener|brownian|noise|stochastic/i.test(expr)) return 'D3';
  if (/nabla|laplacian|pde|spatial/i.test(expr)) return 'D1';
  if (/step_size/.test(expr)) {
    // Sub-classify: Type1 if the bracketed term has no variable dependency
    const inner = (expr.match(/\((.+?)\)\s*\*\s*step_size/) || [])[1] || '';
    if (inner && !/[a-z_]{3,}/.test(inner)) return 'Type1';
    return 'Type6';
  }
  return 'Type6';
}

// ── Styles ──────────────────────────────────────────────────────────────────

const C = {
  bg:      '#f2f4f2',
  panel:   '#ffffff',
  border:  '#dde5de',
  text:    '#1a2a1e',
  textSec: '#3d5447',
  mute:    'rgba(0,0,0,0.32)',
  primary: '#007A33',
  head: {
    fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
    textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)',
  },
};

const panelStyle = {
  background: C.panel, border: `1px solid ${C.border}`,
  borderRadius: 8, padding: '14px 16px',
};

function SectionHead({ children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
      <span style={C.head}>{children}</span>
      {action && <span style={{ marginLeft: 'auto' }}>{action}</span>}
    </div>
  );
}

function Td({ children, mono, mute, style: s }) {
  return (
    <td style={{
      padding: '5px 8px 5px 0', verticalAlign: 'middle',
      fontFamily: mono ? 'monospace' : 'inherit',
      fontSize: mono ? 11 : 12,
      color: mute ? C.mute : C.text,
      ...s,
    }}>
      {children}
    </td>
  );
}

function Th({ children }) {
  return (
    <th style={{
      padding: '0 8px 6px 0', textAlign: 'left',
      fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: C.mute,
    }}>
      {children}
    </th>
  );
}

const rowBorder = { borderTop: `1px solid ${C.border}` };

function NativeSelect({ value, onChange, disabled, options, style: s }) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      disabled={disabled}
      style={{
        fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 3,
        padding: '2px 5px', background: disabled ? '#f5f5f5' : C.panel,
        color: disabled ? C.mute : C.text, cursor: disabled ? 'default' : 'pointer',
        ...s,
      }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function Checkbox({ checked, onChange, accent }) {
  return (
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
      style={{ cursor: 'pointer', accentColor: accent || C.primary, width: 13, height: 13 }} />
  );
}

function SmallInput({ value, onChange, placeholder, type = 'text', width, mono }) {
  return (
    <input
      type={type} value={value ?? ''} placeholder={placeholder}
      onChange={e => onChange(type === 'number' ? (e.target.value ? Number(e.target.value) : null) : e.target.value)}
      style={{
        fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 3,
        padding: '3px 7px', width: width || 'auto', fontFamily: mono ? 'monospace' : 'inherit',
        background: C.panel, color: C.text, outline: 'none',
      }}
    />
  );
}

// ── Main component ───────────────────────────────────────────────────────────

const PluginComponent = () => {
  const [modelFiles, setModelFiles] = React.useState([]);
  const [modelPath, setModelPath]   = React.useState(null);
  const [model,     setModel]       = React.useState(null);

  // per-variable config
  const [varCfg,  setVarCfg]  = React.useState({});
  // per-formula config
  const [fmlCfg,  setFmlCfg]  = React.useState({});
  // win/lose conditions
  const [conds,   setConds]   = React.useState([]);
  // game params
  const [gCfg,    setGCfg]    = React.useState({ turns: '', ap: 3, sid: '' });

  const [converting, setConverting] = React.useState(false);
  const [result,     setResult]     = React.useState(null);

  // Load model file list
  React.useEffect(() => {
    fetch('/api/files').then(r => r.json()).then(d => {
      if (!d.success) return;
      const list = [];
      const scan = ns => ns.forEach(n => {
        if (n.type === 'file' && n.key?.includes('scenarios/') &&
            !n.key?.endsWith('game_story.yaml') &&
            (n.key?.endsWith('.yaml') || n.key?.endsWith('.yml')))
          list.push({ value: n.key, label: n.key });
        if (n.children) scan(n.children);
      });
      d.data.forEach(n => scan(n.children ?? [n]));
      setModelFiles(list);
    }).catch(() => {});
  }, []);

  // Load + initialise configs when model selected
  const loadModel = async path => {
    setModelPath(path);
    setModel(null); setResult(null);
    try {
      const clean = path.replace(/^mods\//, '');
      const d = await fetch(`/api/file/${clean}`).then(r => r.json());
      if (!d.success || !d.data?.content) return;
      const m = d.data.content;
      setModel(m);
      initCfg(m);
    } catch {}
  };

  const initCfg = m => {
    const vars  = m.variables || {};
    const forms = m.formulas  || {};
    const opt   = m.optimizer || {};
    const targets = new Set(opt.targets_of_optimization || []);

    // Variable configs
    const vc = {};
    Object.entries(vars).forEach(([k, v]) => {
      vc[k] = {
        srcType:     v.type || 'state',
        role:        v.type === 'state' ? 'game' : v.type === 'input' ? 'input' : 'param',
        asCard:      v.type === 'input' && v.optimizable !== false,
        asIndicator: v.type === 'state',
      };
    });
    setVarCfg(vc);

    // Formula configs
    const fc = {};
    Object.entries(forms).forEach(([fn, fd]) => {
      const dt = detectType(fn, fd);
      const cRaw = fd.condition;
      const condStr = (typeof cRaw === 'string' && !['true','false'].includes(cRaw.toLowerCase()))
        ? cRaw : null;
      fc[fn] = {
        detectedType:  dt,
        overrideType:  '',
        enabled:       dt !== 'derived',
        affectedVars:  Object.keys(fd.dynamics || {}),
        conditionInfo: condStr,
        description:   (fd.description || '').slice(0, 80),
      };
    });
    setFmlCfg(fc);

    // Default conditions from state vars
    const stateKeys = Object.entries(vars)
      .filter(([, v]) => v.type === 'state').map(([k]) => k);
    const dc = [];
    stateKeys.slice(0, 4).forEach((k, i) => {
      dc.push({ id: `d${i}`, variable: k, op: '<=', threshold: 15, outcome: 'lose',
                message: `${k}过低，游戏失败。` });
    });
    if (stateKeys.length) {
      const primary = (opt.targets_of_optimization || [])[0] || stateKeys[0];
      dc.push({ id: 'dw', variable: primary, op: '>=', threshold: 75, outcome: 'win',
                message: `${primary}达到目标水平，成功！` });
    }
    setConds(dc);
    setGCfg({ turns: '', ap: 3, sid: '' });
  };

  // Which vars are auto-disabled by formula toggles
  const varAutoDim = React.useMemo(() => {
    if (!model) return {};
    const varFormulas = {};
    Object.entries(fmlCfg).forEach(([fn, fc]) => {
      fc.affectedVars.forEach(vk => {
        if (!varFormulas[vk]) varFormulas[vk] = [];
        varFormulas[vk].push(fn);
      });
    });
    const out = {};
    Object.entries(varFormulas).forEach(([vk, fns]) => {
      out[vk] = fns.length > 0 && fns.every(fn => fmlCfg[fn] && !fmlCfg[fn].enabled);
    });
    return out;
  }, [model, fmlCfg]);

  const setVc = (k, field, val) =>
    setVarCfg(p => ({ ...p, [k]: { ...p[k], [field]: val } }));
  const setFc = (fn, field, val) =>
    setFmlCfg(p => ({ ...p, [fn]: { ...p[fn], [field]: val } }));
  const setCond = (id, field, val) =>
    setConds(p => p.map(c => c.id === id ? { ...c, [field]: val } : c));

  const indicatorVars = Object.entries(varCfg)
    .filter(([, v]) => v.asIndicator && v.srcType !== 'parameter')
    .map(([k]) => k);

  const handleConvert = async () => {
    if (!modelPath) { message.warning('请先选择模型文件'); return; }
    setConverting(true); setResult(null);
    try {
      const r = await window.pluginAPI.callBackend('run', {
        model_path:     modelPath.replace(/^mods\//, ''),
        var_config:     varCfg,
        formula_config: fmlCfg,
        conditions:     conds,
        turns:          gCfg.turns ? Number(gCfg.turns) : undefined,
        ap_per_turn:    gCfg.ap,
        scenario_id:    gCfg.sid || undefined,
      });
      if (r.success) { setResult(r); message.success('转换成功'); }
      else           { message.error('失败: ' + r.error); }
    } catch (e) { message.error('请求失败'); }
    finally { setConverting(false); }
  };

  // ── Derived display data ─────────────────────────────────────────────────
  const meta     = model?.metadata ?? model?.meta ?? {};
  const allVars  = model ? Object.entries(model.variables  || {}) : [];
  const allForms = model ? Object.entries(model.formulas   || {}) : [];

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: 20, color: C.text, fontSize: 13 }}>

      {/* ── Title ── */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Georgia, serif', color: C.text, marginBottom: 2 }}>
          Scenario → Game Converter
        </div>
        <div style={{ fontSize: 10, fontFamily: 'monospace', color: C.mute, letterSpacing: '0.05em' }}>
          Model YAML → game_story.yaml · Type 1–6 / D1–D3 分类
        </div>
      </div>

      {/* ── Model selector ── */}
      <div style={{ ...panelStyle, marginBottom: 12 }}>
        <SectionHead>模型文件</SectionHead>
        <Select
          placeholder="选择 mods/models/…/*.yaml"
          style={{ width: '100%' }}
          options={modelFiles}
          onChange={loadModel}
          showSearch size="small"
          filterOption={(q, o) => (o?.label ?? '').includes(q)}
        />
        {meta.name && (
          <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{meta.name}</span>
            {(meta.tags || []).map(t => (
              <span key={t} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8,
                border: `1px solid ${C.border}`, color: C.mute }}>{t}</span>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: C.mute, fontFamily: 'monospace' }}>
              step_size={model?.simulator?.step_size} · total={model?.simulator?.total_time}
            </span>
          </div>
        )}
        {meta.description && (
          <div style={{ marginTop: 5, fontSize: 11, color: C.mute, lineHeight: 1.5 }}>
            {(meta.description || '').trim().slice(0, 200)}
          </div>
        )}
      </div>

      {model && (
        <>
          {/* ── Variables + Formulas (two columns) ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>

            {/* Variables */}
            <div style={panelStyle}>
              <SectionHead>变量配置</SectionHead>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <Th>变量名</Th>
                    <Th>类型</Th>
                    <Th>角色 / 卡牌</Th>
                    <Th>
                      <span title="可用作胜负条件的指标">指标 ★</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {allVars.map(([k, v]) => {
                    const vc  = varCfg[k] || {};
                    const dim = varAutoDim[k];
                    const sType = vc.srcType || v.type || 'state';
                    const typeColor = sType === 'state' ? '#007A33'
                      : sType === 'input' ? '#096dd9' : '#8c8c8c';
                    return (
                      <tr key={k} style={{ ...rowBorder, opacity: dim ? 0.3 : 1, transition: 'opacity 0.2s' }}>
                        <Td mono>
                          <div>{k}</div>
                          {v.unit && <div style={{ fontSize: 9, color: C.mute }}>{v.unit}</div>}
                        </Td>
                        <Td>
                          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 700,
                            background: typeColor + '1a', color: typeColor }}>
                            {sType}
                          </span>
                        </Td>
                        <Td>
                          {sType === 'state' && (
                            <NativeSelect
                              value={vc.role || 'game'}
                              onChange={val => setVc(k, 'role', val)}
                              disabled={dim}
                              options={[
                                { value: 'game',    label: '游戏变量' },
                                { value: 'observe', label: '仅观察' },
                                { value: 'exclude', label: '排除' },
                              ]}
                            />
                          )}
                          {sType === 'input' && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, color: C.textSec }}>
                              <Checkbox checked={vc.asCard !== false} onChange={v => setVc(k, 'asCard', v)} />
                              生成卡牌
                            </label>
                          )}
                          {sType === 'parameter' && (
                            <span style={{ fontSize: 10, color: C.mute }}>参数（忽略）</span>
                          )}
                        </Td>
                        <Td style={{ textAlign: 'center' }}>
                          {sType !== 'parameter' && !dim && (
                            <Checkbox
                              checked={vc.asIndicator !== false}
                              onChange={v => setVc(k, 'asIndicator', v)}
                              accent="#faad14"
                            />
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Formulas */}
            <div style={panelStyle}>
              <SectionHead>方程配置</SectionHead>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <Th>方程名 · 影响变量</Th>
                    <Th>自动识别</Th>
                    <Th>手动覆盖</Th>
                    <Th>启用</Th>
                  </tr>
                </thead>
                <tbody>
                  {allForms.map(([fn, fd]) => {
                    const fc  = fmlCfg[fn] || {};
                    const dt  = fc.detectedType || 'Type6';
                    const eff = fc.overrideType || dt;
                    const on  = fc.enabled !== false;
                    return (
                      <tr key={fn} style={{ ...rowBorder, opacity: on ? 1 : 0.3, transition: 'opacity 0.2s' }}>
                        <Td mono>
                          <div style={{ fontWeight: 600 }}>{fn}</div>
                          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 2 }}>
                            {(fc.affectedVars || []).map(v => (
                              <span key={v} style={{ fontSize: 9, color: C.mute, fontFamily: 'monospace' }}>→{v}</span>
                            ))}
                          </div>
                          {fc.conditionInfo && (
                            <div style={{ fontSize: 9, color: '#874d00', fontFamily: 'monospace', marginTop: 2 }}>
                              if {fc.conditionInfo}
                            </div>
                          )}
                        </Td>
                        <Td>
                          <TypeBadge type={dt} small />
                        </Td>
                        <Td>
                          <NativeSelect
                            value={fc.overrideType || ''}
                            onChange={val => setFc(fn, 'overrideType', val)}
                            disabled={!on}
                            options={[
                              { value: '', label: '─ 自动' },
                              ...TYPE_DEFS.map(t => ({ value: t.v, label: t.v })),
                            ]}
                            style={{ minWidth: 80 }}
                          />
                        </Td>
                        <Td style={{ textAlign: 'center' }}>
                          <Checkbox checked={on} onChange={v => setFc(fn, 'enabled', v)} />
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Conditions ── */}
          <div style={{ ...panelStyle, marginBottom: 12 }}>
            <SectionHead
              action={
                <button
                  onClick={() => setConds(p => [...p, {
                    id: `c${Date.now()}`, variable: indicatorVars[0] || '',
                    op: '<=', threshold: 20, outcome: 'lose', message: '',
                  }])}
                  style={{ fontSize: 10, padding: '2px 10px', background: C.primary,
                    color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                >
                  + 添加
                </button>
              }
            >
              胜负条件 &nbsp;
              <span style={{ fontWeight: 400, color: C.mute, textTransform: 'none', letterSpacing: 0, fontSize: 9 }}>
                阈值为游戏单位 0–100
              </span>
            </SectionHead>

            {conds.length === 0 ? (
              <div style={{ fontSize: 11, color: C.mute, textAlign: 'center', padding: '10px 0' }}>
                暂无 — 将使用自动生成的默认条件
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {conds.map(cd => (
                  <div key={cd.id} style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                    {/* WIN / LOSE */}
                    <select
                      value={cd.outcome}
                      onChange={e => setCond(cd.id, 'outcome', e.target.value)}
                      style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px',
                        border: `1px solid ${C.border}`, borderRadius: 3,
                        background: cd.outcome === 'win' ? '#f6ffed' : '#fff1f0',
                        color:      cd.outcome === 'win' ? '#237804'  : '#a8071a',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="win">WIN</option>
                      <option value="lose">LOSE</option>
                    </select>

                    {/* Variable */}
                    <select
                      value={cd.variable}
                      onChange={e => setCond(cd.id, 'variable', e.target.value)}
                      style={{ fontSize: 11, fontFamily: 'monospace', padding: '2px 5px',
                        border: `1px solid ${C.border}`, borderRadius: 3, background: C.panel }}
                    >
                      {indicatorVars.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>

                    {/* Operator */}
                    <select
                      value={cd.op}
                      onChange={e => setCond(cd.id, 'op', e.target.value)}
                      style={{ fontSize: 11, fontFamily: 'monospace', padding: '2px 5px', width: 42,
                        border: `1px solid ${C.border}`, borderRadius: 3, background: C.panel }}
                    >
                      <option value=">=">≥</option>
                      <option value="<=">≤</option>
                      <option value=">"> ></option>
                      <option value="<"> &lt;</option>
                    </select>

                    {/* Threshold */}
                    <input
                      type="number" min={0} max={100} value={cd.threshold}
                      onChange={e => setCond(cd.id, 'threshold', Number(e.target.value))}
                      style={{ fontSize: 11, fontFamily: 'monospace', width: 52, padding: '2px 6px',
                        border: `1px solid ${C.border}`, borderRadius: 3, background: C.panel }}
                    />

                    {/* Message */}
                    <input
                      type="text" value={cd.message} placeholder="结局消息…"
                      onChange={e => setCond(cd.id, 'message', e.target.value)}
                      style={{ flex: 1, fontSize: 11, padding: '2px 8px',
                        border: `1px solid ${C.border}`, borderRadius: 3, background: C.panel }}
                    />

                    {/* Delete */}
                    <button
                      onClick={() => setConds(p => p.filter(c => c.id !== cd.id))}
                      style={{ fontSize: 13, lineHeight: 1, padding: '1px 7px', background: 'none',
                        border: `1px solid ${C.border}`, borderRadius: 3, cursor: 'pointer', color: C.mute }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Game config + Convert ── */}
          <div style={{ ...panelStyle, display: 'flex', gap: 20, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <SectionHead>游戏配置</SectionHead>
              <div style={{ display: 'flex', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 9, color: C.mute, marginBottom: 4 }}>游戏回合数</div>
                  <SmallInput value={gCfg.turns} type="number" placeholder="auto"
                    onChange={v => setGCfg(p => ({ ...p, turns: v }))} width={64} mono />
                </div>
                <div>
                  <div style={{ fontSize: 9, color: C.mute, marginBottom: 4 }}>AP / 回合</div>
                  <SmallInput value={gCfg.ap} type="number"
                    onChange={v => setGCfg(p => ({ ...p, ap: v || 3 }))} width={46} mono />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, color: C.mute, marginBottom: 4 }}>场景 ID（留空自动）</div>
                  <SmallInput value={gCfg.sid} placeholder="auto"
                    onChange={v => setGCfg(p => ({ ...p, sid: v }))} width="100%" mono />
                </div>
              </div>
            </div>

            <button
              onClick={handleConvert}
              disabled={converting}
              style={{
                padding: '9px 30px', background: converting ? '#aaa' : C.primary,
                color: '#fff', border: 'none', borderRadius: 6,
                fontSize: 13, fontWeight: 600,
                cursor: converting ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s', flexShrink: 0,
              }}
            >
              {converting ? '转换中…' : '▶ 生成 game_story.yaml'}
            </button>
          </div>

          {/* ── Result ── */}
          {result && (
            <div style={{
              marginTop: 12, background: '#f6ffed',
              border: '1px solid #b7eb8f', borderRadius: 8, padding: '12px 16px',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#135200', marginBottom: 3 }}>
                转换成功
              </div>
              <div style={{ fontSize: 11, color: '#237804', fontFamily: 'monospace' }}>
                {result.message}
              </div>
              {(result.converter_notes || []).length > 0 && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#614700' }}>
                  <div style={{ fontWeight: 700, marginBottom: 3 }}>注意事项</div>
                  {result.converter_notes.map((n, i) => (
                    <div key={i} style={{ paddingLeft: 10, lineHeight: 1.6 }}>· {n}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
