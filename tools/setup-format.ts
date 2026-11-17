import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { toolsDirectory, versions, dartExecutable, xcodeTool, run } from './format-runtime.ts';

await mkdir(toolsDirectory, { recursive: true });
const jar = path.join(toolsDirectory, `ktfmt-${versions.ktfmt.version}.jar`);
const digest = (data: string | NodeJS.ArrayBufferView<ArrayBufferLike> | NonSharedBuffer) =>
  createHash('sha256').update(data).digest('hex');
if (!existsSync(jar) || digest(await readFile(jar)) !== versions.ktfmt.sha256) {
  console.log('下载并校验 ktfmt');
  const size = Math.ceil(versions.ktfmt.bytes / 8);
  const chunks = await Promise.all(
    Array.from({ length: 8 }, async (_, i) => {
      const start = i * size,
        end = Math.min(start + size, versions.ktfmt.bytes) - 1;
      const response = await fetch(versions.ktfmt.url, {
        headers: { Range: `bytes=${start}-${end}` },
        signal: AbortSignal.timeout(180_000),
      });
      if (
        response.status !== 206 ||
        response.headers.get('content-range') !== `bytes ${start}-${end}/${versions.ktfmt.bytes}`
      )
        throw Error(`ktfmt 分段下载失败：${response.status}`);
      const chunk = Buffer.from(await response.arrayBuffer());
      if (chunk.length !== end - start + 1) throw Error('ktfmt 分段长度不符');
      return chunk;
    }),
  );
  const data = Buffer.concat(chunks);
  if (digest(data) !== versions.ktfmt.sha256) throw Error('ktfmt SHA-256 校验失败');
  await writeFile(jar + '.tmp', data);
  await rename(jar + '.tmp', jar);
}
run(dartExecutable(), ['--version']);
run(xcodeTool('swift-format'), ['--version']);
run(xcodeTool('clang-format'), ['--version']);
console.log('格式化工具准备完成；缓存位于 .format-tools/，不进入提交');
