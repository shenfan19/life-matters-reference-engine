const { Typography, Card } = antd;
const { Title, Text } = Typography;

const PluginComponent = () => {
    return (
        <Card style={{ textAlign: 'center', padding: '40px 0' }}>
            <Title level={4}>Model Merger</Title>
            <Text type="secondary">已经继承到 Model Loader，具体内容留空。</Text>
        </Card>
    );
};
