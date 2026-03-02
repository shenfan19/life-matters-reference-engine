const { Row, Col, Card, Select, Button, Space, List, Tag, Typography, Progress, Alert, Checkbox, Divider, message } = antd;
const { Title, Text } = Typography;

const PluginComponent = () => {
    const [generating, setGenerating] = useState(false);
    const [files, setFiles] = useState({ scenarios: [], stories: [] });
    const [selection, setSelection] = useState({ scenario: null, story: null });
    const [scenarioData, setScenarioData] = useState(null);
    const [mapping, setMapping] = useState({
        cost: '',
        atk: '',
        def: '',
        selectedDynamics: []
    });
    const [result, setResult] = useState(null);

    useEffect(() => {
        fetch('/api/files')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const scenarios = [];
                    const stories = [];
                    const scan = (items) => {
                        items.forEach(item => {
                            if (item.type === 'file') {
                                if (item.key.includes('scenarios/')) scenarios.push({ label: item.title, value: item.key });
                                if (item.key.includes('stories/')) stories.push({ label: item.title, value: item.key });
                            }
                            if (item.children) scan(item.children);
                        });
                    };
                    scan(data.data);
                    setFiles({ scenarios, stories });
                }
            });
    }, []);

    const loadScenarioDetails = async (path) => {
        try {
            // The 'key' from /api/files already contains the relative path like 'scenarios/xxx.yaml'
            // The /api/mods/:path endpoint expects that relative path.
            const res = await fetch(`/api/mods/${encodeURIComponent(path)}`);
            const data = await res.json();
            setScenarioData(data);
            const vars = Object.keys(data.variables || {});
            setMapping({
                cost: vars[0] || '',
                atk: vars[1] || '',
                def: vars[2] || '',
                selectedDynamics: Object.keys(data.formulas || {})
            });
        } catch (e) {
            message.error("Failed to load scenario details");
        }
    };

    const handleScenarioChange = (val) => {
        setSelection(prev => ({ ...prev, scenario: val }));
        loadScenarioDetails(val);
    };

    const handleGenerate = async () => {
        if (!selection.scenario || !selection.story) {
            message.warning("Please select both a Scenario and a Target Story");
            return;
        }
        setGenerating(true);
        try {
            const data = await window.pluginAPI.callBackend('run', {
                scenario_path: selection.scenario.replace(/^mods\//, ''),
                story_path: selection.story.replace(/^mods\//, ''),
                mapping: mapping
            });
            if (data.success) {
                setResult(data);
                message.success('Conversion Successful!');
            } else {
                message.error('Failed: ' + data.error);
            }
        } catch (err) {
            message.error('Network Error');
        } finally {
            setGenerating(false);
        }
    };

    const variables = scenarioData ? Object.keys(scenarioData.variables || {}) : [];
    const formulas = scenarioData ? Object.keys(scenarioData.formulas || {}) : [];

    return (
        <div style={{ padding: '20px' }}>
            <Title level={3}>Scenario to Game Converter</Title>
            <Text type="secondary">Map physics/economies from Scenarios to Card attributes in Stories.</Text>
            <Divider />

            <Row gutter={24}>
                {/* Left Column: Source Scenario */}
                <Col span={11}>
                    <Card title={<span><Tag color="blue">SOURCE</Tag> Scenario</span>} bordered={false} style={{ background: '#f8fafc' }}>
                        <Select
                            placeholder="Select Source Scenario..."
                            style={{ width: '100%', marginBottom: 20 }}
                            options={files.scenarios}
                            onChange={handleScenarioChange}
                        />

                        {scenarioData && (
                            <List
                                header={<strong>Scenario Variables</strong>}
                                bordered
                                size="small"
                                dataSource={variables}
                                renderItem={item => (
                                    <List.Item>
                                        <Text code>{item}</Text>
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                            ({scenarioData.variables[item].unit || 'unitless'})
                                        </Text>
                                    </List.Item>
                                )}
                                style={{ maxHeight: 250, overflow: 'auto', background: '#fff' }}
                            />
                        )}

                        {scenarioData && formulas.length > 0 && (
                            <div style={{ marginTop: 20 }}>
                                <Text strong>Dynamics to Include:</Text>
                                <Checkbox.Group
                                    style={{ width: '100%', marginTop: 10 }}
                                    value={mapping.selectedDynamics}
                                    onChange={checked => setMapping({ ...mapping, selectedDynamics: checked })}
                                >
                                    <div style={{ maxHeight: 150, overflow: 'auto', padding: '8px', border: '1px solid #d9d9d9', borderRadius: '2px', background: '#fff' }}>
                                        {formulas.map(f => (
                                            <div key={f}><Checkbox value={f}>{f}</Checkbox></div>
                                        ))}
                                    </div>
                                </Checkbox.Group>
                            </div>
                        )}
                    </Card>
                </Col>

                {/* Right Column: Target Story & Mapping */}
                <Col span={13}>
                    <Card title={<span><Tag color="green">TARGET</Tag> Story & Mapping</span>} bordered={false} style={{ background: '#f0fdf4' }}>
                        <div style={{ marginBottom: 20 }}>
                            <Text strong>Target Story:</Text>
                            <Select
                                placeholder="Select Target Story..."
                                style={{ width: '100%', marginTop: 8 }}
                                options={files.stories}
                                onChange={val => setSelection(prev => ({ ...prev, story: val }))}
                            />
                        </div>

                        <Divider orientation="left" plain>Attribute Mapping</Divider>

                        <Space direction="vertical" style={{ width: '100%' }} size="middle">
                            <div>
                                <Text type="secondary" style={{ fontSize: 12 }}>Card Cost (Energy) maps to:</Text>
                                <Select
                                    style={{ width: '100%', marginTop: 4 }}
                                    value={mapping.cost}
                                    onChange={v => setMapping({ ...mapping, cost: v })}
                                    options={variables.map(v => ({ label: v, value: v }))}
                                    disabled={!scenarioData}
                                />
                            </div>
                            <div>
                                <Text type="secondary" style={{ fontSize: 12 }}>Attack (ATK) maps to:</Text>
                                <Select
                                    style={{ width: '100%', marginTop: 4 }}
                                    value={mapping.atk}
                                    onChange={v => setMapping({ ...mapping, atk: v })}
                                    options={variables.map(v => ({ label: v, value: v }))}
                                    disabled={!scenarioData}
                                />
                            </div>
                            <div>
                                <Text type="secondary" style={{ fontSize: 12 }}>Defense (DEF) maps to:</Text>
                                <Select
                                    style={{ width: '100%', marginTop: 4 }}
                                    value={mapping.def}
                                    onChange={v => setMapping({ ...mapping, def: v })}
                                    options={variables.map(v => ({ label: v, value: v }))}
                                    disabled={!scenarioData}
                                />
                            </div>
                        </Space>

                        <div style={{ marginTop: 32, textAlign: 'right' }}>
                            <Button
                                type="primary"
                                size="large"
                                onClick={handleGenerate}
                                loading={generating}
                                disabled={!selection.scenario || !selection.story}
                            >
                                Convert to Game Case
                            </Button>
                        </div>
                    </Card>
                </Col>
            </Row>

            {result && (
                <Alert
                    message="Conversion Success"
                    description={result.message}
                    type="success"
                    showIcon
                    closable
                    onClose={() => setResult(null)}
                    style={{ marginTop: 20 }}
                />
            )}
        </div>
    );
};
