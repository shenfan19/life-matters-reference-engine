/* Expression language of LM format section 3.2: a Python-compatible arithmetic subset, compiled to closures.
   Nothing here evaluates text with eval or Function. A compiled expression is called with an environment
   object that maps names to numbers. */

const pymod = (a, b) => a - b * Math.floor(a / b);

/* Python rounds half to even. */
function pyRound(x, n) {
  const k = n === undefined ? 0 : Math.trunc(n);
  const f = Math.pow(10, k), y = x * f, r = Math.round(y);
  const half = Math.abs(y - Math.trunc(y)) === 0.5;
  return (half && r % 2 !== 0 ? r - 1 : r) / f;
}

export const FUNCS = {
  min: Math.min, max: Math.max, abs: Math.abs, exp: Math.exp, log: Math.log, sqrt: Math.sqrt, pow: Math.pow,
  floor: Math.floor, ceil: Math.ceil, tanh: Math.tanh, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2, log10: Math.log10, log2: Math.log2,
  round: pyRound, clip: (x, lo, hi) => Math.min(hi, Math.max(lo, x)),
};
export const CONSTANTS = { True: 1, False: 0 };
const MATH_NAMES = { pi: Math.PI, e: Math.E };   /* used only when a model has no variable of that name */

const TOKEN = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_]\w*)|(\*\*|\/\/|<=|>=|==|!=|[-+*/%(),<>]))/y;

function tokenize(src, where) {
  const out = [];
  const s = String(src).trim();
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < s.length) {
    const at = TOKEN.lastIndex, m = TOKEN.exec(s);
    if (!m) throw new Error(`${where}: unknown character at ${at} in: ${s}`);
    out.push(m[1] !== undefined ? { t: 'num', v: parseFloat(m[1]) } : m[2] !== undefined ? { t: 'name', v: m[2] } : { t: 'op', v: m[3] });
  }
  return out;
}

/* compile(src, where) returns { fn, names, src }. `names` is the set of variable names the expression reads. */
export function compile(src, where = 'expression') {
  if (typeof src === 'number') return { fn: () => src, names: new Set(), src: String(src) };
  if (typeof src === 'boolean') return { fn: () => (src ? 1 : 0), names: new Set(), src: String(src) };
  const toks = tokenize(src, where), names = new Set();
  let i = 0;
  const peek = () => toks[i];
  const isOp = v => toks[i] && toks[i].t === 'op' && toks[i].v === v;
  const isKw = v => toks[i] && toks[i].t === 'name' && toks[i].v === v;
  const fail = m => { throw new Error(`${where}: ${m}: ${src}`); };
  const look = (env, k) => {
    const v = env[k];
    if (v !== undefined) return v;
    if (k in MATH_NAMES) return MATH_NAMES[k];
    throw new Error(`${where}: no variable ${k}`);
  };
  function expr() {
    const a = orTest();
    if (isKw('if')) {
      i++;
      const c = orTest();
      if (!isKw('else')) fail('a conditional requires else');
      i++;
      const b = expr();
      return env => (c(env) ? a(env) : b(env));
    }
    return a;
  }
  function orTest() {
    let a = andTest();
    while (isKw('or')) { i++; const l = a, r = andTest(); a = env => { const x = l(env); return x ? x : r(env); }; }
    return a;
  }
  function andTest() {
    let a = notTest();
    while (isKw('and')) { i++; const l = a, r = notTest(); a = env => { const x = l(env); return x ? r(env) : x; }; }
    return a;
  }
  function notTest() {
    if (isKw('not')) { i++; const a = notTest(); return env => (a(env) ? 0 : 1); }
    return comparison();
  }
  function comparison() {
    const a = arith(), parts = [];
    while (peek() && peek().t === 'op' && ['<', '<=', '>', '>=', '==', '!='].includes(peek().v)) { const op = toks[i++].v; parts.push([op, arith()]); }
    if (!parts.length) return a;
    const cmp = { '<': (x, y) => x < y, '<=': (x, y) => x <= y, '>': (x, y) => x > y, '>=': (x, y) => x >= y, '==': (x, y) => x === y, '!=': (x, y) => x !== y };
    return env => { let l = a(env); for (const [op, rf] of parts) { const r = rf(env); if (!cmp[op](l, r)) return 0; l = r; } return 1; };
  }
  function arith() {
    let a = term();
    while (isOp('+') || isOp('-')) { const op = toks[i++].v, l = a, r = term(); a = op === '+' ? env => l(env) + r(env) : env => l(env) - r(env); }
    return a;
  }
  function term() {
    let a = factor();
    while (isOp('*') || isOp('/') || isOp('%') || isOp('//')) {
      const op = toks[i++].v, l = a, r = factor();
      a = op === '*' ? env => l(env) * r(env) : op === '/' ? env => l(env) / r(env) : op === '%' ? env => pymod(l(env), r(env)) : env => Math.floor(l(env) / r(env));
    }
    return a;
  }
  function factor() {
    if (isOp('-')) { i++; const a = factor(); return env => -a(env); }
    if (isOp('+')) { i++; return factor(); }
    return power();
  }
  function power() {
    const a = atom();
    if (isOp('**')) { i++; const b = factor(); return env => Math.pow(a(env), b(env)); }
    return a;
  }
  function atom() {
    const t = toks[i++];
    if (!t) fail('the expression is incomplete');
    if (t.t === 'num') return () => t.v;
    if (t.t === 'op' && t.v === '(') { const e = expr(); if (!isOp(')')) fail('missing )'); i++; return e; }
    if (t.t === 'name') {
      if (t.v in CONSTANTS && !isOp('(')) { const c = CONSTANTS[t.v]; return () => c; }
      if (isOp('(')) {
        if (!FUNCS[t.v]) fail('the function ' + t.v + ' is not allowed');
        i++;
        const args = [];
        if (!isOp(')')) { args.push(expr()); while (isOp(',')) { i++; args.push(expr()); } }
        if (!isOp(')')) fail('missing )');
        i++;
        const f = FUNCS[t.v];
        return env => f(...args.map(a => a(env)));
      }
      names.add(t.v);
      const k = t.v;
      return env => look(env, k);
    }
    return fail('unexpected ' + t.v);
  }
  const fn = expr();
  if (i < toks.length) fail('the expression did not end');
  return { fn, names, src: String(src) };
}
