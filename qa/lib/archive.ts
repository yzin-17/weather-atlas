import { Readable } from 'node:stream';
import { binaryChunks } from './bytes.ts';
import { jsonObject, recordsAt, textAt } from './json.ts';
import { requireValue } from '../../web/lib/validation.ts';
import { createReadStream, createWriteStream, type PathLike } from 'node:fs';
import { readdir, mkdir, readFile, writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import yazl from 'yazl';
import yauzl from 'yauzl';
import crc32 from 'crc-32';

const excluded = new Set([
  'node_modules',
  'Pods',
  'build',
  '.git',
  '.dart_tool',
  '.gradle',
  '.format-tools',
  '__pycache__',
  '.symlinks',
  'ephemeral',
  '.DS_Store',
  '.flutter-plugins-dependencies',
  'local.properties',
  'Generated.xcconfig',
  'flutter_export_environment.sh',
]);
const environmentExamples = new Set(['.env.example', '.env.https.example']);
const signingExtensions = new Set(['.jks', '.keystore', '.p12', '.p8', '.key', '.mobileprovision']);
const forbiddenKernelFiles = [
  'app_flow_test.dart',
  'location_test.dart',
  'resilience_test.dart',
  'reverse_flow_test.dart',
  'weather_map_test.dart',
  'selection_loading_test.dart',
  'chat_stream_test.dart',
  'reverse_recovery_test.dart',
];

function included(name: string) {
  return (
    !excluded.has(name) &&
    name !== 'next-env.d.ts' &&
    !name.endsWith('.tsbuildinfo') &&
    !['.cache', '.next', '.weather-cache'].some((prefix) => name.startsWith(prefix)) &&
    (!name.startsWith('.env') || environmentExamples.has(name)) &&
    !signingExtensions.has(path.extname(name)) &&
    !name.endsWith('-key.pem')
  );
}

export async function verifyZipArchive(
  file: string,
  {
    secrets = [],
    kernelEntryMode = 'suffix',
    requiredKernelMarkers = [],
    kernelMarkerError = '调试应用缺少必需功能标记',
  }: {
    secrets?: string[];
    kernelEntryMode?: string;
    requiredKernelMarkers?: string[];
    kernelMarkerError?: string;
  } = {},
) {
  if (!['suffix', 'basename'].includes(kernelEntryMode)) throw Error('无效的应用入口匹配方式');
  const secretBuffers = secrets.filter((value) => value.length).map((value) => Buffer.from(value));
  const forbidden = forbiddenKernelFiles.map((value) => Buffer.from(value));
  const required = requiredKernelMarkers.map((value) => Buffer.from(value));
  const overlap =
    Math.max(1, ...[...secretBuffers, ...forbidden, ...required].map((value) => value.length)) - 1;
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true, validateEntrySizes: true }, (error, result) =>
      error ? reject(error) : result ? resolve(result) : reject(Error('ZIP 未返回句柄')),
    ),
  );
  return new Promise<{ entries: number }>((resolve, reject) => {
    let count = 0;
    const fail = (error: unknown) => {
      zip.close();
      reject(error);
    };
    zip.once('error', fail);
    zip.once('end', () => resolve({ entries: count }));
    zip.on('entry', (entry: yauzl.Entry) => {
      count++;
      if (entry.fileName.endsWith('/')) {
        zip.readEntry();
        return;
      }
      zip.openReadStream(entry, (error, stream) => {
        if (error) {
          fail(error);
          return;
        }
        (async () => {
          const kernel =
            kernelEntryMode === 'basename'
              ? path.posix.basename(entry.fileName) === 'kernel_blob.bin'
              : entry.fileName.endsWith('kernel_blob.bin');
          let checksum = 0,
            tail = Buffer.alloc(0);
          const found = required.map(() => false);
          for await (const chunk of binaryChunks(requireValue(stream))) {
            checksum = crc32.buf(chunk, checksum);
            const buffer = Buffer.concat([tail, chunk]);
            if (secretBuffers.some((secret) => buffer.includes(secret)))
              throw Error('拒绝包含实际凭据的产物');
            if (kernel) {
              if (forbidden.some((value) => buffer.includes(value)))
                throw Error('拒绝交付以集成测试为入口的调试应用');
              required.forEach((value, index) => {
                found[index] ||= buffer.includes(value);
              });
            }
            tail = overlap
              ? buffer.subarray(Math.max(0, buffer.length - overlap))
              : Buffer.alloc(0);
          }
          if (checksum >>> 0 !== entry.crc32) throw Error(`ZIP CRC 校验失败：${entry.fileName}`);
          if (kernel && found.some((value) => !value)) throw Error(kernelMarkerError);
          zip.readEntry();
        })().catch(fail);
      });
    });
    zip.readEntry();
  });
}

export async function createDirectoryZip(
  root: string,
  output: string,
  {
    prefix = path.basename(root),
    filter = (_name: string): boolean => true,
  }: { prefix?: string; filter?: (name: string) => boolean } = {},
) {
  const zip = new yazl.ZipFile();
  await mkdir(path.dirname(output), { recursive: true });
  const done = pipeline(zip.outputStream, createWriteStream(output));
  // 添加目录期间也可能发生输出流错误，先注册处理器，再在末尾统一报告。
  done.catch(() => {});
  const destroy = (error: unknown) => {
    if (zip.outputStream instanceof Readable)
      zip.outputStream.destroy(error instanceof Error ? error : new Error(String(error)));
  };
  zip.on('error', destroy);
  let entries = 0;
  async function add(directory: string, parts: string[] = []) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (!filter(entry.name) || entry.isSymbolicLink()) continue;
      const file = path.join(directory, entry.name),
        relative = [...parts, entry.name];
      if (path.resolve(file) === path.resolve(output)) continue;
      if (entry.isDirectory()) await add(file, relative);
      else if (entry.isFile()) {
        zip.addFile(file, [prefix, ...relative].join('/'));
        entries++;
      }
    }
  }
  try {
    await add(root);
    zip.end();
    await done;
  } catch (error) {
    destroy(error);
    await done.catch(() => {});
    throw error;
  }
  await verifyZipArchive(output);
  return { entries };
}

export function createSourceZip(root: string, output: string) {
  return createDirectoryZip(root, output, { prefix: 'weather-atlas', filter: included });
}

export async function fileSHA256(file: PathLike) {
  const hash = createHash('sha256');
  for await (const chunk of binaryChunks(createReadStream(file))) hash.update(chunk);
  return hash.digest('hex');
}

export async function verifyDelivery({
  directory,
  env = process.env,
  ...rules
}: {
  directory: string;
  env?: Record<string, string | undefined>;
  secrets?: string[];
  kernelEntryMode?: string;
  requiredKernelMarkers?: string[];
  kernelMarkerError?: string;
}) {
  const secrets = ['OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'AI_API_KEY']
    .map((name) => env[name])
    .filter((value): value is string => !!value);
  const artifacts: { 文件: string; CRC: string; 凭据检查: string; 条目: number }[] = [];
  for (const name of (await readdir(directory)).sort()) {
    if (!['.zip', '.apk'].includes(path.extname(name))) continue;
    const result = await verifyZipArchive(path.join(directory, name), { secrets, ...rules });
    artifacts.push({
      文件: name,
      CRC: '通过',
      凭据检查: '未包含本次环境中的实际模型密钥',
      条目: result.entries,
    });
  }
  const manifest = jsonObject(
    await readFile(path.join(directory, 'DELIVERY-MANIFEST.json'), 'utf8'),
  );
  for (const item of recordsAt(manifest, '文件')) {
    const name = textAt(item, '文件'),
      hash = textAt(item, 'SHA256');
    if ((await fileSHA256(path.join(directory, name))) !== hash)
      throw Error(`清单 SHA-256 不匹配：${name}`);
  }
  const report: {
    时间: string;
    产物: { 文件: string; CRC: string; 凭据检查: string; 条目: number }[];
    清单SHA256: '通过';
  } = { 时间: new Date().toISOString(), 产物: artifacts, 清单SHA256: '通过' };
  await writeFile(
    path.join(directory, 'ARTIFACT-VERIFICATION.json'),
    JSON.stringify(report, null, 2),
  );
  return report;
}
