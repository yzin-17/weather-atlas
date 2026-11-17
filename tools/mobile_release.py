"""校验移动端发布输入、归档和校验和；仅依赖 Python 标准库。"""

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import urlsplit
import zipfile


ROOT = Path(__file__).resolve().parent.parent
VERSION = re.compile(r"^version:\s*([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)\+([0-9]+)\s*$", re.M)
SUFFIXES = (
    "Android-Debug.apk",
    "iOS-Simulator-Debug.app.zip",
    "iOS-Device-Release-Unsigned.app.zip",
)
TEST_ENTRIES = (
    "app_flow_test.dart", "location_test.dart", "resilience_test.dart",
    "reverse_flow_test.dart", "weather_map_test.dart", "selection_loading_test.dart",
    "chat_stream_test.dart", "reverse_recovery_test.dart",
)


def mobile_version(text):
    matches = VERSION.findall(text)
    if len(matches) != 1:
        raise ValueError("mobile/pubspec.yaml 必须有唯一的版本和数字构建号")
    return matches[0]


def validate_tag(tag, version, build):
    if tag and tag not in (f"v{version}", f"v{version}+{build}"):
        raise ValueError("标签必须与移动端版本一致：v<版本> 或 v<版本>+<构建号>")


def validate_origin(value):
    if not value:
        return
    parts = urlsplit(value)
    if (
        any(char.isspace() for char in value)
        or parts.scheme not in ("http", "https")
        or not parts.hostname
        or parts.username is not None
        or parts.password is not None
        or parts.path not in ("", "/")
        or parts.query
        or parts.fragment
    ):
        raise ValueError("服务地址须为无账号、查询参数或路径的 HTTP(S) origin")
    _ = parts.port


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def prepare():
    version, build = mobile_version((ROOT / "mobile/pubspec.yaml").read_text())
    tag = os.environ.get("RELEASE_TAG", "")
    validate_tag(tag, version, build)
    for name in ("WEATHER_API_BASE", "WEATHER_SITE_URL"):
        validate_origin(os.environ.get(name, ""))
    commit = git("rev-parse", "HEAD")
    if tag and git("rev-parse", "--verify", f"refs/tags/{tag}^{{commit}}") != commit:
        raise ValueError("标签指向与当前构建提交不一致")
    outputs = {
        "commit": commit, "tag": tag, "prefix": f"Weather-Atlas-v{version}-build{build}",
        "publish": str(bool(tag)).lower(), "prerelease": str("-" in version).lower(),
    }
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf8") as output:
        for name, value in outputs.items():
            output.write(f"{name}={value}\n")
    print(json.dumps(outputs, ensure_ascii=False))


def verify_archive(path):
    with zipfile.ZipFile(path) as archive:
        if archive.testzip() is not None:
            raise ValueError(f"归档 CRC 校验失败：{path.name}")
        names = archive.namelist()
        for name in names:
            if name.startswith("/") or ".." in Path(name).parts:
                raise ValueError(f"归档包含越界路径：{path.name}")
        if path.suffix == ".apk":
            if not {"AndroidManifest.xml", "classes.dex"}.issubset(names):
                raise ValueError("APK 缺少 Android 应用入口")
        elif "Runner.app/Info.plist" not in names or "Runner.app/Runner" not in names:
            raise ValueError("iOS ZIP 缺少 Runner.app 普通应用结构")
        kernels = [name for name in names if Path(name).name == "kernel_blob.bin"]
        if "Device-Release-Unsigned" not in path.name and not kernels:
            raise ValueError("调试产物缺少 Flutter kernel")
        for name in kernels:
            kernel = archive.read(name)
            if b"lib/main.dart" not in kernel or any(item.encode() in kernel for item in TEST_ENTRIES):
                raise ValueError("调试产物未使用普通应用入口")


def create_manifest(directory, version, build, commit):
    prefix = f"Weather-Atlas-v{version}-build{build}"
    expected = {f"{prefix}-{suffix}" for suffix in SUFFIXES}
    actual = {path.name for path in directory.iterdir() if path.suffix in (".apk", ".zip")}
    if actual != expected:
        raise ValueError("必须同时提供本次版本的 Android、iOS 模拟器和未签名设备三类产物")
    files = []
    for name in sorted(expected):
        path = directory / name
        verify_archive(path)
        digest = hashlib.sha256()
        with path.open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        files.append({"文件": name, "字节": path.stat().st_size, "SHA256": digest.hexdigest()})
    result = {"版本": version, "构建号": build, "提交": commit, "文件": files}
    (directory / "BUILD-MANIFEST.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    (directory / "SHA256SUMS").write_text("".join(f"{item['SHA256']}  {item['文件']}\n" for item in files))
    return result


def manifest():
    version, build = mobile_version((ROOT / "mobile/pubspec.yaml").read_text())
    commit = git("rev-parse", "HEAD")
    if commit != os.environ["EXPECTED_COMMIT"]:
        raise ValueError("发布任务检出的提交与构建提交不一致")
    result = create_manifest(ROOT / "dist", version, build, commit)
    notes = f"""# Weather Atlas {version}（构建 {build}）

构建提交：`{commit}`。分析与 Flutter 回归通过后，从 `lib/main.dart` 构建。

| 产物 | 使用方式 |
| --- | --- |
| Android Debug APK | 调试签名，可安装到 Android；不是商店发布包。 |
| iOS Simulator Debug ZIP | 解压 Runner.app 后使用 simctl install 安装到兼容架构模拟器。 |
| iOS Device Release Unsigned ZIP | 未签名设备构建，需要开发者证书和描述文件后才能在真机安装。 |

天气服务：{'使用仓库变量 WEATHER_API_BASE 指定的公开地址。' if os.environ.get('WEATHER_API_BASE') else '未配置默认公网服务；首次启动需在设置中填写可访问的天气服务地址。'}
Android 未设置固定调试密钥时，不同流水线的包可能需要卸载旧包后安装；保留数据升级需配置同一密钥。

下载后使用 SHA256SUMS 核对文件；BUILD-MANIFEST.json 记录同一提交及三类产物的大小和摘要。
本流水线只证明构建与自动测试，不代替真实 GPS、真机权限和前后台验收。
"""
    (ROOT / "dist/RELEASE-NOTES.md").write_text(notes)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    try:
        {"prepare": prepare, "manifest": manifest}[sys.argv[1]]()
    except (ValueError, KeyError, IndexError, subprocess.CalledProcessError, zipfile.BadZipFile) as error:
        sys.exit(str(error))
