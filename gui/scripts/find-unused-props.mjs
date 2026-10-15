// Prints, as JSON, every prop that a component declares in its Props type and never uses.
//
// "Never uses" means: the prop is not destructured from the parameter, or it is destructured and the
// local name does not occur in the body of the component, or, when the parameter is `props`, no
// `props.name` occurs. A component that spreads or passes on the whole `props` object is skipped, as
// is a parameter with a `...rest` element.
//
// The type checker does not report this, because a declared prop that nobody reads is not an error,
// and a build error about an unused variable is usually silenced by deleting the name, which deletes the
// only trace that a control was lost. It is run by test_verification/test_gui_prop_wiring.py.
//
//   node scripts/find-unused-props.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(here, '..', 'src');

function* tsxFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* tsxFiles(full);
    else if (entry.name.endsWith('.tsx')) yield full;
  }
}

function typeMembers(node) {
  // the member names of an interface or of a type literal
  const members = node.members ?? [];
  return members.filter(m => m.name && ts.isIdentifier(m.name)).map(m => m.name.text);
}

function propsTypeName(fn) {
  const param = fn.parameters[0];
  if (!param) return null;
  const direct = param.type;
  if (direct && ts.isTypeReferenceNode(direct)) return direct.typeName.getText();
  // const C: React.FC<FooProps> = ({ ... }) => ...
  const decl = fn.parent;
  if (decl && ts.isVariableDeclaration(decl) && decl.type && ts.isTypeReferenceNode(decl.type) && decl.type.typeArguments?.length) {
    const arg = decl.type.typeArguments[0];
    if (ts.isTypeReferenceNode(arg)) return arg.typeName.getText();
  }
  return null;
}

function countIdentifier(node, name, skip) {
  let n = 0;
  const walk = x => {
    if (x === skip) return;
    if (ts.isIdentifier(x) && x.text === name) n += 1;
    ts.forEachChild(x, walk);
  };
  walk(node);
  return n;
}

const found = [];

for (const file of tsxFiles(srcDir)) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declared = new Map();
  ts.forEachChild(sf, node => {
    if (ts.isInterfaceDeclaration(node)) declared.set(node.name.text, typeMembers(node));
    else if (ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type)) declared.set(node.name.text, typeMembers(node.type));
  });

  const visit = node => {
    const isFn = ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node);
    if (isFn && node.body && node.parameters.length >= 1) {
      const typeName = propsTypeName(node);
      const expected = typeName && /Props$/.test(typeName) && declared.get(typeName);
      if (expected) {
        const param = node.parameters[0];
        const unused = [];
        if (ts.isObjectBindingPattern(param.name)) {
          const els = param.name.elements;
          if (!els.some(e => e.dotDotDotToken)) {
            const bound = new Map();
            for (const e of els) {
              const prop = e.propertyName && ts.isIdentifier(e.propertyName) ? e.propertyName.text : (ts.isIdentifier(e.name) ? e.name.text : null);
              if (prop && ts.isIdentifier(e.name)) bound.set(prop, e.name.text);
            }
            for (const m of expected) {
              if (!bound.has(m)) unused.push(m);
              else if (countIdentifier(node.body, bound.get(m), null) === 0) unused.push(m);
            }
          }
        } else if (ts.isIdentifier(param.name)) {
          const used = new Set();
          let whole = false;
          const walk = x => {
            if (ts.isPropertyAccessExpression(x) && ts.isIdentifier(x.expression) && x.expression.text === param.name.text) used.add(x.name.text);
            else if (ts.isIdentifier(x) && x.text === param.name.text && !(ts.isPropertyAccessExpression(x.parent) && x.parent.expression === x)) whole = true;
            ts.forEachChild(x, walk);
          };
          walk(node.body);
          if (!whole) for (const m of expected) if (!used.has(m)) unused.push(m);
        }
        for (const m of unused) found.push(`${path.relative(path.resolve(here, '..', '..'), file).split(path.sep).join('/')}: ${typeName}.${m}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

console.log(JSON.stringify(found.sort(), null, 2));
