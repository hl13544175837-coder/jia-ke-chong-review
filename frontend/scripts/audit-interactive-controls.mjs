import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(scriptDir, '..');
const srcRoot = join(frontendRoot, 'src');
const actionAttributes = new Set([
  'onClick',
  'onDoubleClick',
  'onMouseDown',
  'onPointerDown',
]);

function collectTsxFiles(directory) {
  return readdirSync(directory)
    .sort()
    .flatMap((entry) => {
      const path = join(directory, entry);
      return statSync(path).isDirectory()
        ? collectTsxFiles(path)
        : extname(path) === '.tsx'
          ? [path]
          : [];
    });
}

function tagNameText(tagName, sourceFile) {
  return tagName.getText(sourceFile).split('.').at(-1);
}

function attributeName(property) {
  if (!ts.isJsxAttribute(property)) return null;
  return property.name.getText();
}

function literalAttributeValue(attributes, name) {
  const property = attributes.properties.find((item) => attributeName(item) === name);
  if (!property || !ts.isJsxAttribute(property) || !property.initializer) return null;
  return ts.isStringLiteral(property.initializer) ? property.initializer.text : null;
}

function isInsideForm(node, sourceFile) {
  let current = node.parent;
  while (current) {
    if (
      ts.isJsxElement(current)
      && tagNameText(current.openingElement.tagName, sourceFile) === 'form'
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function isInsideNavigation(node, sourceFile) {
  let current = node.parent;
  while (current) {
    if (ts.isJsxElement(current)) {
      const ancestorName = tagNameText(current.openingElement.tagName, sourceFile);
      if (ancestorName === 'a' || ancestorName === 'Link' || ancestorName === 'NavLink') {
        return true;
      }
    }
    current = current.parent;
  }
  return false;
}

function inspectControl(node, sourceFile, filePath, violations) {
  const name = tagNameText(node.tagName, sourceFile);
  if (name !== 'button' && name !== 'Button') return;

  const properties = node.attributes.properties;
  const names = new Set(properties.map(attributeName).filter(Boolean));
  const hasSpread = properties.some(ts.isJsxSpreadAttribute);
  const explicitType = literalAttributeValue(node.attributes, 'type');
  const hasAction = [...actionAttributes].some((attribute) => names.has(attribute));
  const navigates = isInsideNavigation(node, sourceFile);
  const submitsForm = explicitType === 'submit'
    || explicitType === 'reset'
    || (name === 'button' && explicitType === null && isInsideForm(node, sourceFile));
  const disabledAttribute = properties.find((property) => attributeName(property) === 'disabled');
  const isDisabled = Boolean(disabledAttribute);
  const hasDynamicDisabledState = Boolean(
    disabledAttribute
    && ts.isJsxAttribute(disabledAttribute)
    && disabledAttribute.initializer
    && ts.isJsxExpression(disabledAttribute.initializer)
    && disabledAttribute.initializer.expression,
  );
  const hasVisibleBusyState = submitsForm
    && hasDynamicDisabledState
    && /(?:登录|提交|保存|处理|加载)中/.test(node.parent.getText(sourceFile));
  const hasDisabledReason = names.has('title') || names.has('aria-describedby');
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const location = `${relative(frontendRoot, filePath)}:${position.line + 1}`;

  if (!hasAction && !submitsForm && !hasSpread && !navigates) {
    violations.push(`${location} ${name} has no click or submit action`);
  }
  if (name === 'button' && isDisabled && !hasDisabledReason && !hasVisibleBusyState) {
    violations.push(`${location} disabled ${name} has no title or aria-describedby reason`);
  }
}

const violations = [];

for (const filePath of collectTsxFiles(srcRoot)) {
  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      inspectControl(node, sourceFile, filePath, violations);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

if (violations.length > 0) {
  console.error(`Interactive control audit failed with ${violations.length} violation(s):`);
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log('interactive_control_audit: OK');
}
