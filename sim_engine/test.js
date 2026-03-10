const fs = require('fs');

async function test() {
  try {
    const res = await fetch('http://localhost:8001/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_names: ['mods/stories/marie_curie/story.yaml'] })
    });
    const text = await res.text();
    fs.writeFileSync('test_js_output.txt', `Status: ${res.status}\nBody: ${text}`);
  } catch (e) {
    fs.writeFileSync('test_js_output.txt', e.toString());
  }
}

test();
