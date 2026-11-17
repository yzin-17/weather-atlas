import 'package:integration_test/integration_test.dart';
import '../test/widget_test.dart' as suite;

// 在原生运行环境复用四语延迟 HTTP 的界面回归，不作为真实上游或 GPS 验收。
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  suite.main();
}
