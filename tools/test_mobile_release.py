"""覆盖标签、服务地址、归档完整性及普通入口的发布门禁。"""

from pathlib import Path
import tempfile
import unittest
import zipfile

from mobile_release import create_manifest, mobile_version, validate_origin, validate_tag, verify_archive


class MobileReleaseTest(unittest.TestCase):
    def test_version_and_tag(self):
        self.assertEqual(mobile_version("name: x\nversion: 1.1.2+5\n"), ("1.1.2", "5"))
        for tag in ("", "v1.1.2", "v1.1.2+5"):
            validate_tag(tag, "1.1.2", "5")
        for tag in ("v1.1.1", "v1.1.2+4", "main", "v1.1.2\nx=1"):
            with self.subTest(tag=tag), self.assertRaises(ValueError):
                validate_tag(tag, "1.1.2", "5")

    def test_prerelease_and_invalid_version(self):
        self.assertEqual(mobile_version("version: 1.2.0-rc.1+6"), ("1.2.0-rc.1", "6"))
        for value in ("version: 1.2.0", "version: 1.2.0+six", "version: 1.2.0+6\nversion: 1.2.0+7"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                mobile_version(value)

    def test_service_origin(self):
        for value in ("", "https://weather.example.org", "http://192.168.5.22:3300", "http://[::1]:3000/"):
            validate_origin(value)
        for value in ("https://x/?key=secret", "https://u:p@x", "https://x/api", "https://x\nx=1", "file:///x", "https://x:abc"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_origin(value)

    def archive(self, directory, suffix, kernel=b"file:///mobile/lib/main.dart"):
        path = directory / f"Weather-Atlas-v1.1.2-build5-{suffix}"
        with zipfile.ZipFile(path, "w") as archive:
            if suffix.endswith(".apk"):
                archive.writestr("AndroidManifest.xml", b"manifest")
                archive.writestr("classes.dex", b"dex")
                archive.writestr("assets/flutter_assets/kernel_blob.bin", kernel)
            else:
                archive.writestr("Runner.app/Info.plist", b"plist")
                archive.writestr("Runner.app/Runner", b"binary")
                if "Debug" in suffix:
                    archive.writestr("Runner.app/Frameworks/App.framework/flutter_assets/kernel_blob.bin", kernel)
        return path

    def test_complete_manifest(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            for suffix in ("Android-Debug.apk", "iOS-Simulator-Debug.app.zip", "iOS-Device-Release-Unsigned.app.zip"):
                self.archive(directory, suffix)
            result = create_manifest(directory, "1.1.2", "5", "a" * 40)
            self.assertEqual(len(result["文件"]), 3)
            self.assertEqual(len((directory / "SHA256SUMS").read_text().splitlines()), 3)
            self.assertTrue(all(len(item["SHA256"]) == 64 for item in result["文件"]))

    def test_missing_or_wrong_version_blocks_manifest(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            self.archive(directory, "Android-Debug.apk")
            with self.assertRaises(ValueError):
                create_manifest(directory, "1.1.2", "5", "a" * 40)
            with self.assertRaises(ValueError):
                create_manifest(directory, "1.1.3", "6", "a" * 40)

    def test_integration_entry_and_missing_main_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            for kernel in (b"lib/main.dart reverse_recovery_test.dart", b"lib/other.dart"):
                path = self.archive(Path(temp), "Android-Debug.apk", kernel)
                with self.assertRaises(ValueError):
                    verify_archive(path)

    def test_missing_kernel_and_traversal_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            path = self.archive(Path(temp), "iOS-Simulator-Debug.app.zip")
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("Runner.app/Info.plist", b"plist")
                archive.writestr("Runner.app/Runner", b"binary")
            with self.assertRaises(ValueError):
                verify_archive(path)
            with zipfile.ZipFile(path, "a") as archive:
                archive.writestr("../escape", b"bad")
            with self.assertRaises(ValueError):
                verify_archive(path)


if __name__ == "__main__":
    unittest.main()
