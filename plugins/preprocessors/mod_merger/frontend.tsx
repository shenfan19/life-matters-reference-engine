const {
    Card, Tree, Descriptions, Tag, Button, Space, Input, InputNumber, Select,
    message, Spin, Tabs, Empty, Modal, Form, Alert, Checkbox, Divider, Radio
} = antd;

const API_BASE = '';
const DT_UNITS = ['second', 'minute', 'hour', 'day', 'week', 'month', 'year'];

const PluginComponent = () => {
    const [modelTree, setModelTree] = useState([]);
    const [storyTree, setStoryTree] = useState([]);
    const [expandedKeys, setExpandedKeys] = useState(['mods', 'models', 'scenarios']);
    const [modelViewMode, setModelViewMode] = useState('tree');
    const [storyViewMode, setStoryViewMode] = useState('tree');
    const [modelFilter, setModelFilter] = useState('');
    const [storyFilter, setStoryFilter] = useState('');
    const [checkedModelKeys, setCheckedModelKeys] = useState([]);
    const [manualCheckedModelKeys, setManualCheckedModelKeys] = useState([]);
    const [checkedStoryKeys, setCheckedStoryKeys] = useState([]);
    const [loadedMods, setLoadedMods] = useState({});
    const [loading, setLoading] = useState(false);
    const [selectedModel, setSelectedModel] = useState(null);

    // Inline alert (replaces all modals for operation results)
    const [opAlert, setOpAlert] = useState(null); // { type, message, description }
    const [highlightPatch, setHighlightPatch] = useState(false);

    // Simulation Set panel
    const [simSettings, setSimSettings] = useState({ step_size: 1, total_time: 1440, dt_unit: 'minute' });
    const [selectedSimKey, setSelectedSimKey] = useState(null);

    // Build modal
    const [buildModalVisible, setBuildModalVisible] = useState(false);
    const [buildForm] = Form.useForm();

    // Split modal (input form stays as modal; result shown inline)
    const [splitModalVisible, setSplitModalVisible] = useState(false);
    const [splitForm] = Form.useForm();

    const allCheckedKeys = [...checkedModelKeys, ...checkedStoryKeys];
    const selectedMods = allCheckedKeys.map(k => loadedMods[k]).filter(Boolean);

    // Scenarios that have simulator info (from checked stories)
    const scenariosWithSim = checkedStoryKeys
        .map(k => loadedMods[String(k)])
        .filter(m => m && m.simulator && Object.keys(m.simulator).length > 0);

    // Auto-select first sim-scenario when available
    useEffect(() => {
        if (scenariosWithSim.length > 0) {
            const firstKey = scenariosWithSim[0].key;
            if (!selectedSimKey || !scenariosWithSim.find(m => m.key === selectedSimKey)) {
                handleSimScenarioChange(firstKey);
            }
        } else {
            setSelectedSimKey(null);
        }
    }, [scenariosWithSim.map(m => m.key).join(',')]);

    // Reactive story→model linking
    useEffect(() => {
        const required = new Set();
        checkedStoryKeys.forEach(sKey => {
            const story = loadedMods[String(sKey)];
            if (story?.imports) {
                story.imports.forEach(imp => {
                    let key = imp.replace(/\\/g, '/');
                    if (!key.endsWith('.yaml') && !key.endsWith('.yml')) key += '.yaml';
                    required.add(key.startsWith('models/') ? key : `models/${key}`);
                });
            }
        });
        const finalKeys = [...new Set([...manualCheckedModelKeys.map(String), ...Array.from(required)])];
        if (JSON.stringify([...finalKeys].sort()) !== JSON.stringify([...checkedModelKeys].sort())) {
            setCheckedModelKeys(finalKeys);
        }
    }, [checkedStoryKeys, manualCheckedModelKeys, loadedMods]);

    useEffect(() => { loadFileTree(); }, []);

    const countLeaves = (nodes) => {
        let c = 0;
        nodes.forEach(n => { if (n.isLeaf) c++; else if (n.children) c += countLeaves(n.children); });
        return c;
    };

    const loadFileTree = async () => {
        setLoading(true);
        try {
            const result = await fetch(`${API_BASE}/api/files`).then(r => r.json());
            if (!result.success) { message.error(`加载失败: ${result.error}`); return; }

            const convert = (items) => items.map(item => {
                const titleStr = item.type === 'file' ? item.title.replace(/\.ya?ml$/, '') : item.title;
                if (item.type === 'folder' && item.children?.length === 1) {
                    const child = item.children[0];
                    if (child.type === 'file' && (child.title === 'mod.yaml' || child.title === 'mod.yml')) {
                        return {
                            key: child.key, isLeaf: true, ...child,
                            icon: React.createElement('span', null, '📦'),
                            title: React.createElement('span', null, item.title, ' ',
                                React.createElement(Tag, { color: 'blue', style: { fontSize: '10px' } }, 'pkg')),
                            titleStr: item.title, mod_type: 'model'
                        };
                    }
                }
                return {
                    title: React.createElement('span', null,
                        titleStr,
                        item.mod_type && React.createElement(Tag, {
                            color: item.mod_type === 'model' ? 'cyan' : 'blue',
                            style: { marginLeft: 8, fontSize: '10px' }
                        }, item.mod_type)
                    ),
                    key: item.key,
                    icon: React.createElement('span', null, item.type === 'folder' ? '📁' : '📄'),
                    isLeaf: item.type === 'file',
                    children: item.children ? convert(item.children) : undefined,
                    titleStr, mod_type: item.mod_type
                };
            });

            const modsNode = result.data.find(n => n.key === 'mods');
            if (modsNode?.children) {
                const mNode = modsNode.children.find(n => n.key === 'models');
                const sNode = modsNode.children.find(n => n.key === 'scenarios');
                if (mNode) setModelTree(convert(mNode.children || []));
                if (sNode) setStoryTree(convert(sNode.children || []));
            }
        } catch (e) {
            message.error(`网络错误: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    const loadFileContent = async (filePath) => {
        setLoading(true);
        try {
            const cleanPath = filePath.replace(/^mods\//, '');
            const fileResult = await fetch(`${API_BASE}/api/file/${cleanPath}`).then(r => r.json());
            if (!fileResult.success) { message.error(`读取失败: ${fileResult.error}`); return; }

            const { content, path } = fileResult.data;
            const model = {
                key: filePath,
                title: content.metadata?.name || path.split('/').pop()?.replace('.yaml', '') || 'unknown',
                path: filePath, type: content.type, category: content.category,
                content, metadata: content.metadata,
                variables: content.variables, formulas: content.formulas,
                simulator: content.simulator, optimizer: content.optimizer,
                imports: content.imports,
                folder: path.includes('/') ? path.split('/')[0] : undefined,
            };
            setSelectedModel(model);
            setLoadedMods(prev => ({ ...prev, [filePath]: model }));

            if (model.type === 'story' && model.imports) {
                const keys = model.imports.map(imp => {
                    let key = imp.replace(/\\/g, '/');
                    if (!key.endsWith('.yaml') && !key.endsWith('.yml')) key += '.yaml';
                    const clean = key.startsWith('mods/') ? key.replace(/^mods\//, '') : key;
                    return clean.startsWith('models/') || clean.startsWith('scenarios/') ? clean : `models/${clean}`;
                });
                keys.forEach(k => { if (!loadedMods[k]) loadFileContent(k); });
            }
        } catch (e) {
            message.error(`加载失败: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    // ── Validate ──────────────────────────────────────────────────────────────
    const handleValidate = async () => {
        if (selectedMods.length === 0) { message.warning('请先选择模型或故事'); return; }
        setLoading(true);
        setHighlightPatch(false);
        setOpAlert(null);
        try {
            const files = selectedMods.map(m => m.path.replace(/^mods\//, '')).filter(p => p.endsWith('.yaml') || p.endsWith('.yml'));
            const result = await fetch(`${API_BASE}/api/validate`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files }),
            }).then(r => r.json());

            if (result.success) {
                setOpAlert({ type: 'success', message: '验证通过', description: `共 ${result.data?.variables ?? '?'} 个变量，${result.data?.formulas ?? '?'} 个公式，结构完整。` });
            } else {
                setHighlightPatch(true);
                const errList = result.data?.errors || (result.data?.error ? [result.data.error] : null) || (result.error ? [result.error] : ['验证失败（未知原因）']);
                setOpAlert({
                    type: 'error',
                    message: `验证失败（${errList.length} 项问题）`,
                    description: React.createElement('div', { style: { maxHeight: 200, overflow: 'auto' } },
                        errList.map((err, i) =>
                            React.createElement('div', { key: i, style: { fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginBottom: 2 } }, `• ${err}`)
                        )
                    )
                });
            }
        } catch (e) {
            setOpAlert({ type: 'error', message: '校验出错', description: e.message });
        } finally {
            setLoading(false);
        }
    };

    // ── Patch ─────────────────────────────────────────────────────────────────
    const handlePatch = async () => {
        if (selectedMods.length === 0) return;
        const target = selectedMods[0];
        const fileName = target.path.split('/').pop()?.replace('.yaml', '_patch.yaml');
        const patchKey = `mods/models/_output/patch/${fileName}`;
        setHighlightPatch(false);
        setManualCheckedModelKeys(prev => [...new Set([...prev, patchKey])]);
        setOpAlert({ type: 'success', message: '补丁已生成', description: `已输出至 models/_output/patch/${fileName} 并自动勾选。` });
        loadFileTree();
    };

    // ── Split ─────────────────────────────────────────────────────────────────
    const handleSplit = () => {
        if (!selectedModel) { message.warning('请先选择一个模型'); return; }
        setOpAlert(null);
        setSplitModalVisible(true);
        splitForm.setFieldsValue({ output_dir: selectedModel.title });
    };

    const confirmSplit = async () => {
        try {
            const values = await splitForm.validateFields();
            setLoading(true);
            const result = await fetch(`${API_BASE}/api/split`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_path: selectedModel.path.replace(/^mods\//, ''),
                    output_dir: `models/_output/splited/${values.output_dir}/`,
                }),
            }).then(r => r.json());

            setSplitModalVisible(false);
            splitForm.resetFields();
            if (result.success) {
                const fileList = (result.data.files || []).map(f => `  • ${f}`).join('\n');
                setOpAlert({
                    type: 'success',
                    message: '拆分成功',
                    description: React.createElement('div', null,
                        React.createElement('div', null, `📁 输出目录: ${result.data.output_dir}`),
                        React.createElement('pre', { style: { fontSize: 11, marginTop: 6, marginBottom: 0 } }, fileList)
                    )
                });
                loadFileTree();
            } else {
                setOpAlert({ type: 'error', message: '拆分失败', description: result.error || '未知错误' });
            }
        } catch (e) {
            if (e.errorFields) return; // form validation error
            setOpAlert({ type: 'error', message: '拆分出错', description: e.message });
        } finally {
            setLoading(false);
        }
    };

    // ── Build ─────────────────────────────────────────────────────────────────
    const handleBuild = () => {
        if (allCheckedKeys.length === 0) { message.warning('请先勾选模型或场景'); return; }
        setOpAlert(null);
        buildForm.resetFields();
        buildForm.setFieldsValue({ folder: 'scenarios/examples', version: '1.0' });
        setBuildModalVisible(true);
    };

    const confirmBuild = async () => {
        try {
            const values = await buildForm.validateFields();
            const safeName = values.name.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_');
            const filePath = `${(values.folder || 'scenarios/examples').replace(/\/$/, '')}/${safeName}.yaml`;

            const imports = allCheckedKeys.map(k => String(k).replace(/^mods\//, '').replace(/\.ya?ml$/, ''));

            const scenarioContent = {
                type: 'scenario',
                metadata: {
                    name: values.name,
                    version: values.version || '1.0',
                    author: values.author || '',
                    description: values.description || '',
                },
                imports,
                simulator: {
                    step_size: simSettings.step_size,
                    total_time: simSettings.total_time,
                    dt_unit: simSettings.dt_unit,
                },
            };

            setLoading(true);
            const result = await fetch(`${API_BASE}/api/save-file`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: filePath, content: scenarioContent }),
            }).then(r => r.json());

            setBuildModalVisible(false);
            if (result.success) {
                setOpAlert({ type: 'success', message: '构建成功', description: `场景已保存至 mods/${filePath}` });
                loadFileTree();
            } else {
                setOpAlert({ type: 'error', message: '构建失败', description: result.error || result.detail || '未知错误' });
            }
        } catch (e) {
            if (e.errorFields) return;
            setOpAlert({ type: 'error', message: '构建出错', description: e.message });
        } finally {
            setLoading(false);
        }
    };

    // ── Sim scenario radio ────────────────────────────────────────────────────
    const handleSimScenarioChange = (key) => {
        setSelectedSimKey(key);
        const mod = loadedMods[key];
        if (mod?.simulator) {
            setSimSettings({
                step_size: mod.simulator.step_size ?? mod.simulator.dt ?? 1,
                total_time: mod.simulator.total_time ?? 1440,
                dt_unit: mod.simulator.dt_unit ?? 'minute',
            });
        }
    };

    // ── Tree helpers ──────────────────────────────────────────────────────────
    const handleSelect = (keys) => {
        if (keys.length > 0) {
            const key = keys[0];
            if ((key.endsWith('.yaml') || key.endsWith('.yml')) && !loadedMods[key]) loadFileContent(key);
            setSelectedModel(loadedMods[key] || null);
        } else {
            setSelectedModel(null);
        }
    };

    const handleCheck = async (keys, type) => {
        if (type === 'model') {
            const added = keys.filter(k => !checkedModelKeys.includes(k));
            const removed = checkedModelKeys.filter(k => !keys.includes(k));
            setManualCheckedModelKeys(prev => {
                let next = [...prev];
                added.forEach(k => { if (!next.includes(k)) next.push(k); });
                removed.forEach(k => { next = next.filter(nk => nk !== k); });
                return next;
            });
        } else {
            setCheckedStoryKeys(keys);
        }
        for (const key of keys) {
            const k = String(key);
            if ((k.endsWith('.yaml') || k.endsWith('.yml')) && !loadedMods[k]) await loadFileContent(k);
        }
    };

    // ── Render helpers ────────────────────────────────────────────────────────
    const renderConsolidatedItems = (type, mods) => {
        const items = [];
        mods.forEach(mod => {
            Object.entries(mod[type] || {}).forEach(([name, detail]) => {
                items.push({ name, detail, modTitle: mod.title });
            });
        });
        if (items.length === 0) return React.createElement(Empty, { image: Empty.PRESENTED_IMAGE_SIMPLE, description: `没有${type === 'variables' ? '变量' : '公式'}` });
        items.sort((a, b) => a.name.localeCompare(b.name));
        return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            items.map((item, idx) =>
                React.createElement('div', { key: idx, style: { border: '1px solid #e2e8f0', borderRadius: 4, padding: '8px 12px' } },
                    React.createElement('div', { style: { display: 'flex', gap: 8, marginBottom: 4, flexWrap: 'wrap' } },
                        React.createElement('strong', null, item.name),
                        React.createElement(Tag, { color: 'cyan', style: { fontSize: 10 } }, item.modTitle),
                        type === 'variables' && item.detail.unit && React.createElement(Tag, { style: { fontSize: 10 } }, item.detail.unit)
                    ),
                    React.createElement('div', { style: { fontSize: 12, color: '#666' } },
                        type === 'variables'
                            ? `值: ${String(item.detail.value ?? 'N/A')}  |  ${item.detail.description || ''}`
                            : React.createElement('code', { style: { fontSize: 12 } }, typeof item.detail.dynamics === 'object'
                                ? Object.entries(item.detail.dynamics).map(([v, e]) => `${v} = ${e}`).join('\n')
                                : String(item.detail.dynamics))
                    )
                )
            )
        );
    };

    const flattenTree = (nodes) => {
        let flat = [];
        nodes.forEach(n => {
            if (n.isLeaf) flat.push({ ...n, displayTitle: n.titleStr || n.key });
            if (n.children?.length) flat = [...flat, ...flattenTree(n.children)];
        });
        return flat;
    };

    const filterNodes = (nodes, filter) => filter
        ? nodes.filter(n => n.titleStr?.toLowerCase().includes(filter.toLowerCase()))
        : nodes;

    const modelList = filterNodes(flattenTree(modelTree), modelFilter);
    const storyList = filterNodes(flattenTree(storyTree), storyFilter);

    const modelCounts = { checked: checkedModelKeys.filter(k => String(k).endsWith('.yaml') || String(k).endsWith('.yml')).length, total: countLeaves(modelTree) };
    const storyCounts = { checked: checkedStoryKeys.filter(k => String(k).endsWith('.yaml') || String(k).endsWith('.yml')).length, total: countLeaves(storyTree) };

    const renderToolbar = (filter, setFilter, view, setView) =>
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
            React.createElement(Input, { size: 'small', placeholder: '搜索...', value: filter, onChange: e => setFilter(e.target.value), style: { width: 90 } }),
            React.createElement(Button, { size: 'small', onClick: () => setView(view === 'tree' ? 'list' : 'tree') }, view === 'tree' ? '☰' : '🌲')
        );

    // ── Simulation Set Panel ──────────────────────────────────────────────────
    const renderSimPanel = () => {
        const hasSimScenarios = scenariosWithSim.length > 0;
        return React.createElement('div', {
            style: {
                borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0',
                padding: '8px 12px', background: '#f8faff',
                display: 'flex', flexDirection: 'column', gap: 8
            }
        },
            // Header
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                React.createElement('span', { style: { fontSize: 13, fontWeight: 600, color: '#1e40af' } }, '⚙ 仿真参数'),
                hasSimScenarios && React.createElement(Tag, { color: 'blue', style: { fontSize: 10 } }, `来自 ${scenariosWithSim.length} 个 scenario`)
            ),
            // Radio group: scenarios with sim info
            hasSimScenarios && React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
                React.createElement('span', { style: { fontSize: 12, color: '#555', flexShrink: 0 } }, '参考来源:'),
                React.createElement(Radio.Group, {
                    value: selectedSimKey,
                    onChange: e => handleSimScenarioChange(e.target.value),
                    size: 'small'
                },
                    scenariosWithSim.map(m =>
                        React.createElement(Radio, { key: m.key, value: m.key, style: { fontSize: 12 } }, m.title)
                    )
                )
            ),
            // Sim fields
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' } },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                    React.createElement('span', { style: { fontSize: 12, whiteSpace: 'nowrap' } }, 'Step Size:'),
                    React.createElement(InputNumber, {
                        size: 'small', min: 0.001, value: simSettings.step_size,
                        onChange: v => setSimSettings(s => ({ ...s, step_size: v ?? 1 })),
                        style: { width: 80 }
                    }),
                    React.createElement(Select, {
                        size: 'small', value: simSettings.dt_unit,
                        onChange: v => setSimSettings(s => ({ ...s, dt_unit: v })),
                        style: { width: 90 },
                        options: DT_UNITS.map(u => ({ value: u, label: u }))
                    })
                ),
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                    React.createElement('span', { style: { fontSize: 12, whiteSpace: 'nowrap' } }, 'Total Time:'),
                    React.createElement(InputNumber, {
                        size: 'small', min: 1, value: simSettings.total_time,
                        onChange: v => setSimSettings(s => ({ ...s, total_time: v ?? 1440 })),
                        style: { width: 100 }
                    }),
                    React.createElement('span', { style: { fontSize: 12, color: '#888' } }, simSettings.dt_unit + 's')
                )
            )
        );
    };

    // ── Main render ───────────────────────────────────────────────────────────
    return React.createElement(Spin, { spinning: loading },
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)', minHeight: 500 } },

            // ── Top: Model lib + Story lib ──────────────────────────────────
            React.createElement('div', { style: { flex: '0 0 40%', display: 'flex', borderBottom: '1px solid #e2e8f0', minHeight: 0 } },

                // 模型库
                React.createElement('div', { style: { flex: 1, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', minWidth: 0 } },
                    React.createElement('div', { style: { padding: '6px 10px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8, background: '#fafafa', flexShrink: 0 } },
                        React.createElement('span', null, '🗄️'),
                        React.createElement('strong', { style: { fontSize: '13px', whiteSpace: 'nowrap' } }, `模型库 (${modelCounts.checked}/${modelCounts.total})`),
                        renderToolbar(modelFilter, setModelFilter, modelViewMode, setModelViewMode),
                        React.createElement(Button, { size: 'small', danger: checkedModelKeys.length > 0, onClick: () => { setCheckedModelKeys([]); setManualCheckedModelKeys([]); } }, '✕')
                    ),
                    React.createElement('div', { style: { flex: 1, overflow: 'auto', padding: 8 } },
                        modelViewMode === 'tree'
                            ? React.createElement(Tree, {
                                checkable: true, showIcon: true,
                                expandedKeys, onExpand: setExpandedKeys,
                                checkedKeys: checkedModelKeys,
                                onCheck: keys => handleCheck(keys, 'model'),
                                onSelect: keys => handleSelect(keys, 'model'),
                                treeData: modelTree
                            })
                            : modelList.length === 0
                                ? React.createElement(Empty, { image: Empty.PRESENTED_IMAGE_SIMPLE, description: '暂无模型' })
                                : React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
                                    modelList.map(mod =>
                                        React.createElement('div', {
                                            key: mod.key, onClick: () => handleSelect([mod.key], 'model'),
                                            style: { display: 'flex', alignItems: 'center', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', background: selectedModel?.key === mod.key ? '#e6f7ff' : 'transparent' }
                                        },
                                            React.createElement(Checkbox, { checked: checkedModelKeys.includes(mod.key), onChange: e => handleCheck(e.target.checked ? [...checkedModelKeys, mod.key] : checkedModelKeys.filter(k => k !== mod.key), 'model'), style: { marginRight: 8 } }),
                                            React.createElement('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 } }, mod.displayTitle)
                                        )
                                    )
                                )
                    )
                ),

                // 场景库
                React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 } },
                    React.createElement('div', { style: { padding: '6px 10px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8, background: '#fafafa', flexShrink: 0 } },
                        React.createElement('span', null, '📖'),
                        React.createElement('strong', { style: { fontSize: '13px', whiteSpace: 'nowrap' } }, `场景库 (${storyCounts.checked}/${storyCounts.total})`),
                        renderToolbar(storyFilter, setStoryFilter, storyViewMode, setStoryViewMode),
                        React.createElement(Button, { size: 'small', danger: checkedStoryKeys.length > 0, onClick: () => setCheckedStoryKeys([]) }, '✕')
                    ),
                    React.createElement('div', { style: { flex: 1, overflow: 'auto', padding: 8 } },
                        storyViewMode === 'tree'
                            ? React.createElement(Tree, {
                                checkable: true, showIcon: true,
                                expandedKeys, onExpand: setExpandedKeys,
                                checkedKeys: checkedStoryKeys,
                                onCheck: keys => handleCheck(keys, 'story'),
                                onSelect: keys => handleSelect(keys, 'story'),
                                treeData: storyTree
                            })
                            : storyList.length === 0
                                ? React.createElement(Empty, { image: Empty.PRESENTED_IMAGE_SIMPLE, description: '暂无场景' })
                                : React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
                                    storyList.map(mod =>
                                        React.createElement('div', {
                                            key: mod.key, onClick: () => handleSelect([mod.key], 'story'),
                                            style: { display: 'flex', alignItems: 'center', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', background: selectedModel?.key === mod.key ? '#e6f7ff' : 'transparent' }
                                        },
                                            React.createElement(Checkbox, { checked: checkedStoryKeys.includes(mod.key), onChange: e => handleCheck(e.target.checked ? [...checkedStoryKeys, mod.key] : checkedStoryKeys.filter(k => k !== mod.key), 'story'), style: { marginRight: 8 } }),
                                            React.createElement('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 } }, mod.displayTitle),
                                            React.createElement(Tag, { style: { fontSize: 10 } }, 'STORY')
                                        )
                                    )
                                )
                    )
                )
            ),

            // ── Simulation Set Panel ────────────────────────────────────────
            renderSimPanel(),

            // ── Bottom: Details + Buttons ───────────────────────────────────
            React.createElement('div', { style: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' } },
                React.createElement(Card, {
                    size: 'small',
                    style: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 },
                    bodyStyle: { flex: 1, overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column' },
                    title: React.createElement(Space, null,
                        React.createElement('span', null, 'ℹ️'),
                        React.createElement('span', null, selectedMods.length > 0
                            ? (selectedMods.length === 1 ? selectedMods[0].title : `${selectedMods.length} 项已选`)
                            : '未选择'),
                        selectedMods.length > 0 && React.createElement(Tag, { color: 'blue' }, `${selectedMods.length}`)
                    ),
                    extra: React.createElement(Space, null,
                        React.createElement(Button, { size: 'small', onClick: handleSplit, disabled: !selectedModel }, '✂ 拆分'),
                        React.createElement(Button, {
                            size: 'small', type: 'primary',
                            onClick: handleBuild,
                            disabled: allCheckedKeys.length === 0
                        }, '🔨 Build'),
                        React.createElement(Button, { size: 'small', onClick: handleValidate, disabled: selectedMods.length === 0 }, '✔ 校验'),
                        React.createElement(Button, {
                            size: 'small', onClick: handlePatch,
                            disabled: selectedMods.length === 0 || !highlightPatch,
                            type: highlightPatch ? 'primary' : 'default', danger: highlightPatch
                        }, '🩹 补丁'),
                        React.createElement(Button, { size: 'small', onClick: loadFileTree }, '🔄 刷新')
                    )
                },
                    // Inline operation result alert
                    opAlert && React.createElement('div', { style: { padding: '8px 12px 0' } },
                        React.createElement(Alert, {
                            type: opAlert.type,
                            message: opAlert.message,
                            description: opAlert.description,
                            showIcon: true, closable: true,
                            onClose: () => setOpAlert(null),
                            style: { marginBottom: 0 }
                        })
                    ),

                    selectedMods.length === 0
                        ? React.createElement('div', { style: { padding: 24 } }, React.createElement(Empty, { description: '请勾选模型或场景' }))
                        : React.createElement(Tabs, {
                            style: { flex: 1, height: '100%', overflow: 'hidden' },
                            tabBarStyle: { paddingLeft: 16, marginBottom: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '13px' },
                            items: [
                                {
                                    key: 'meta', label: '基本信息',
                                    children: React.createElement('div', { style: { padding: 16, overflow: 'auto', maxHeight: 220 } },
                                        selectedMods.map(mod =>
                                            React.createElement(Card, { key: mod.key, size: 'small', title: mod.title, style: { marginBottom: 8 } },
                                                React.createElement(Descriptions, { bordered: true, column: 2, size: 'small' },
                                                    React.createElement(Descriptions.Item, { label: '路径', span: 2 }, React.createElement('code', { style: { fontSize: 11 } }, mod.path)),
                                                    React.createElement(Descriptions.Item, { label: '类型' }, React.createElement(Tag, null, (mod.type || 'UNKNOWN').toUpperCase())),
                                                    React.createElement(Descriptions.Item, { label: '分类' }, mod.category || 'N/A'),
                                                    React.createElement(Descriptions.Item, { label: '描述', span: 2 }, mod.metadata?.description || 'No description')
                                                )
                                            )
                                        )
                                    )
                                },
                                {
                                    key: 'vars', label: `变量集 (${selectedMods.reduce((a, m) => a + Object.keys(m.variables || {}).length, 0)})`,
                                    children: React.createElement('div', { style: { padding: 16, overflow: 'auto', maxHeight: 220 } }, renderConsolidatedItems('variables', selectedMods))
                                },
                                {
                                    key: 'forms', label: `公式集 (${selectedMods.reduce((a, m) => a + Object.keys(m.formulas || {}).length, 0)})`,
                                    children: React.createElement('div', { style: { padding: 16, overflow: 'auto', maxHeight: 220 } }, renderConsolidatedItems('formulas', selectedMods))
                                }
                            ]
                        })
                )
            ),

            // ── Build Modal ─────────────────────────────────────────────────
            React.createElement(Modal, {
                title: '🔨 构建新 Scenario',
                open: buildModalVisible,
                onOk: confirmBuild,
                onCancel: () => setBuildModalVisible(false),
                confirmLoading: loading,
                width: 520,
                okText: '保存构建'
            },
                React.createElement(Form, { form: buildForm, layout: 'vertical', size: 'small' },
                    React.createElement('div', { style: { background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 4, padding: '8px 12px', marginBottom: 12, fontSize: 12 } },
                        React.createElement('strong', null, '将要导入:'),
                        React.createElement('div', { style: { marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 } },
                            allCheckedKeys.map((k, i) =>
                                React.createElement(Tag, { key: i, color: 'blue', style: { fontSize: 10 } },
                                    String(k).replace(/^mods\//, '').replace(/\.ya?ml$/, '')
                                )
                            )
                        ),
                        React.createElement('div', { style: { marginTop: 8, color: '#1e40af' } },
                            `⚙ 仿真: step=${simSettings.step_size} ${simSettings.dt_unit}, total=${simSettings.total_time} ${simSettings.dt_unit}s`
                        )
                    ),
                    React.createElement(Form.Item, { name: 'name', label: 'Scenario 名称', rules: [{ required: true, message: '请输入名称' }] },
                        React.createElement(Input, { placeholder: 'my_scenario' })
                    ),
                    React.createElement(Form.Item, { name: 'description', label: '描述（可选）' },
                        React.createElement(Input.TextArea, { rows: 2, placeholder: '简要描述这个场景...' })
                    ),
                    React.createElement('div', { style: { display: 'flex', gap: 12 } },
                        React.createElement(Form.Item, { name: 'author', label: '作者', style: { flex: 1 } },
                            React.createElement(Input, { placeholder: '（可选）' })
                        ),
                        React.createElement(Form.Item, { name: 'version', label: '版本', style: { width: 100 } },
                            React.createElement(Input, { placeholder: '1.0' })
                        )
                    ),
                    React.createElement(Form.Item, { name: 'folder', label: '保存目录', rules: [{ required: true }] },
                        React.createElement(Select, {
                            options: [
                                { value: 'scenarios/examples', label: 'scenarios/examples' },
                                { value: 'scenarios/to_game', label: 'scenarios/to_game' },
                                { value: 'scenarios', label: 'scenarios（根目录）' },
                            ],
                            placeholder: '选择目标文件夹'
                        })
                    )
                )
            ),

            // ── Split Modal ─────────────────────────────────────────────────
            React.createElement(Modal, {
                title: '✂ 拆分模型',
                open: splitModalVisible,
                onOk: confirmSplit,
                onCancel: () => setSplitModalVisible(false),
                confirmLoading: loading,
                width: 480
            },
                React.createElement(Form, { form: splitForm, layout: 'vertical' },
                    React.createElement(Alert, { message: '将模型拆分为多个独立公式文件 + 共享变量文件', type: 'info', showIcon: true, style: { marginBottom: 12 } }),
                    React.createElement(Form.Item, { label: '模型' }, React.createElement(Input, { value: selectedModel?.title, disabled: true })),
                    React.createElement(Form.Item, { name: 'output_dir', label: '输出目录', rules: [{ required: true }] },
                        React.createElement(Input, { addonBefore: 'models/_output/splited/', placeholder: 'split_output' })
                    )
                )
            )
        )
    );
};
