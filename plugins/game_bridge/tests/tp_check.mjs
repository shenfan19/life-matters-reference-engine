// Compiles every equation of a Teleporter fragment with Teleporter's own expression compiler and
// compares the result with the number the source expression gave. Reads one JSON document on stdin.
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const { compile } = await import(pathToFileURL(input.expr_js).href);
const known = new Set(['day', 'step', 'arrived', ...input.frag.variables]);
let worst = 0;
let n = 0;
for (const c of input.cases) {
  const eq = input.frag.equations[c.eq];
  const fn = compile(eq.dynamics[c.target], known, c.eq + '.' + c.target);
  const got = fn({ ...c.state, step: c.step, day: 0, arrived: 0 });
  worst = Math.max(worst, Math.abs(got - c.want) / (Math.abs(c.want) + 1e-9));
  n++;
}
console.log(JSON.stringify({ worst, n }));
