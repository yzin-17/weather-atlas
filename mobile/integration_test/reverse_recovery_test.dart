import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/data/latest.dart' as zones;
import 'package:weather_atlas/controller.dart';
import 'package:weather_atlas/data.dart';
import 'package:weather_atlas/locale.dart';
import 'package:weather_atlas/main.dart' show Atlas;
import '../test/widget_test.dart' show snapshot, tokyo;

const point = Place('point', '', '', '', 30.7513, 106.2048);
const names = {
  'zh-Hans': '高坪区',
  'zh-Hant': '高坪區',
  'en': 'Gaoping District',
  'ko': '가오핑구',
};
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  zones.initializeTimeZones();
  Future<void> until(WidgetTester t, bool Function() ready) async {
    final deadline = DateTime.now().add(const Duration(seconds: 20));
    while (!ready() && DateTime.now().isBefore(deadline)) {
      await t.pump(const Duration(milliseconds: 50));
      await t.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 50)),
      );
    }
    expect(ready(), isTrue);
    await t.pump();
  }

  for (final language in names.keys) {
    testWidgets('$language 原生 HTTP 名称重试、入口、上限与取消', (t) async {
      final prefs = await SharedPreferences.getInstance();
      final old = {
        for (final key in ['place', 'mode', 'locale', 'origin'])
          key: prefs.getString(key),
      };
      final calls = <Json>[];
      var mode = 'transient', reverse = 0, weather = 0;
      final release = Completer<void>();
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      server.listen((request) async {
        final selected = mode;
        final q = request.uri.queryParameters;
        calls.add({'path': request.uri.path, 'mode': selected, ...q});
        try {
          Json body;
          if (request.uri.path == '/api/reverse') {
            reverse++;
            if (selected == 'slow') await release.future;
            body =
                selected == 'empty' ||
                    selected == 'cap' ||
                    (selected == 'transient' && reverse == 1)
                ? {
                    'place': null,
                    'retryAfterMs': selected == 'empty' ? null : 1000,
                  }
                : {
                    'place': {
                      'name': names[q['lang']],
                      'locale': q['lang'],
                      'region': '',
                      'country': '中国',
                      'source': 'photon-osm',
                      'level': 'region',
                    },
                  };
          } else if (request.uri.path == '/api/summaries') {
            body = {'items': []};
          } else {
            weather++;
            body = snapshot();
          }
          request.response.headers.contentType = ContentType.json;
          request.response.write(jsonEncode(body));
          await request.response.close();
        } catch (_) {
          /* 已离开的请求允许取消。 */
        }
      });
      final c = WeatherController(
        WeatherApi('http://127.0.0.1:${server.port}'),
        prefs,
      );
      c.saved = [];
      c.changeLocale(language);
      await t.pumpWidget(Atlas(controller: c));
      try {
        unawaited(c.select(point));
        await until(t, () => c.cityLookupFailed && !c.refreshing);
        expect(find.text(Words(language)('retryCity')), findsOneWidget);
        await until(t, () => c.place.name == names[language]);
        expect(reverse, 2);
        expect(weather, 1);
        expect(c.place.lat, point.lat);
        expect(c.place.lon, point.lon);
        final forecast = c.forecast;

        mode = 'empty';
        await t.runAsync(c.retryCityLabel);
        await until(t, () => c.cityLookupFailed && !c.resolvingCity);
        final before = reverse;
        await t.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 1200)),
        );
        await t.pump();
        expect(reverse, before);
        mode = 'slow';
        await t.tap(find.byKey(const ValueKey('retry-city')));
        await until(t, () => c.resolvingCity);
        final button = t.widget<FilledButton>(
          find.byKey(const ValueKey('retry-city')),
        );
        expect(button.onPressed, isNull);
        expect(find.text(Words(language)('resolvingCity')), findsOneWidget);
        await c.retryCityLabel();
        release.complete();
        await until(t, () => !c.resolvingCity && !c.cityLookupFailed);
        expect(reverse, before + 1);
        expect(weather, 1);
        expect(identical(c.forecast, forecast), isTrue);

        mode = 'cap';
        final capStart = reverse;
        await t.runAsync(c.retryCityLabel);
        await until(t, () => reverse == capStart + 3 && !c.resolvingCity);
        await t.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 1300)),
        );
        await t.pump();
        expect(reverse, capStart + 3);
        expect(c.cityLookupFailed, isTrue);
        mode = 'success';
        c.resumeCityLabel();
        await until(t, () => !c.cityLookupFailed && !c.resolvingCity);
        expect(reverse, capStart + 4);
        expect(weather, 1);

        mode = 'cap';
        final cancelStart = reverse;
        await t.runAsync(c.retryCityLabel);
        unawaited(c.select(tokyo));
        await until(t, () => !c.refreshing);
        await t.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 1300)),
        );
        await t.pump();
        expect(reverse, cancelStart + 1);
        expect(c.place.id, tokyo.id);
        expect(c.cityLookupFailed, isFalse);
        expect(t.takeException(), isNull);
        debugPrint(
          'NATIVE_REVERSE_RECOVERY ${jsonEncode({'language': language, 'reverse': reverse, 'weather': weather, 'exactPoint': point.toJson(), 'calls': calls, 'result': '通过', 'modelCalls': 0, '说明': '原生真实 HTTP，名称与天气为受控样本；前台恢复调用控制器入口'})}',
        );
      } finally {
        if (!release.isCompleted) release.complete();
        c.dispose();
        await t.pumpWidget(const SizedBox());
        await server.close(force: true);
        for (final entry in old.entries) {
          if (entry.value case final String value) {
            await prefs.setString(entry.key, value);
          } else {
            await prefs.remove(entry.key);
          }
        }
      }
    });
  }
  testWidgets('原生连接当前服务解析截图坐标', (t) async {
    const base = String.fromEnvironment('WEATHER_API_BASE');
    expect(base, isNotEmpty);
    final prefs = await SharedPreferences.getInstance();
    final old = {
      for (final key in ['place', 'mode', 'locale']) key: prefs.getString(key),
    };
    final c = WeatherController(WeatherApi(base), prefs);
    c.saved = [];
    c.changeLocale('zh-Hans');
    await t.pumpWidget(Atlas(controller: c));
    try {
      unawaited(c.select(point));
      await until(
        t,
        () => c.place.name == '高坪区' && c.forecast != null && !c.refreshing,
      );
      expect(c.place.lat, point.lat);
      expect(c.place.lon, point.lon);
      expect(c.place.label?['level'], 'region');
      expect(c.place.label?['source'], 'photon-osm');
      expect(find.text('高坪区'), findsOneWidget);
      expect(c.cityLookupFailed, isFalse);
      expect(t.takeException(), isNull);
      debugPrint(
        'NATIVE_REVERSE_RECOVERY_LIVE ${jsonEncode({'base': base, 'name': c.place.name, 'lat': c.place.lat, 'lon': c.place.lon, 'timezone': c.forecast?.timezone, 'weatherStale': c.forecast?.stale, 'source': c.place.label?['source'], 'modelCalls': 0})}',
      );
    } finally {
      c.dispose();
      await t.pumpWidget(const SizedBox());
      for (final entry in old.entries) {
        if (entry.value case final String value) {
          await prefs.setString(entry.key, value);
        } else {
          await prefs.remove(entry.key);
        }
      }
    }
  });
}
