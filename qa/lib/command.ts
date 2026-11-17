import { requireValue } from '../../web/lib/validation.ts';
import { spawn } from 'node:child_process';
import { open } from 'node:fs/promises';

// 参数数组直接传给原生工具，不通过 Shell；长日志直接写文件。
export async function execute(
  command: string,
  args: readonly (string | number)[],
  {
    logPath,
    capture = false,
    input,
    signal,
  }: { logPath?: string; capture?: boolean; input?: string | Buffer; signal?: AbortSignal } = {},
) {
  const log = logPath ? await open(logPath, 'w') : null;
  try {
    return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(command, args.map(String), {
        stdio: [
          input === undefined ? 'ignore' : 'pipe',
          log ? log.fd : capture ? 'pipe' : 'ignore',
          log ? log.fd : 'pipe',
        ],
        signal,
      });
      const stdout: Buffer[] = [],
        stderr: Buffer[] = [];
      let bytes = 0;
      child.stdout?.on('data', (data: Buffer) => {
        bytes += data.length;
        if (bytes > 4 * 1024 * 1024) {
          child.kill();
          reject(Error('原生工具输出超过限制'));
        } else stdout.push(data);
      });
      child.stderr?.on('data', (data: Buffer) => {
        if (Buffer.concat(stderr).length < 64 * 1024) stderr.push(data);
      });
      child.once('error', reject);
      child.once('close', (code, signalName) => {
        const output = {
          stdout: Buffer.concat(stdout).toString(),
          stderr: Buffer.concat(stderr).toString(),
        };
        if (code === 0) resolve(output);
        else
          reject(
            Error(`${command} 执行失败（${code ?? signalName}）${output.stderr.slice(-1200)}`),
          );
      });
      if (input !== undefined) {
        requireValue(child.stdin).on('error', () => {});
        requireValue(child.stdin).end(input);
      }
    });
  } finally {
    await log?.close();
  }
}
