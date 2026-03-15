const {
    Card, Tree, Descriptions, Tag, Button, Space, Input,
    message, Spin, Tabs, Empty, Modal, Form, Alert, Checkbox, Divider
} = antd;

const API_BASE = '';

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
    const [highlightPatch, setHighlightPatch] = useState(false);
    const [mergeModalVisible, setMergeModalVisible] = useState(false);
    const [splitModalVisible, setSplitModalVisible] = useState(false);
    const [mergeForm] = Form.useForm();
    const [splitForm] = Form.useForm();

    const allCheckedKeys = [...checkedModelKeys, ...checkedStoryKeys];
    const selectedMods = allCheckedKeys.map(k => loadedMods[k]).filter(Boolean);

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
            message.success('加载成功');
        } catch (e) {
            message.error(`网络错误: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Load file content without validation
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

    // Validate selected mods (explicit button action)
    const handleValidate = async () => {
        if (selectedMods.length === 0) { message.warning('请先选择模型或故事'); return; }
        setLoading(true);
        setHighlightPatch(false);
        try {
            const files = selectedMods.map(m => m.path.replace(/^mods\//, '')).filter(p => p.endsWith('.yaml') || p.endsWith('.yml'));
            const result = await fetch(`${API_BASE}/api/validate`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files }),
            }).then(r => r.json());

            if (result.success) {
                message.success('✅ 验证通过！');
            } else {
                setHighlightPatch(true);
                message.error('❌ 验证失败，可尝试生成补丁。');
                const errList = result.data?.errors || (result.data?.error ? [result.data.error] : null) || (result.error ? [result.error] : ['验证失败（未知原因）']);
                Modal.error({
                    title: '验证失败', width: 600,
                    content: React.createElement('div', null,
                        React.createElement('div', { style: { marginBottom: 12 } }, '发现以下问题，建议生成补丁：'),
                        React.createElement('div', { style: { maxHeight: 300, overflow: 'auto', background: '#f5f5f5', padding: 12, borderRadius: 4, fontFamily: 'monospace' } },
                            errList.map((err, idx) =>
                                React.createElement('div', { key: idx, style: { marginBottom: 4, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' } }, `• ${err}`)
                            )
                        )
                    ),
                });
            }
        } catch (e) {
            message.error(`校验出错: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handlePatch = async () => {
        if (selectedMods.length === 0) return;
        const target = selectedMods[0];
        message.loading('正在生成补丁...', 1);
        const fileName = target.path.split('/').pop()?.replace('.yaml', '_patch.yaml');
        const patchKey = `mods/models/_output/patch/${fileName}`;
        setHighlightPatch(false);
        setManualCheckedModelKeys(prev => [...new Set([...prev, patchKey])]);
        message.success(`✅ 补丁已生成至 models/_output/patch/${fileName} 并自动选中。`);
        loadFileTree();
    };

    const handleSelect = (keys, type) => {
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

    const handleMerge = () => {
        const files = checkedModelKeys.filter(k => String(k).endsWith('.yaml') || String(k).endsWith('.yml'));
        if (files.length < 2) { message.warning('请至少选择 2 个模型文件进行合并'); return; }
        setMergeModalVisible(true);
    };

    const confirmMerge = async () => {
        try {
            const values = await mergeForm.validateFields();
            setLoading(true);
            const names = checkedModelKeys
                .filter(k => String(k).endsWith('.yaml') || String(k).endsWith('.yml'))
                .map(k => String(k).replace(/^mods\//, '').replace(/\.(yaml|yml)$/, ''));
            const result = await fetch(`${API_BASE}/api/merge`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model_names: names, output_path: `models/_output/merged/${values.output_name}.yaml` }),
            }).then(r => r.json());

            if (result.success) {
                message.success(`✅ ${result.data.message}  输出: ${result.data.output_path}`, 5);
                setMergeModalVisible(false); mergeForm.resetFields(); loadFileTree();
            } else {
                Modal.error({ title: '合并失败', content: result.error });
            }
        } catch (e) { message.error(`合并失败: ${e.message}`); }
        finally { setLoading(false); }
    };

    const handleSplit = () => {
        if (!selectedModel) { message.warning('请先选择一个模型'); return; }
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

            if (result.success) {
                Modal.success({
                    title: '拆分成功', width: 600,
                    content: React.createElement('div', null,
                        React.createElement('div', null, '已将模型拆分为多个文件：'),
                        React.createElement('div', { style: { marginTop: 12, background: '#f5f5f5', padding: 12, borderRadius: 4 } },
                            React.createElement('div', null, `📁 输出: ${result.data.output_dir}`),
                            React.createElement('ul', { style: { marginTop: 8, paddingLeft: 20 } },
                                (result.data.files || []).map((f, i) =>
                                    React.createElement('li', { key: i, style: { fontSize: 12 } }, React.createElement('code', null, f))
                                )
                            )
                        )
                    ),
                });
                setSplitModalVisible(false); splitForm.resetFields(); loadFileTree();
            } else {
                Modal.error({ title: '拆分失败', content: result.error });
            }
        } catch (e) { message.error(`拆分失败: ${e.message}`); }
        finally { setLoading(false); }
    };

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
                    React.createElement('div', { style: { display: 'flex', gap: 8, marginBottom: 4 } },
                        React.createElement('strong', null, item.name),
                        React.createElement(Tag, { color: 'cyan', style: { fontSize: 10 } }, item.modTitle),
                        type === 'variables' && item.detail.unit && React.createElement(Tag, { style: { fontSize: 10 } }, item.detail.unit)
                    ),
                    React.createElement('div', { style: { fontSize: 12, color: '#666' } },
                        type === 'variables'
                            ? `值: ${String(item.detail.value)}  |  ${item.detail.description || ''}`
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

    return React.createElement(Spin, { spinning: loading },
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)', minHeight: 500 } },

            // 上半部分：模型库 + 故事库
            React.createElement('div', { style: { flex: '0 0 50%', display: 'flex', borderBottom: '1px solid #e2e8f0' } },

                // 模型库
                React.createElement('div', { style: { flex: 1, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', minWidth: 0 } },
                    React.createElement('div', { style: { padding: '6px 10px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8, background: '#fafafa' } },
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

                // 故事库
                React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 } },
                    React.createElement('div', { style: { padding: '6px 10px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8, background: '#fafafa' } },
                        React.createElement('span', null, '📖'),
                        React.createElement('strong', { style: { fontSize: '13px', whiteSpace: 'nowrap' } }, `故事库 (${storyCounts.checked}/${storyCounts.total})`),
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
                                ? React.createElement(Empty, { image: Empty.PRESENTED_IMAGE_SIMPLE, description: '暂无故事' })
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

            // 下半部分：详情 + 按钮
            React.createElement('div', { style: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' } },
                React.createElement(Card, {
                    size: 'small',
                    style: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 },
                    bodyStyle: { flex: 1, overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column' },
                    title: React.createElement(Space, null,
                        React.createElement('span', null, 'ℹ️'),
                        React.createElement('span', null, selectedMods.length > 0 ? (selectedMods.length === 1 ? selectedMods[0].title : `${selectedMods.length} 项已选`) : '未选择'),
                        selectedMods.length > 0 && React.createElement(Tag, { color: 'blue' }, `${selectedMods.length}`)
                    ),
                    extra: React.createElement(Space, null,
                        React.createElement(Button, { size: 'small', onClick: handleSplit, disabled: !selectedModel }, '✂ 拆分'),
                        React.createElement(Button, { size: 'small', onClick: handleMerge, disabled: checkedModelKeys.filter(k => String(k).endsWith('.yaml') || String(k).endsWith('.yml')).length < 2 }, '⊕ 合并'),
                        React.createElement(Button, { size: 'small', type: 'primary', onClick: handleValidate, disabled: selectedMods.length === 0 }, '✔ 校验'),
                        React.createElement(Button, {
                            size: 'small', onClick: handlePatch,
                            disabled: selectedMods.length === 0 || !highlightPatch,
                            type: highlightPatch ? 'primary' : 'default', danger: highlightPatch
                        }, '🩹 补丁'),
                        React.createElement(Button, { size: 'small', onClick: loadFileTree }, '🔄 刷新')
                    )
                },
                    selectedMods.length === 0
                        ? React.createElement('div', { style: { padding: 24 } }, React.createElement(Empty, { description: '请勾选模型或故事' }))
                        : React.createElement(Tabs, {
                            style: { flex: 1, height: '100%', overflow: 'hidden' },
                            tabBarStyle: { paddingLeft: 16, marginBottom: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '13px' },
                            items: [
                                {
                                    key: 'meta', label: '基本信息',
                                    children: React.createElement('div', { style: { padding: 16, overflow: 'auto', maxHeight: 300 } },
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
                                    children: React.createElement('div', { style: { padding: 16, overflow: 'auto', maxHeight: 300 } }, renderConsolidatedItems('variables', selectedMods))
                                },
                                {
                                    key: 'forms', label: `公式集 (${selectedMods.reduce((a, m) => a + Object.keys(m.formulas || {}).length, 0)})`,
                                    children: React.createElement('div', { style: { padding: 16, overflow: 'auto', maxHeight: 300 } }, renderConsolidatedItems('formulas', selectedMods))
                                }
                            ]
                        })
                )
            ),

            // 合并模态框
            React.createElement(Modal, { title: '合并模型', open: mergeModalVisible, onOk: confirmMerge, onCancel: () => setMergeModalVisible(false), confirmLoading: loading, width: 560 },
                React.createElement(Form, { form: mergeForm, layout: 'vertical' },
                    React.createElement(Alert, { message: `将合并 ${checkedModelKeys.filter(k => String(k).endsWith('.yaml') || String(k).endsWith('.yml')).length} 个模型文件`, type: 'info', showIcon: true, style: { marginBottom: 12 } }),
                    React.createElement(Form.Item, { name: 'output_name', label: '输出文件名', rules: [{ required: true }] },
                        React.createElement(Input, { addonBefore: 'models/_output/merged/', addonAfter: '.yaml', placeholder: 'combined_model' })
                    )
                )
            ),

            // 拆分模态框
            React.createElement(Modal, { title: '拆分模型', open: splitModalVisible, onOk: confirmSplit, onCancel: () => setSplitModalVisible(false), confirmLoading: loading, width: 560 },
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
