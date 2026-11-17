import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/data/latest.dart' as zones;
import 'package:weather_atlas/controller.dart';
import 'package:weather_atlas/data.dart';
import 'package:weather_atlas/main.dart' show Atlas;

// 权限和模拟坐标由 simctl/adb 在测试前配置；此处调用实际原生定位插件。
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('原生定位权限与手动搜索回退', (t) async {
    zones.initializeTimeZones();
    const base = String.fromEnvironment('WEATHER_API_BASE');
    const permissionCase = String.fromEnvironment(
      'LOCATION_CASE',
      defaultValue: 'granted',
    );
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('mode', 'gps');
    await prefs.remove('place');
    await prefs.remove('saved');
    final c = WeatherController(WeatherApi(base), prefs);
    try {
      runApp(Atlas(controller: c));
      await t.pumpAndSettle();
      await c.restore();
      for (var i = 0; i < 60; i++) {
        await t.pump(const Duration(milliseconds: 250));
        if (permissionCase != 'granted'
            ? c.locationMessage != null
            : c.place.id == 'gps' && c.forecast != null && !c.refreshing) {
          break;
        }
      }
      if (permissionCase != 'granted') {
        expect(
          c.locationMessage,
          permissionCase == 'timeout' ? 'gpsTimeout' : 'denied',
        );
        final list = await c.api.search('台北', 'zh-Hans');
        expect(list, isNotEmpty);
        await c.select(list.first);
        expect(c.forecast?.timezone, 'Asia/Taipei');
        expect(prefs.getString('mode'), 'manual');
      } else {
        expect(c.place.id, 'gps', reason: c.locationMessage);
        expect(c.forecast, isNotNull);
        final stored = jsonDecode(prefs.getString('place')!);
        expect((stored['lat'] as num).toDouble(), closeTo(25.0478, .01));
        expect((stored['lon'] as num).toDouble(), closeTo(121.5319, .01));
        expect(c.forecast!.timezone, 'Asia/Taipei');
      }
    } finally {
      c.dispose();
    }
  });
}
