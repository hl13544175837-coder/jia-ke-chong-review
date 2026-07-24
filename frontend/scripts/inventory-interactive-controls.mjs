import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import ts from 'typescript';

const sourceRoot = resolve(process.argv[2] || 'src');
const interactiveTags = new Set([
  'button',
  'Button',
  'a',
  'Link',
  'NavLink',
  'input',
  'select',
  'textarea',
]);
const actionAttributes = new Set([
  'onClick',
  'onDoubleClick',
  'onChange',
  'onInput',
  'onSubmit',
  'onKeyDown',
]);

function collectFiles(directory) {
  return readdirSync(directory)
    .sort()
    .flatMap((entry) => {
      const path = resolve(directory, entry);
      if (statSync(path).isDirectory()) return collectFiles(path);
      return ['.ts', '.tsx'].includes(extname(path)) ? [path] : [];
    });
}

function tagName(node, sourceFile) {
  return node.getText(sourceFile).split('.').at(-1);
}

function attr(node, name) {
  return node.attributes.properties.find((property) => (
    ts.isJsxAttribute(property) && property.name.getText() === name
  ));
}

function attrText(node, name, sourceFile) {
  const property = attr(node, name);
  if (!property || !ts.isJsxAttribute(property) || !property.initializer) return '';
  if (ts.isStringLiteral(property.initializer)) return property.initializer.text;
  if (!ts.isJsxExpression(property.initializer) || !property.initializer.expression) return '';
  return expressionText(property.initializer.expression, sourceFile);
}

function expressionText(expression, sourceFile) {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }
  if (ts.isNumericLiteral(expression)) return expression.text;
  if (ts.isIdentifier(expression) || ts.isPropertyAccessExpression(expression)) {
    return `{${expression.getText(sourceFile)}}`;
  }
  if (ts.isTemplateExpression(expression)) {
    const spans = expression.templateSpans.map((span) => (
      `{${span.expression.getText(sourceFile)}}}${span.literal.text}`
    ));
    return `${expression.head.text}${spans.join('')}`;
  }
  if (ts.isConditionalExpression(expression)) {
    return [expressionText(expression.whenTrue, sourceFile), expressionText(expression.whenFalse, sourceFile)]
      .filter(Boolean)
      .join(' / ');
  }
  return `{${expression.getText(sourceFile).replace(/\s+/g, ' ').slice(0, 120)}}`;
}

function childText(node, sourceFile) {
  if (ts.isJsxText(node)) return node.text.replace(/\s+/g, ' ').trim();
  if (ts.isJsxExpression(node) && node.expression) {
    return expressionText(node.expression, sourceFile);
  }
  if (ts.isJsxElement(node)) return node.children.map((child) => childText(child, sourceFile)).filter(Boolean).join(' ');
  if (ts.isJsxSelfClosingElement(node)) {
    return attrText(node, 'aria-label', sourceFile) || attrText(node, 'title', sourceFile);
  }
  return '';
}

function controlLabel(node, sourceFile) {
  const explicit = [
    attrText(node, 'aria-label', sourceFile),
    attrText(node, 'title', sourceFile),
    attrText(node, 'placeholder', sourceFile),
  ].find(Boolean);
  if (explicit) return explicit.replace(/\s+/g, ' ').trim();
  if (ts.isJsxElement(node.parent)) {
    const text = node.parent.children.map((child) => childText(child, sourceFile)).filter(Boolean).join(' ');
    if (text) return text.replace(/\s+/g, ' ').trim().slice(0, 240);
  }
  return '';
}

function hasAction(node) {
  return node.attributes.properties.some((property) => (
    ts.isJsxAttribute(property) && actionAttributes.has(property.name.getText())
  ));
}

function insideForm(node, sourceFile) {
  let current = node.parent;
  while (current) {
    if (
      ts.isJsxElement(current)
      && tagName(current.openingElement.tagName, sourceFile) === 'form'
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

const controls = [];

for (const filePath of collectFiles(sourceRoot)) {
  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    extname(filePath) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = tagName(node.tagName, sourceFile);
      const action = [...actionAttributes]
        .map((attribute) => [attribute, attrText(node, attribute, sourceFile)])
        .find(([, value]) => value);
      if (interactiveTags.has(name) || hasAction(node)) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        controls.push({
          file: relative(sourceRoot, filePath),
          line: position.line + 1,
          tag: name,
          label: controlLabel(node, sourceFile),
          action: action ? `${action[0]}=${action[1]}` : '',
          href: attrText(node, 'to', sourceFile) || attrText(node, 'href', sourceFile),
          type: attrText(node, 'type', sourceFile),
          insideForm: insideForm(node, sourceFile),
          disabled: Boolean(attr(node, 'disabled')),
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

const byTag = Object.fromEntries(
  [...new Set(controls.map((control) => control.tag))]
    .sort()
    .map((tag) => [tag, controls.filter((control) => control.tag === tag).length]),
);

process.stdout.write(`${JSON.stringify({ sourceRoot, total: controls.length, byTag, controls }, null, 2)}\n`);
