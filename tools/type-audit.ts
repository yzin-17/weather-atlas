import ts from 'typescript';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = process.env.TYPE_AUDIT_ROOT || fileURLToPath(new URL('..', import.meta.url));
interface Finding {
  file: string;
  line: number;
  kind: string;
  detail: string;
}
const findings: Finding[] = [];
const visited = new Set<string>();
for (const configName of ['tsconfig.json', 'web/tsconfig.json']) {
  const configPath = path.join(root, configName);
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  if (loaded.error) throw Error(ts.flattenDiagnosticMessageText(loaded.error.messageText, '\n'));
  const raw: unknown = loaded.config;
  const config = ts.parseJsonConfigFileContent(raw, ts.sys, path.dirname(configPath));
  const program = ts.createProgram(config.fileNames, config.options);
  const checker = program.getTypeChecker();
  for (const source of program.getSourceFiles()) {
    const file = path.relative(root, source.fileName).split(path.sep).join('/');
    if (
      source.isDeclarationFile ||
      file.startsWith('..') ||
      file
        .split('/')
        .some((part) => part.startsWith('.') || part === 'node_modules' || part === 'evidence') ||
      visited.has(file)
    )
      continue;
    visited.add(file);
    const add = (node: ts.Node, kind: string, detail: string) =>
      findings.push({
        file,
        line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        kind,
        detail,
      });
    function visit(node: ts.Node) {
      if (
        (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
        checker.getTypeAtLocation(node.expression).flags & ts.TypeFlags.Any
      )
        add(node, 'unsafe-any-access', node.getText(source).slice(0, 220));
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        checker.getTypeAtLocation(node.initializer).flags & ts.TypeFlags.Any &&
        !(checker.getTypeAtLocation(node.name).flags & (ts.TypeFlags.Unknown | ts.TypeFlags.Any))
      )
        add(node, 'unsafe-any-assignment', node.getText(source).slice(0, 220));
      if (node.kind === ts.SyntaxKind.AnyKeyword) add(node, 'explicit-any', 'any');
      if (
        (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) &&
        node.exclamationToken
      )
        add(node, 'definite-assignment', node.getText(source).slice(0, 220));
      if (ts.isNonNullExpression(node)) add(node, 'non-null', node.getText(source));
      if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
        if (node.type.getText(source) !== 'const') {
          const before = checker.getTypeAtLocation(node.expression),
            after = checker.getTypeFromTypeNode(node.type);
          add(
            node,
            before.flags & ts.TypeFlags.Any
              ? 'cast-from-any'
              : checker.isTypeAssignableTo(before, after)
                ? 'widening-or-redundant-cast'
                : 'narrowing-cast',
            node.getText(source).replace(/\s+/g, ' ').slice(0, 220),
          );
        }
      }
      if (
        (ts.isVariableDeclaration(node) || ts.isBindingElement(node) || ts.isParameter(node)) &&
        ts.isIdentifier(node.name)
      ) {
        const type = checker.typeToString(
          checker.getTypeAtLocation(node.name),
          node,
          ts.TypeFormatFlags.NoTruncation,
        );
        if (/^(?:any(?:\[\])?|(?:Map|Set|Promise)<[^{}]*\bany\b[^{}]*>)$/.test(type))
          add(node, 'any-binding', `${node.name.text}: ${type.slice(0, 220)}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    const scanner = ts.createScanner(
      ts.ScriptTarget.Latest,
      false,
      source.languageVariant,
      source.text,
    );
    for (
      let token = scanner.scan();
      token !== ts.SyntaxKind.EndOfFileToken;
      token = scanner.scan()
    ) {
      if (
        token !== ts.SyntaxKind.SingleLineCommentTrivia &&
        token !== ts.SyntaxKind.MultiLineCommentTrivia
      )
        continue;
      for (const match of scanner.getTokenText().matchAll(/@ts-(?:ignore|nocheck)/g))
        findings.push({
          file,
          line: source.getLineAndCharacterOfPosition(scanner.getTokenPos() + match.index).line + 1,
          kind: 'suppression',
          detail: match[0],
        });
    }
  }
}
findings.sort(
  (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.kind.localeCompare(b.kind),
);
const counts = Object.fromEntries(
  [...new Set(findings.map((row) => row.kind))].map((kind) => [
    kind,
    findings.filter((row) => row.kind === kind).length,
  ]),
);
const reviewed = findings.map((row) => ({
  ...row,
  reason:
    row.kind === 'narrowing-cast' &&
    row.file === 'web/lib/ui-text.ts' &&
    row.detail.startsWith('Object.fromEntries( Object.entries(rows).map(') &&
    row.detail.endsWith('as Labels')
      ? 'Object.fromEntries 无法保留已知词条键，四语词条由同一静态表构建并有覆盖测试'
      : row.kind === 'widening-or-redundant-cast' &&
          row.file === 'web/tests/enhancements.test.ts' &&
          row.detail.startsWith("import('../lib/weather.ts' + '?separate-module-copy') as Promise<")
        ? '带查询参数的动态导入用于模拟 Next 独立模块副本，TypeScript 无法解析该运行时路径'
        : null,
}));
const report = { date: new Date().toISOString(), files: visited.size, counts, findings: reviewed };
const destination = process.env.TYPE_AUDIT_OUTPUT || path.join(root, 'qa/evidence/type-audit.json');
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ files: visited.size, counts, report: destination }));
if (reviewed.some((row) => !row.reason)) process.exitCode = 1;
