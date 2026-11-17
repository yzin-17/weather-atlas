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

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('原生真实 HTTP 断连、超时、旧缓存、恢复和慢城竞态', (t) async {
    zones.initializeTimeZones();
    const taipei = Place('1668341', 'Taipei', '', 'TW', 25.0478, 121.5319);
    final live = WeatherApi(const String.fromEnvironment('WEATHER_API_BASE'));
    final samples = [await live.weather(seoul), await live.weather(taipei)];
    live.close();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('mode', 'manual');
    await prefs.setString('saved', '[]');
    await prefs.setString('place', jsonEncode(seoul.toJson()));
    await prefs.setString('locale', 'zh-Hans');
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final origin = 'http://127.0.0.1:${server.port}';
    var mode = 'offline', serial = 0;
    final requests = <Json>[], results = <Json>[];
    server.listen((r) async {
      final requestedMode = mode;
      requests.add({
        'path': r.uri.path,
        'lat': r.uri.queryParameters['lat'],
        'mode': requestedMode,
      });
      try {
        if (requestedMode == 'offline') {
          (await r.response.detachSocket(writeHeaders: false)).destroy();
          return;
        }
        if (requestedMode == 'timeout') {
          await Future<void>.delayed(const Duration(seconds: 24));
        }
        final lat = double.parse(r.uri.queryParameters['lat']!);
        if (requestedMode == 'race' && lat == 38) {
          await Future<void>.delayed(const Duration(seconds: 1));
        }
        final old = requestedMode == 'stale';
        final value = {
          ...samples[lat < 30 ? 1 : 0].raw,
          'version': 'qa-$requestedMode-${++serial}',
          'stale': old,
          'fetchedAt': DateTime.now()
              .subtract(old ? const Duration(minutes: 20) : Duration.zero)
              .toUtc()
              .toIso8601String(),
        };
        r.response.headers.contentType = ContentType.json;
        r.response.write(jsonEncode(value));
        await r.response.close();
      } catch (_) {
        /* 客户端主动断开后的写入失败属于本场景。 */
      }
    });
    var c = WeatherController(WeatherApi(origin), prefs);
    Future<void> settleLoad() async {
      for (var i = 0; i < 120 && c.refreshing; i++) {
        await t.pump(const Duration(milliseconds: 250));
      }
      await t.pumpAndSettle();
    }

    try {
      runApp(Atlas(controller: c));
      await c.restore(autoLocate: false);
      await t.pumpAndSettle();
      expect(c.failed, isTrue);
      expect(c.forecast, isNull);
      expect(find.text(Words('zh-Hans')('retry')), findsOneWidget);
      results.add({'场景': '首次断连', '失败可重试': true});
      mode = 'ok';
      await t.tap(find.text(Words('zh-Hans')('retry')));
      await settleLoad();
      expect(c.failed, isFalse);
      expect(c.forecast!.hours.length, 24);
      expect(c.forecast!.timezone, 'Asia/Seoul');
      results.add({'场景': '实际点击重试恢复', '小时': c.forecast!.hours.length});
      mode = 'stale';
      await c.load(force: true);
      await t.pumpAndSettle();
      final oldTime = c.forecast!.fetchedAt;
      expect(c.failed, isTrue);
      expect(c.forecast!.stale, isTrue);
      expect(find.text(Words('zh-Hans')('stale')), findsOneWidget);
      expect(
        find.textContaining(
          hh(c.forecast!.local(oldTime.millisecondsSinceEpoch ~/ 1000)),
        ),
        findsWidgets,
      );
      results.add({
        '场景': '旧数据时间与标记',
        'fetchedAt': oldTime.toIso8601String(),
        'stale': true,
      });
      mode = 'timeout';
      final timer = Stopwatch()..start();
      await c.load(force: true);
      timer.stop();
      await t.pumpAndSettle();
      expect(timer.elapsedMilliseconds, greaterThanOrEqualTo(21000));
      expect(timer.elapsedMilliseconds, lessThan(30000));
      expect(c.failed, isTrue);
      expect(c.forecast!.fetchedAt, oldTime);
      results.add({
        '场景': '真实 HTTP 客户端超时',
        '毫秒': timer.elapsedMilliseconds,
        '旧时间未改变': true,
      });
      mode = 'offline';
      c.dispose();
      c = WeatherController(WeatherApi(origin), prefs);
      runApp(Atlas(controller: c));
      await c.restore(autoLocate: false);
      await t.pumpAndSettle();
      expect(c.failed, isTrue);
      expect(c.forecast!.fetchedAt, oldTime);
      results.add({'场景': '重建控制器后从持久缓存回退', '旧时间未改变': true});
      mode = 'ok';
      await c.load(force: true);
      await t.pumpAndSettle();
      expect(c.failed, isFalse);
      expect(c.forecast!.stale, isFalse);
      expect(c.forecast!.fetchedAt.isAfter(oldTime), isTrue);
      final before = requests.length;
      for (final lang in ['zh-Hans', 'zh-Hant', 'en', 'ko']) {
        c.changeLocale(lang);
        await t.pumpAndSettle();
      }
      expect(requests.length, before);
      results.add({'场景': '恢复后四语切换', '新增天气请求': requests.length - before});
      mode = 'race';
      final slow = c.select(const Place('slow', 'Slow', '', 'KR', 38, 127));
      await t.pump(const Duration(milliseconds: 250));
      await c.select(taipei);
      await slow;
      await t.pumpAndSettle();
      expect(c.place.id, taipei.id);
      expect(c.forecast!.timezone, 'Asia/Taipei');
      expect(c.forecast!.current.temp, samples[1].current.temp);
      results.add({
        '场景': '慢城不能覆盖手动台北',
        'city': c.place.id,
        'timezone': c.forecast!.timezone,
        'temp': c.forecast!.current.temp,
      });
      // 输出受控场景与请求投影，不输出问答、密钥或真实设备位置。
      debugPrint(
        'NATIVE_RESILIENCE ${jsonEncode({'结果': results, '请求': requests, '说明': '用真实城市快照构造原生回环 HTTP 故障，未假装是真实上游故障'})}',
      );
    } finally {
      c.dispose();
      await server.close(force: true);
    }
  });
}
