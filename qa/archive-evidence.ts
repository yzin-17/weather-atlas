import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDirectoryZip } from './lib/archive.ts';

const [output, source = fileURLToPath(new URL('./evidence/', import.meta.url))] =
  process.argv.slice(2);
if (!output) throw Error('使用方式：node qa/archive-evidence.ts <输出ZIP路径> [原始证据目录]');
const result = await createDirectoryZip(path.resolve(source), path.resolve(output), {
  prefix: 'evidence',
});
console.log(`验收附件完整性校验通过：${result.entries} 个文件`);
