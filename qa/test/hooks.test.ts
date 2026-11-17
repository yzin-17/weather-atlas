import test from 'node:test';
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';

test('Hooks 门禁拦截条件调用和缺失依赖，接受完整依赖', async () => {
  const lint = new ESLint({ cwd: fileURLToPath(new URL('../..', import.meta.url)) });
  const [invalid] = await lint.lintText(
    `import { useEffect, useState } from 'react';
     export default function Probe({ value }: { value: boolean }) {
       if (value) useState(0);
       useEffect(() => { document.title = String(value); }, []);
       return null;
     }`,
    { filePath: 'web/components/HookProbe.tsx' },
  );
  assert(invalid.messages.some((m) => m.ruleId === 'react-hooks/rules-of-hooks'));
  assert(invalid.messages.some((m) => m.ruleId === 'react-hooks/exhaustive-deps'));
  const [valid] = await lint.lintText(
    `import { useEffect } from 'react';
     export default function Probe({ value }: { value: boolean }) {
       useEffect(() => { document.title = String(value); }, [value]);
       return null;
     }`,
    { filePath: 'web/components/HookProbe.tsx' },
  );
  assert.equal(valid.errorCount, 0);
  assert.equal(valid.warningCount, 0);
});
