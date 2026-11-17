import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:integration_test/integration_test.dart';
import 'package:weather_atlas/main.dart' as app;
import 'package:weather_atlas/locale.dart';

// 使用普通应用入口、真实原生定位插件及本机真实天气服务。
// 运行前由 simctl 设置成都位置，不替换定位通道，也不调用模型。
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('成都原生定位、原坐标天气、刷新及名称恢复', (t) async {
    await app.main();
    await t.pump();
    final c = t.widget<app.Atlas>(find.byType(app.Atlas)).controller;
    c.changeLocale('zh-Hans');
    final w = Words('zh-Hans');
    await t.pumpAndSettle();
    debugPrint('CHENGDU_ORIGIN ${c.api.origin}');
    debugPrint('CHENGDU_PERMISSION ${await Geolocator.checkPermission()}');
    expect(c.api.origin, 'http://127.0.0.1:3300');
    await t.tap(find.text(w('locate')));
    final deadline = DateTime.now().add(const Duration(seconds: 40));
    while (DateTime.now().isBefore(deadline)) {
      await t.pump(const Duration(milliseconds: 100));
      await t.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 100)),
      );
      if (c.place.id == 'gps' && !c.refreshing && c.place.name.contains('成都')) {
        break;
      }
    }
    debugPrint(
      'CHENGDU_RESULT ${jsonEncode({'id': c.place.id, 'name': c.place.name, 'lat': c.place.lat, 'lon': c.place.lon, 'locationMessage': c.locationMessage, 'weatherMessage': c.weatherMessage, 'failed': c.failed, 'timezone': c.forecast?.timezone, 'source': c.forecast?.source, 'stale': c.forecast?.stale, 'version': c.forecast?.version})}',
    );
    expect(c.locationMessage, isNull);
    expect(c.place.id, 'gps');
    expect(c.place.lat, closeTo(30.5728, 0.00001));
    expect(c.place.lon, closeTo(104.0668, 0.00001));
    expect(c.place.name, contains('成都'));
    expect(c.failed, false, reason: c.weatherMessage);
    expect(c.forecast?.source, 'open-meteo');
    expect(c.forecast?.timezone, 'Asia/Shanghai');
    expect(c.forecast?.stale, false);
    expect(find.text(w('stale')), findsNothing);
    await t.runAsync(() => c.load(force: true));
    await t.pumpAndSettle();
    expect(c.failed, false, reason: c.weatherMessage);
    expect(c.weatherMessage, isNull);
    debugPrint('CHENGDU_REFRESH_OK ${c.forecast?.fetchedAt.toIso8601String()}');
    expect(t.takeException(), isNull);
  });
}
