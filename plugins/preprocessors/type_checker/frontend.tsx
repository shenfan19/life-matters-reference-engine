const {
    Card, Tabs, Button, Input, InputNumber, Select, Form, Modal,
    Table, Tag, Space, Alert, Spin, Divider, Switch, Tooltip, Empty, message
} = antd;

// ── Simple YAML serializer ────────────────────────────────────────────────────
function toYaml(obj, indent = 0) {
    const sp = '  '.repeat(indent);
    if (obj === null || obj === undefined) return 'null';
    if (typeof obj === 'boolean') return obj ? 'true' : 'false';
    if (typeof obj === 'number') return String(obj);
    if (typeof obj === 'string') {
        if (obj === '') return '""';
        if (/[:#\[\]{}&*!|>'"%@`]/.test(obj) || obj.includes('\n') || /^\s|\s$/.test(obj))
            return `"${obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
        return obj;
    }
    if (Array.isArray(obj)) {
        if (obj.length === 0) return '[]';
        if (obj.every(x => typeof x !== 'object' || x === null))
            return `[${obj.map(x => toYaml(x)).join(', ')}]`;
        return obj.map(item => {
            const v = toYaml(item, indent + 1);
            return v.startsWith('\n') ? `\n${sp}- ${v.trimStart()}` : `\n${sp}- ${v}`;
        }).join('');
    }
    if (typeof obj === 'object') {
        const entries = Object.entries(obj);
        if (entries.length === 0) return '{}';
        return entries.map(([k, v]) => {
            const val = toYaml(v, indent + 1);
            return val.startsWith('\n') ? `\n${sp}${k}:${val}` : `\n${sp}${k}: ${val}`;
        }).join('');
    }
    return String(obj);
}

function buildYaml(meta, variables, formulas) {
    const varsObj = {};
    for (const v of variables) {
        if (!v.name) continue;
        const entry = { type: v.type, value: v.value ?? 0 };
        if (v.description) entry.description = v.description;
        if (v.unit) entry.unit = v.unit;
        if (v.io_role) entry.io_role = v.io_role;
        if (v.hasBounds && v.boundsMin != null && v.boundsMax != null)
            entry.bounds = [v.boundsMin, v.boundsMax];
        varsObj[v.name] = entry;
    }

    const formsObj = {};
    for (const f of formulas) {
        if (!f.name) continue;
        const dynObj = {};
        for (const d of (f.dynamics || [])) {
            if (!d.varName) continue;
            const num = parseFloat(d.expr);
            dynObj[d.varName] = (!isNaN(num) && String(num) === d.expr) ? num : d.expr;
        }
        const entry = {};
        if (f.description) entry.description = f.description;
        const cond = f.condition?.trim();
        entry.condition = (!cond || cond === 'true') ? true : cond;
        entry.priority = f.priority ?? 0;
        entry.dynamics = dynObj;
        formsObj[f.name] = entry;
    }

    const root = { type: 'model', category: meta.category || 'dynamics' };
    const md = { name: meta.name || '', version: meta.version || '1.0', author: meta.author || '', description: meta.description || '' };
    if (meta.tags) md.tags = meta.tags.split(',').map(t => t.trim()).filter(Boolean);
    root.metadata = md;
    root.variables = varsObj;
    root.formulas = formsObj;
    return 'type: model\ncategory: ' + (meta.category || 'dynamics') + '\n\nmetadata:' +
        toYaml(md, 1) + '\n\nvariables:' +
        (Object.keys(varsObj).length ? toYaml(varsObj, 1) : ' {}') +
        '\n\nformulas:' +
        (Object.keys(formsObj).length ? toYaml(formsObj, 1) : ' {}') + '\n';
}

// ── Main component ────────────────────────────────────────────────────────────
const VAR_TYPES = ['state', 'input', 'parameter'];
const IO_ROLES = ['', 'input', 'output', 'intermediate'];
const CATEGORIES = ['dynamics', 'physiology', 'social', 'environmental', 'economics', 'interventions', 'other'];

let _idCounter = 0;
const uid = () => `id_${++_idCounter}_${Date.now()}`;

const PluginComponent = () => {
    // ── Meta ────────────────────────────────────────────────────────────────
    const [meta, setMeta] = React.useState({
        name: '', version: '1.0.0', author: '', description: '', category: 'dynamics', tags: ''
    });

    // ── Variables ───────────────────────────────────────────────────────────
    const [variables, setVariables] = React.useState([]);
    const [varModalVisible, setVarModalVisible] = React.useState(false);
    const [editingVar, setEditingVar] = React.useState(null); // null = new
    const [varForm] = Form.useForm();

    // ── Formulas ────────────────────────────────────────────────────────────
    const [formulas, setFormulas] = React.useState([]);
    const [formulaModalVisible, setFormulaModalVisible] = React.useState(false);
    const [editingFormula, setEditingFormula] = React.useState(null);
    const [dynRows, setDynRows] = React.useState([]); // [{id,varName,expr}]
    const [formulaForm] = Form.useForm();

    // ── Save / UI ───────────────────────────────────────────────────────────
    const [saveModalVisible, setSaveModalVisible] = React.useState(false);
    const [saveForm] = Form.useForm();
    const [saving, setSaving] = React.useState(false);
    const [opAlert, setOpAlert] = React.useState(null);
    const [activeTab, setActiveTab] = React.useState('meta');

    const varNames = variables.map(v => v.name).filter(Boolean);

    // ── Variable CRUD ────────────────────────────────────────────────────────
    const openNewVar = () => {
        setEditingVar(null);
        varForm.resetFields();
        varForm.setFieldsValue({ type: 'state', value: 0, hasBounds: false });
        setVarModalVisible(true);
    };

    const openEditVar = (record) => {
        setEditingVar(record);
        varForm.setFieldsValue({ ...record });
        setVarModalVisible(true);
    };

    const confirmVar = async () => {
        try {
            const vals = await varForm.validateFields();
            if (editingVar) {
                setVariables(prev => prev.map(v => v.id === editingVar.id ? { ...v, ...vals } : v));
            } else {
                if (variables.find(v => v.name === vals.name)) {
                    message.error('变量名已存在');
                    return;
                }
                setVariables(prev => [...prev, { id: uid(), hasBounds: false, ...vals }]);
            }
            setVarModalVisible(false);
        } catch (_) {}
    };

    const deleteVar = (id) => setVariables(prev => prev.filter(v => v.id !== id));

    // ── Formula CRUD ─────────────────────────────────────────────────────────
    const openNewFormula = () => {
        setEditingFormula(null);
        formulaForm.resetFields();
        formulaForm.setFieldsValue({ condition: 'true', priority: 0 });
        setDynRows([{ id: uid(), varName: '', expr: '' }]);
        setFormulaModalVisible(true);
    };

    const openEditFormula = (record) => {
        setEditingFormula(record);
        formulaForm.setFieldsValue({ name: record.name, description: record.description, condition: record.condition, priority: record.priority });
        setDynRows(record.dynamics.length ? record.dynamics.map(d => ({ ...d })) : [{ id: uid(), varName: '', expr: '' }]);
        setFormulaModalVisible(true);
    };

    const confirmFormula = async () => {
        try {
            const vals = await formulaForm.validateFields();
            const entry = { ...vals, id: editingFormula?.id || uid(), dynamics: dynRows.filter(d => d.varName) };
            if (editingFormula) {
                setFormulas(prev => prev.map(f => f.id === editingFormula.id ? entry : f));
            } else {
                if (formulas.find(f => f.name === vals.name)) {
                    message.error('公式名已存在');
                    return;
                }
                setFormulas(prev => [...prev, entry]);
            }
            setFormulaModalVisible(false);
        } catch (_) {}
    };

    const deleteFormula = (id) => setFormulas(prev => prev.filter(f => f.id !== id));

    const addDynRow = () => setDynRows(prev => [...prev, { id: uid(), varName: '', expr: '' }]);
    const removeDynRow = (id) => setDynRows(prev => prev.filter(r => r.id !== id));
    const updateDynRow = (id, field, val) =>
        setDynRows(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));

    // ── Save ──────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!meta.name) { message.warning('请先填写模型名称（元数据 Tab）'); setActiveTab('meta'); return; }
        setOpAlert(null);
        saveForm.resetFields();
        saveForm.setFieldsValue({
            filename: meta.name.replace(/\s+/g, '_').toLowerCase(),
            folder: 'models/dynamics'
        });
        setSaveModalVisible(true);
    };

    const confirmSave = async () => {
        try {
            const vals = await saveForm.validateFields();
            const path = `${vals.folder.replace(/\/$/, '')}/${vals.filename.replace(/\.ya?ml$/, '')}.yaml`;
            const content = buildModelObject();
            setSaving(true);
            const result = await fetch('/api/save-file', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path, content }),
            }).then(r => r.json());
            setSaveModalVisible(false);
            setSaving(false);
            if (result.success) {
                setOpAlert({ type: 'success', message: '保存成功', description: `已保存至 models/${path}` });
            } else {
                setOpAlert({ type: 'error', message: '保存失败', description: result.error || result.detail || '未知错误' });
            }
        } catch (e) {
            if (e.errorFields) return;
            setSaving(false);
            setOpAlert({ type: 'error', message: '保存出错', description: e.message });
        }
    };

    const buildModelObject = () => {
        const varsObj = {};
        for (const v of variables) {
            if (!v.name) continue;
            const entry = { type: v.type, value: v.value ?? 0 };
            if (v.description) entry.description = v.description;
            if (v.unit) entry.unit = v.unit;
            if (v.io_role) entry.io_role = v.io_role;
            if (v.hasBounds && v.boundsMin != null && v.boundsMax != null)
                entry.bounds = [v.boundsMin, v.boundsMax];
            varsObj[v.name] = entry;
        }
        const formsObj = {};
        for (const f of formulas) {
            if (!f.name) continue;
            const dynObj = {};
            for (const d of (f.dynamics || [])) {
                if (!d.varName) continue;
                const num = parseFloat(d.expr);
                dynObj[d.varName] = (!isNaN(num) && String(num) === String(d.expr)) ? num : d.expr;
            }
            const cond = f.condition?.trim();
            formsObj[f.name] = {
                condition: (!cond || cond === 'true') ? true : cond,
                priority: f.priority ?? 0,
                dynamics: dynObj,
                ...(f.description ? { description: f.description } : {}),
            };
        }
        const mdObj = {
            name: meta.name, version: meta.version || '1.0',
            author: meta.author || '', description: meta.description || '',
        };
        if (meta.tags) mdObj.tags = meta.tags.split(',').map(t => t.trim()).filter(Boolean);
        return { type: 'model', category: meta.category || 'dynamics', metadata: mdObj, variables: varsObj, formulas: formsObj };
    };

    // ── Variable columns ──────────────────────────────────────────────────────
    const varColumns = [
        { title: '变量名', dataIndex: 'name', key: 'name', render: v => React.createElement('code', { style: { fontSize: 12 } }, v) },
        { title: '类型', dataIndex: 'type', key: 'type', width: 90, render: t => React.createElement(Tag, { color: t === 'state' ? 'blue' : t === 'input' ? 'green' : 'orange', style: { fontSize: 10 } }, t) },
        { title: '初值', dataIndex: 'value', key: 'value', width: 70, render: v => React.createElement('span', { style: { fontSize: 12 } }, String(v ?? 0)) },
        { title: '单位', dataIndex: 'unit', key: 'unit', width: 60, render: u => u ? React.createElement(Tag, { style: { fontSize: 10 } }, u) : '—' },
        { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true, render: d => React.createElement('span', { style: { fontSize: 11, color: '#666' } }, d || '—') },
        {
            title: '', key: 'actions', width: 80,
            render: (_, record) => React.createElement(Space, { size: 4 },
                React.createElement(Button, { type: 'link', size: 'small', onClick: () => openEditVar(record) }, '编辑'),
                React.createElement(Button, { type: 'link', size: 'small', danger: true, onClick: () => deleteVar(record.id) }, '删除')
            )
        }
    ];

    // ── Formula columns ───────────────────────────────────────────────────────
    const formulaColumns = [
        { title: '公式名', dataIndex: 'name', key: 'name', render: v => React.createElement('code', { style: { fontSize: 12 } }, v) },
        {
            title: '触发条件', dataIndex: 'condition', key: 'condition', width: 140,
            render: c => React.createElement(Tag, { color: (!c || c === 'true') ? 'default' : 'orange', style: { fontSize: 10, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' } },
                (!c || c === 'true') ? '恒成立' : c
            )
        },
        {
            title: '动态方程', dataIndex: 'dynamics', key: 'dynamics',
            render: dyn => React.createElement('div', null,
                (dyn || []).slice(0, 2).map((d, i) =>
                    React.createElement('div', { key: i, style: { fontSize: 11, fontFamily: 'monospace', color: '#0369a1' } },
                        `${d.varName} = ${d.expr}`)
                ),
                dyn?.length > 2 && React.createElement('span', { style: { fontSize: 10, color: '#aaa' } }, `+${dyn.length - 2} 更多`)
            )
        },
        { title: '优先级', dataIndex: 'priority', key: 'priority', width: 60, render: p => React.createElement('span', { style: { fontSize: 12 } }, p ?? 0) },
        {
            title: '', key: 'actions', width: 80,
            render: (_, record) => React.createElement(Space, { size: 4 },
                React.createElement(Button, { type: 'link', size: 'small', onClick: () => openEditFormula(record) }, '编辑'),
                React.createElement(Button, { type: 'link', size: 'small', danger: true, onClick: () => deleteFormula(record.id) }, '删除')
            )
        }
    ];

    // ── Tabs content ──────────────────────────────────────────────────────────
    const tabItems = [
        {
            key: 'meta', label: '① 元数据',
            children: React.createElement('div', { style: { padding: '16px 8px', maxWidth: 560 } },
                React.createElement(Form, { layout: 'vertical', size: 'small' },
                    React.createElement('div', { style: { display: 'flex', gap: 12 } },
                        React.createElement(Form.Item, { label: '模型名称', required: true, style: { flex: 2 } },
                            React.createElement(Input, { placeholder: 'glucose_regulation', value: meta.name, onChange: e => setMeta(m => ({ ...m, name: e.target.value })) })
                        ),
                        React.createElement(Form.Item, { label: '分类', style: { flex: 1 } },
                            React.createElement(Select, {
                                value: meta.category, onChange: v => setMeta(m => ({ ...m, category: v })),
                                options: CATEGORIES.map(c => ({ value: c, label: c }))
                            })
                        ),
                        React.createElement(Form.Item, { label: '版本', style: { width: 90 } },
                            React.createElement(Input, { value: meta.version, onChange: e => setMeta(m => ({ ...m, version: e.target.value })) })
                        )
                    ),
                    React.createElement('div', { style: { display: 'flex', gap: 12 } },
                        React.createElement(Form.Item, { label: '作者', style: { flex: 1 } },
                            React.createElement(Input, { value: meta.author, onChange: e => setMeta(m => ({ ...m, author: e.target.value })) })
                        ),
                        React.createElement(Form.Item, { label: '标签（逗号分隔）', style: { flex: 2 } },
                            React.createElement(Input, { placeholder: 'nutrition, demo', value: meta.tags, onChange: e => setMeta(m => ({ ...m, tags: e.target.value })) })
                        )
                    ),
                    React.createElement(Form.Item, { label: '描述' },
                        React.createElement(Input.TextArea, { rows: 3, value: meta.description, onChange: e => setMeta(m => ({ ...m, description: e.target.value })) })
                    )
                )
            )
        },
        {
            key: 'variables', label: `② 变量 (${variables.length})`,
            children: React.createElement('div', { style: { padding: '12px 8px' } },
                React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: 8 } },
                    React.createElement(Button, { type: 'primary', size: 'small', onClick: openNewVar }, '+ 添加变量')
                ),
                variables.length === 0
                    ? React.createElement(Empty, { description: '暂无变量，点击右上角添加', image: Empty.PRESENTED_IMAGE_SIMPLE })
                    : React.createElement(Table, {
                        dataSource: variables, columns: varColumns, rowKey: 'id',
                        size: 'small', pagination: false,
                        scroll: { y: 340 }
                    })
            )
        },
        {
            key: 'formulas', label: `③ 公式 (${formulas.length})`,
            children: React.createElement('div', { style: { padding: '12px 8px' } },
                React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: 8 } },
                    React.createElement(Button, { type: 'primary', size: 'small', onClick: openNewFormula }, '+ 添加公式')
                ),
                formulas.length === 0
                    ? React.createElement(Empty, { description: '暂无公式，点击右上角添加', image: Empty.PRESENTED_IMAGE_SIMPLE })
                    : React.createElement(Table, {
                        dataSource: formulas, columns: formulaColumns, rowKey: 'id',
                        size: 'small', pagination: false,
                        scroll: { y: 340 }
                    })
            )
        },
        {
            key: 'preview', label: '④ 预览 & 保存',
            children: React.createElement('div', { style: { padding: '12px 8px' } },
                React.createElement('pre', {
                    style: {
                        background: '#0f172a', color: '#e2e8f0', padding: 16,
                        borderRadius: 6, fontSize: 12, lineHeight: 1.6,
                        maxHeight: 400, overflow: 'auto', fontFamily: 'monospace',
                        whiteSpace: 'pre-wrap', wordBreak: 'break-all'
                    }
                }, buildYaml(meta, variables, formulas))
            )
        }
    ];

    // ── Render ────────────────────────────────────────────────────────────────
    return React.createElement(Spin, { spinning: saving },
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)', minHeight: 480 } },

            // Header
            React.createElement('div', {
                style: {
                    padding: '10px 16px', borderBottom: '1px solid #e2e8f0',
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: '#f8fafc', flexShrink: 0
                }
            },
                React.createElement('span', { style: { fontSize: 15, fontWeight: 700, color: '#1e40af' } }, '🔧 Model Builder'),
                React.createElement('span', { style: { fontSize: 13, color: '#64748b' } },
                    meta.name ? `— ${meta.name}` : '（新建模型）'
                ),
                React.createElement('div', { style: { flex: 1 } }),
                React.createElement(Button, { type: 'primary', onClick: handleSave, disabled: !meta.name }, '💾 保存模型')
            ),

            // Inline alert
            opAlert && React.createElement('div', { style: { padding: '8px 16px 0', flexShrink: 0 } },
                React.createElement(Alert, {
                    type: opAlert.type, message: opAlert.message, description: opAlert.description,
                    showIcon: true, closable: true, onClose: () => setOpAlert(null)
                })
            ),

            // Tabs
            React.createElement('div', { style: { flex: 1, overflow: 'auto', padding: '0 8px' } },
                React.createElement(Tabs, {
                    activeKey: activeTab, onChange: setActiveTab,
                    size: 'small',
                    tabBarStyle: { paddingLeft: 8, marginBottom: 0 },
                    items: tabItems
                })
            ),

            // ── Variable Modal ────────────────────────────────────────────────
            React.createElement(Modal, {
                title: editingVar ? '编辑变量' : '添加变量',
                open: varModalVisible, onOk: confirmVar,
                onCancel: () => setVarModalVisible(false),
                width: 540, okText: '确认'
            },
                React.createElement(Form, { form: varForm, layout: 'vertical', size: 'small' },
                    React.createElement('div', { style: { display: 'flex', gap: 12 } },
                        React.createElement(Form.Item, {
                            name: 'name', label: '变量名', style: { flex: 2 },
                            rules: [{ required: true, message: '请输入变量名' }, { pattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/, message: '只能含字母、数字、下划线，且不以数字开头' }]
                        },
                            React.createElement(Input, { placeholder: 'blood_glucose', disabled: !!editingVar })
                        ),
                        React.createElement(Form.Item, { name: 'type', label: '类型', style: { flex: 1 }, rules: [{ required: true }] },
                            React.createElement(Select, { options: VAR_TYPES.map(t => ({ value: t, label: t })) })
                        )
                    ),
                    React.createElement('div', { style: { display: 'flex', gap: 12 } },
                        React.createElement(Form.Item, { name: 'value', label: '初值', style: { flex: 1 }, rules: [{ required: true }] },
                            React.createElement(InputNumber, { style: { width: '100%' }, placeholder: '0' })
                        ),
                        React.createElement(Form.Item, { name: 'unit', label: '单位（可选）', style: { flex: 1 } },
                            React.createElement(Input, { placeholder: 'mmol/L' })
                        ),
                        React.createElement(Form.Item, { name: 'io_role', label: 'IO 角色', style: { flex: 1 } },
                            React.createElement(Select, {
                                allowClear: true, placeholder: '（可选）',
                                options: IO_ROLES.filter(r => r).map(r => ({ value: r, label: r }))
                            })
                        )
                    ),
                    React.createElement(Form.Item, { name: 'description', label: '描述' },
                        React.createElement(Input, { placeholder: '...' })
                    ),
                    React.createElement(Form.Item, { name: 'hasBounds', label: '启用边界', valuePropName: 'checked' },
                        React.createElement(Switch, { size: 'small' })
                    ),
                    React.createElement(Form.Item, { noStyle: true, shouldUpdate: (prev, cur) => prev.hasBounds !== cur.hasBounds },
                        ({ getFieldValue }) => getFieldValue('hasBounds') && React.createElement('div', { style: { display: 'flex', gap: 12 } },
                            React.createElement(Form.Item, { name: 'boundsMin', label: '下界', style: { flex: 1 }, rules: [{ required: true }] },
                                React.createElement(InputNumber, { style: { width: '100%' } })
                            ),
                            React.createElement(Form.Item, { name: 'boundsMax', label: '上界', style: { flex: 1 }, rules: [{ required: true }] },
                                React.createElement(InputNumber, { style: { width: '100%' } })
                            )
                        )
                    )
                )
            ),

            // ── Formula Modal ─────────────────────────────────────────────────
            React.createElement(Modal, {
                title: editingFormula ? '编辑公式' : '添加公式',
                open: formulaModalVisible, onOk: confirmFormula,
                onCancel: () => setFormulaModalVisible(false),
                width: 600, okText: '确认'
            },
                React.createElement(Form, { form: formulaForm, layout: 'vertical', size: 'small' },
                    React.createElement('div', { style: { display: 'flex', gap: 12 } },
                        React.createElement(Form.Item, {
                            name: 'name', label: '公式名', style: { flex: 2 },
                            rules: [{ required: true }]
                        },
                            React.createElement(Input, { placeholder: 'glucose_uptake', disabled: !!editingFormula })
                        ),
                        React.createElement(Form.Item, { name: 'priority', label: '优先级', style: { width: 90 } },
                            React.createElement(InputNumber, { style: { width: '100%' }, defaultValue: 0 })
                        )
                    ),
                    React.createElement(Form.Item, { name: 'condition', label: '触发条件（留空或 true 表示恒成立）' },
                        React.createElement(Input, { placeholder: 'blood_glucose > 3.5', style: { fontFamily: 'monospace' } })
                    ),
                    React.createElement(Form.Item, { name: 'description', label: '描述（可选）' },
                        React.createElement(Input, { placeholder: '...' })
                    ),
                    React.createElement(Divider, { orientation: 'left', plain: true, style: { margin: '8px 0' } }, '动态方程 (dynamics)'),
                    React.createElement('div', { style: { maxHeight: 220, overflow: 'auto' } },
                        dynRows.map((row, i) =>
                            React.createElement('div', { key: row.id, style: { display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' } },
                                React.createElement(Select, {
                                    size: 'small', style: { width: 160 }, placeholder: '变量名',
                                    value: row.varName || undefined,
                                    onChange: v => updateDynRow(row.id, 'varName', v),
                                    showSearch: true, allowClear: true,
                                    options: varNames.map(n => ({ value: n, label: n })),
                                    dropdownRender: menu => React.createElement('div', null,
                                        menu,
                                        React.createElement(Divider, { style: { margin: '4px 0' } }),
                                        React.createElement('div', { style: { padding: '4px 8px' } },
                                            React.createElement(Input, {
                                                size: 'small', placeholder: '自定义变量名',
                                                onKeyDown: e => { if (e.key === 'Enter') { updateDynRow(row.id, 'varName', e.target.value); e.stopPropagation(); } }
                                            })
                                        )
                                    )
                                }),
                                React.createElement('span', { style: { color: '#999', flexShrink: 0 } }, '='),
                                React.createElement(Input, {
                                    size: 'small', style: { flex: 1, fontFamily: 'monospace', fontSize: 12 },
                                    placeholder: 'blood_glucose - 0.1 * dt',
                                    value: row.expr,
                                    onChange: e => updateDynRow(row.id, 'expr', e.target.value)
                                }),
                                React.createElement(Button, {
                                    size: 'small', type: 'text', danger: true,
                                    disabled: dynRows.length === 1,
                                    onClick: () => removeDynRow(row.id)
                                }, '✕')
                            )
                        )
                    ),
                    React.createElement(Button, { size: 'small', type: 'dashed', onClick: addDynRow, style: { marginTop: 4, width: '100%' } }, '+ 添加方程行')
                )
            ),

            // ── Save Modal ────────────────────────────────────────────────────
            React.createElement(Modal, {
                title: '💾 保存模型',
                open: saveModalVisible, onOk: confirmSave,
                onCancel: () => setSaveModalVisible(false),
                confirmLoading: saving, width: 460, okText: '确认保存'
            },
                React.createElement(Form, { form: saveForm, layout: 'vertical', size: 'small' },
                    React.createElement(Form.Item, { name: 'folder', label: '保存目录', rules: [{ required: true }] },
                        React.createElement(Select, {
                            options: [
                                { value: 'models/dynamics', label: 'models/dynamics' },
                                { value: 'models/physiology', label: 'models/physiology' },
                                { value: 'models/social', label: 'models/social' },
                                { value: 'models/environmental', label: 'models/environmental' },
                                { value: 'models/interventions/diet', label: 'models/interventions/diet' },
                                { value: 'models/interventions/medicine', label: 'models/interventions/medicine' },
                                { value: 'models/medical/dynamics', label: 'models/medical/dynamics' },
                            ],
                            placeholder: '选择目录'
                        })
                    ),
                    React.createElement(Form.Item, { name: 'filename', label: '文件名', rules: [{ required: true, pattern: /^[a-zA-Z0-9_\-]+$/, message: '只能含字母、数字、下划线、连字符' }] },
                        React.createElement(Input, { addonAfter: '.yaml', placeholder: 'my_model' })
                    )
                )
            )
        )
    );
};
