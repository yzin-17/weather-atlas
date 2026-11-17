import { errorInfo } from '../web/lib/errors.ts';
import { type PathLike } from 'node:fs';
import { readFile, mkdir, copyFile, writeFile, type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const template = fileURLToPath(
  new URL('./fixtures/ios-permission-probe/PermissionProbe.xcodeproj/', import.meta.url),
);
const projectFiles = ['project.pbxproj', 'xcshareddata/xcschemes/PermissionUI.xcscheme'];

// 原生工程配置保留为经过 Xcode 验证的固定模板；不再使用 Ruby/xcodeproj 生成。
export async function generatePermissionProject(output: string, source?: PathLike | FileHandle) {
  if (!output || !source) throw Error('需要输出目录和 Swift 测试文件');
  const swift = await readFile(source);
  const directory = path.resolve(output),
    project = path.join(directory, 'PermissionProbe.xcodeproj');
  await mkdir(directory, { recursive: true });
  for (const relative of projectFiles) {
    const target = path.join(project, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(template, relative), target);
  }
  await writeFile(path.join(directory, 'PermissionUI.swift'), swift);
  await writeFile(
    path.join(directory, 'Probe.swift'),
    'import UIKit\n@main class AppDelegate: UIResponder, UIApplicationDelegate { var window: UIWindow? }\n',
  );
  return project;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    console.log(await generatePermissionProject(process.argv[2] || '', process.argv[3]));
  } catch (error) {
    console.error(errorInfo(error).message);
    process.exitCode = 1;
  }
}
