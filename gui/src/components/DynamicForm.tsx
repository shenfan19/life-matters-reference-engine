import { useState } from 'react';

interface Props {
  schema: any; // 从 manifest.ui.schema 传入
  pluginId: string;
}

export default function DynamicForm({ schema, pluginId }: Props) {
  const [inputs, setInputs] = useState<Record<string, any>>({});
  const [result, setResult] = useState<any>(null);

  const handleSubmit = async () => {
    const res = await fetch(`/api/plugins/${pluginId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs })
    });
    const data = await res.json();
    setResult(data);
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>{schema.title || 'Plugin Form'}</h2>
      {schema.inputs?.map((field: any) => (
        <div key={field.name} style={{ marginBottom: 10 }}>
          <label>{field.label}</label>
          <input
            type={field.type}
            value={inputs[field.name] || ''}
            onChange={e => setInputs({ ...inputs, [field.name]: e.target.value })}
          />
        </div>
      ))}
      <button onClick={handleSubmit}>Run</button>
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}
