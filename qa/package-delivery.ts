import { jsonObject, textAt } from './lib/json.ts';
import { mkdir, copyFile, cp, readFile, writeFile, stat, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSourceZip } from './lib/archive.ts';

// 产物与代码分开保存；仅导出源码、测试、历史和验收证据。
const root = fileURLToPath(new URL('..', import.meta.url)),
  out = process.env.DELIVERY_DIR;
if (!out || !path.isAbsolute(out)) throw Error('请提供绝对路径 DELIVERY_DIR');
await mkdir(out, { recursive: true });
const version = textAt(
  jsonObject(await readFile(path.join(root, 'web/package.json'), 'utf8')),
  'version',
);
if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('版本号无效');
const source = path.join(out, `Weather-Atlas-Source-v${version}.zip`);
const { entries } = await createSourceZip(root, source);
console.log('源码 ZIP 完整性通过，条目数', entries);
const apk = path.join(root, 'mobile/build/app/outputs/flutter-apk/app-debug.apk');
await copyFile(apk, path.join(out, `Weather-Atlas-Android-Debug-v${version}.apk`));
for (const [relative, name] of [
  [
    'mobile/build/ios/Debug-iphonesimulator/Runner.app',
    `Weather-Atlas-iOS-Simulator-arm64-Debug-v${version}.app.zip`,
  ],
  [
    'mobile/build/ios/iphoneos/Runner.app',
    `Weather-Atlas-iOS-Device-arm64-Unsigned-v${version}.app.zip`,
  ],
] as const) {
  const app = path.join(root, relative);
  await stat(app);
  execFileSync('/usr/bin/ditto', [
    '-c',
    '-k',
    '--sequesterRsrc',
    '--keepParent',
    app,
    path.join(out, name),
  ]);
}
await mkdir(path.join(out, 'qa'), { recursive: true });
await copyFile(
  path.join(root, 'qa/LOCAL-VERIFICATION.md'),
  path.join(out, 'qa/LOCAL-VERIFICATION.md'),
);
for (const file of (await readdir(path.join(root, 'qa'))).filter(
  (n) => n.endsWith('.md') || n === 'map-loading-ab.json',
))
  await copyFile(path.join(root, 'qa', file), path.join(out, 'qa', file));
await copyFile(path.join(root, 'README.md'), path.join(out, 'README.md'));
await mkdir(path.join(out, 'mobile'), { recursive: true });
await copyFile(path.join(root, 'mobile/README.md'), path.join(out, 'mobile/README.md'));
await cp(path.join(root, 'qa/evidence'), path.join(out, 'qa/evidence'), { recursive: true });
await cp(path.join(root, 'docs'), path.join(out, 'docs'), { recursive: true });
execFileSync('/usr/bin/ditto', [
  '-c',
  '-k',
  '--keepParent',
  path.join(root, 'qa/evidence'),
  path.join(out, 'Weather-Atlas-Verification-Evidence.zip'),
]);
const files: { 文件: string; 字节: number; SHA256: string }[] = [];
for (const name of [
  ...(await readdir(out)).filter(
    (n) => n.includes(`-v${version}`) || n === 'Weather-Atlas-Verification-Evidence.zip',
  ),
  'qa/LOCAL-VERIFICATION.md',
].sort()) {
  const bytes = await readFile(path.join(out, name));
  files.push({
    文件: name,
    字节: bytes.length,
    SHA256: createHash('sha256').update(bytes).digest('hex'),
  });
}
await writeFile(
  path.join(out, 'DELIVERY-MANIFEST.json'),
  JSON.stringify({ 生成时间: new Date().toISOString(), 项目目录: root, 文件: files }, null, 2),
);
console.log(JSON.stringify(files));
