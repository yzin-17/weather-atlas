import { requireValue } from '../../web/lib/validation.ts';
import { errorInfo } from '../../web/lib/errors.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, symlink, rm } from 'node:fs/promises';
import { createWriteStream, type PathLike } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import os from 'node:os';
import path from 'node:path';
import yazl from 'yazl';
import yauzl from 'yauzl';
import {
  createDirectoryZip,
  createSourceZip,
  verifyZipArchive,
  verifyDelivery,
  fileSHA256,
} from '../lib/archive.ts';

async function temporary(t: test.TestContext) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'weather-node-archive-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
async function zip(file: PathLike, entries: string[][]) {
  const writer = new yazl.ZipFile();
  const finished = pipeline(writer.outputStream, createWriteStream(file));
  for (const [name, text] of entries) {
    if (name.endsWith('/')) writer.addEmptyDirectory(name);
    else writer.addBuffer(Buffer.from(text), name, { compress: false });
  }
  writer.end();
  await finished;
}
async function files(file: string) {
  const archive = await new Promise<yauzl.ZipFile>((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true }, (error, value) =>
      error ? reject(error) : resolve(requireValue(value)),
    ),
  );
  return new Promise<string[]>((resolve, reject) => {
    const names: string[] = [];
    archive.on('error', reject);
    archive.on('entry', (entry: import('yauzl').Entry) => {
      names.push(entry.fileName);
      archive.readEntry();
    });
    archive.on('end', () => resolve(names));
    archive.readEntry();
  });
}

test('源码 ZIP 保留源码和环境模板，排除依赖、私有配置、签名及符号链接', async (t) => {
  const directory = await temporary(t),
    source = path.join(directory, 'source'),
    output = path.join(directory, 'source.zip');
  const names = [
    'README.md',
    'web/.env.example',
    '.env.https.example',
    'qa/check.ts',
    'mobile/ios/Podfile',
    '.env.https.local',
    'web/.env.local',
    'node_modules/no.js',
    'mobile/build/app.apk',
    '.format-tools/tool.jar',
    'web/.next/server.js',
    'web/next-env.d.ts',
    'web/tsconfig.tsbuildinfo',
    '.cache-test/data.json',
    'mobile/ios/Pods/generated.rb',
    'certs/server-key.pem',
    'signing/release.p12',
    'signing/key.p8',
  ];
  for (const name of names) {
    const target = path.join(source, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, name);
  }
  await symlink(path.join(source, 'README.md'), path.join(source, 'linked.md'));
  await symlink(path.join(source, 'qa'), path.join(source, 'linked-directory'));
  const result = await createSourceZip(source, output);
  assert.equal(result.entries, 5);
  assert.deepEqual(
    (await files(output)).sort(),
    [
      'weather-atlas/.env.https.example',
      'weather-atlas/README.md',
      'weather-atlas/mobile/ios/Podfile',
      'weather-atlas/qa/check.ts',
      'weather-atlas/web/.env.example',
    ].sort(),
  );
  assert.equal((await verifyZipArchive(output)).entries, 5);
});

test('必须检查实际 CRC，拒绝数据被篡改但 ZIP 目录仍正常的文件', async (t) => {
  const directory = await temporary(t),
    file = path.join(directory, 'corrupt.zip');
  const text = 'controlled-archive-crc-payload';
  await zip(file, [['data.txt', text]]);
  const bytes = await readFile(file);
  const offset = bytes.indexOf(text);
  assert(offset > 0);
  bytes[offset] ^= 1;
  await writeFile(file, bytes);
  await assert.rejects(verifyZipArchive(file), /CRC/);
});

test('凭据检查覆盖解压数据块边界，并且不在异常中输出密钥', async (t) => {
  const directory = await temporary(t),
    file = path.join(directory, 'secret.zip'),
    secret = 'controlled-unit-secret-crossing-chunk-boundary';
  await zip(file, [['data.bin', 'x'.repeat(16384 - 10) + secret + 'y'.repeat(20000)]]);
  await assert.rejects(
    verifyZipArchive(file, { secrets: [secret] }),
    (error) =>
      errorInfo(error).message.includes('拒绝包含实际凭据') &&
      !errorInfo(error).message.includes(secret),
  );
});

test('拒绝集成测试入口', async (t) => {
  const directory = await temporary(t);
  for (const name of [
    'app_flow_test.dart',
    'chat_stream_test.dart',
    'location_test.dart',
    'resilience_test.dart',
    'reverse_flow_test.dart',
    'reverse_recovery_test.dart',
  ] as const) {
    const file = path.join(directory, name + '.apk');
    await zip(file, [['assets/kernel_blob.bin', 'prefix ' + name]]);
    await assert.rejects(verifyZipArchive(file), /集成测试/);
  }
});

test('保留原后缀匹配，额外业务规则可选择准确文件名与必需功能标记', async (t) => {
  const directory = await temporary(t),
    prefixed = path.join(directory, 'prefixed.zip'),
    app = path.join(directory, 'app.apk');
  await zip(prefixed, [['prefix_kernel_blob.bin', 'app_flow_test.dart']]);
  await assert.rejects(verifyZipArchive(prefixed), /集成测试/);
  await verifyZipArchive(prefixed, {
    kernelEntryMode: 'basename',
    requiredKernelMarkers: ['/api/reverse'],
  });
  await zip(app, [['assets/kernel_blob.bin', 'normal app']]);
  await verifyZipArchive(app);
  await assert.rejects(
    verifyZipArchive(app, {
      kernelEntryMode: 'basename',
      requiredKernelMarkers: ['/api/reverse'],
      kernelMarkerError: '调试应用必须包含本版反查功能',
    }),
    /必须包含本版反查功能/,
  );
  await zip(app, [['assets/kernel_blob.bin', 'normal app /api/reverse']]);
  await verifyZipArchive(app, {
    kernelEntryMode: 'basename',
    requiredKernelMarkers: ['/api/reverse'],
  });
});

test('交付校验保留目录条目计数、清单 SHA-256 和报告格式', async (t) => {
  const directory = await temporary(t),
    file = path.join(directory, 'application.apk');
  await zip(file, [
    ['assets/', ''],
    ['assets/kernel_blob.bin', 'main app'],
  ]);
  await writeFile(
    path.join(directory, 'DELIVERY-MANIFEST.json'),
    JSON.stringify({ 文件: [{ 文件: 'application.apk', SHA256: await fileSHA256(file) }] }),
  );
  const report = await verifyDelivery({ directory, env: {} });
  assert.equal(report.产物[0].条目, 2);
  assert.equal(report.清单SHA256, '通过');
  assert.equal(report.产物[0].CRC, '通过');
  assert.deepEqual(
    JSON.parse(await readFile(path.join(directory, 'ARTIFACT-VERIFICATION.json'), 'utf8')),
    report,
  );
});

test('清单不匹配时失败，不生成成功报告', async (t) => {
  const directory = await temporary(t),
    file = path.join(directory, 'source.zip');
  await zip(file, [['source.js', 'export const value = 1;']]);
  await writeFile(
    path.join(directory, 'DELIVERY-MANIFEST.json'),
    JSON.stringify({ 文件: [{ 文件: 'source.zip', SHA256: '0'.repeat(64) }] }),
  );
  await assert.rejects(verifyDelivery({ directory, env: {} }), /SHA-256/);
  await assert.rejects(readFile(path.join(directory, 'ARTIFACT-VERIFICATION.json')), /ENOENT/);
});

test('验收附件使用 evidence 根目录，恢复位置与已有说明一致', async (t) => {
  const directory = await temporary(t),
    source = path.join(directory, 'raw evidence'),
    output = path.join(directory, 'evidence.zip');
  await mkdir(source);
  await writeFile(path.join(source, 'trace.log'), 'controlled trace');
  await createDirectoryZip(source, output, { prefix: 'evidence' });
  assert.deepEqual(await files(output), ['evidence/trace.log']);
});

test('输出目标错误以 Promise 拒绝返回，不产生未处理流错误', async (t) => {
  const directory = await temporary(t),
    source = path.join(directory, 'source');
  await mkdir(source);
  await writeFile(path.join(source, 'source.ts'), 'export const value = 1;');
  await assert.rejects(createSourceZip(source, directory), /EISDIR|illegal operation/);
});
