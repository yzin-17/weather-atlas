import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:timezone/data/latest.dart' as zones;
import 'package:weather_atlas/data.dart';
import 'package:weather_atlas/locale.dart';
import 'package:weather_atlas/main.dart';
import 'widget_test.dart' show controller, snapshot, jsonRes, tokyo;

const point = Place('point', '', '', '', 30.7513, 106.2048);
const names = {
  'zh-Hans': '高坪区',
  'zh-Hant': '高坪區',
  'en': 'Gaoping District',
  'ko': '가오핑구',
};
Json label(String language) => {
  'name': names[language],
  'locale': language,
  'names': names,
  'region': '',
  'country': '中国',
  'level': 'region',
  'source': 'photon-osm',
};
Future<void> flush(WidgetTester t) async {
  for (var i = 0; i < 4; i++) {
    await t.pump();
  }
}

http.Response other(http.Request r) => r.url.path == '/api/summaries'
    ? jsonRes({'items': []})
    : jsonRes(snapshot());

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(zones.initializeTimeZones);
  for (final language in names.keys) {
    testWidgets('$language 临时故障按退避恢复名称，天气与收藏身份保持原点', (t) async {
      var reverse = 0, weather = 0;
      final queries = <Map<String, String>>[];
      final c = await controller((r) async {
        if (r.url.path == '/api/reverse') {
          queries.add(r.url.queryParameters);
          return ++reverse == 1
              ? jsonRes({'place': null, 'retryAfterMs': 1000})
              : jsonRes({'place': label(language)});
        }
        if (r.url.path == '/api/weather') weather++;
        return other(r);
      });
      addTearDown(c.dispose);
      c.saved = [point];
      c.changeLocale(language);
      await c.select(point);
      await t.pumpWidget(Atlas(controller: c));
      await flush(t);
      expect(c.cityLookupFailed, isTrue);
      expect(find.text(Words(language)('retryCity')), findsOneWidget);
      final forecast = c.forecast;
      await t.pump(const Duration(milliseconds: 999));
      expect(reverse, 1);
      await t.pump(const Duration(milliseconds: 101));
      await flush(t);
      expect(
        reverse,
        2,
        reason:
            'queries=$queries locale=${c.locale} resolving=${c.resolvingCity} failed=${c.cityLookupFailed}',
      );
      expect(
        queries.every(
          (q) =>
              q['lat'] == '${point.lat}' &&
              q['lon'] == '${point.lon}' &&
              q['lang'] == language,
        ),
        isTrue,
      );
      expect(find.text(names[language]!), findsWidgets);
      expect(find.byKey(const ValueKey('retry-city')), findsNothing);
      expect(c.cityLookupFailed, isFalse);
      expect(c.resolvingCity, isFalse);
      expect(c.place.lat, point.lat);
      expect(c.place.lon, point.lon);
      expect(c.saved.single.name, names[language]);
      expect(c.saved.single.key, point.key);
      expect(identical(c.forecast, forecast), isTrue);
      expect(weather, 1);
      final stored = Place.fromJson(
        jsonDecode(c.prefs.getString('place')!) as Json,
      );
      expect(stored.name, names[language]);
      expect(
        cityLink(
          'https://weather.example',
          c.place,
          language,
        ).queryParameters['lat'],
        '${point.lat}',
      );
    });
    testWidgets('$language 无覆盖不循环，手动入口在途禁用且只重查名称', (t) async {
      var reverse = 0, weather = 0;
      final pending = Completer<http.Response>();
      final c = await controller((r) async {
        if (r.url.path == '/api/reverse') {
          reverse++;
          return reverse == 1
              ? jsonRes({'place': null, 'retryAfterMs': null})
              : pending.future;
        }
        if (r.url.path == '/api/weather') weather++;
        return other(r);
      });
      addTearDown(c.dispose);
      c.changeLocale(language);
      await c.select(point);
      await t.pumpWidget(Atlas(controller: c));
      await flush(t);
      await t.pump(const Duration(seconds: 12));
      expect(reverse, 1);
      final button = find.byKey(const ValueKey('retry-city'));
      expect(find.text(Words(language)('retryCity')), findsOneWidget);
      await t.tap(button);
      await flush(t);
      expect(c.resolvingCity, isTrue);
      expect(t.widget<FilledButton>(button).onPressed, isNull);
      expect(find.text(Words(language)('resolvingCity')), findsOneWidget);
      await c.retryCityLabel();
      expect(reverse, 2);
      pending.complete(jsonRes({'place': label(language)}));
      await flush(t);
      expect(c.place.name, names[language]);
      expect(weather, 1);
      expect(c.place.key, point.key);
      expect(find.byKey(const ValueKey('retry-city')), findsNothing);
    });
  }
  for (final status in [400, 408, 429, 503]) {
    testWidgets('HTTP $status 的名称重试分类与五秒退避', (t) async {
      var calls = 0;
      final c = await controller((r) async {
        if (r.url.path != '/api/reverse') return other(r);
        calls++;
        return calls == 1
            ? http.Response('{}', status)
            : jsonRes({'place': label('en')});
      });
      addTearDown(c.dispose);
      await c.select(point);
      await flush(t);
      await t.pump(const Duration(milliseconds: 4999));
      expect(calls, 1);
      await t.pump(const Duration(milliseconds: 1));
      await flush(t);
      expect(calls, status == 400 ? 1 : 2);
    });
  }
  testWidgets('网络超时最多三次，恢复前台可再次解析且不重取天气', (t) async {
    var reverse = 0, weather = 0, healthy = false;
    final c = await controller((r) async {
      if (r.url.path == '/api/reverse') {
        reverse++;
        if (!healthy) throw TimeoutException('controlled');
        return jsonRes({'place': label('en')});
      }
      if (r.url.path == '/api/weather') weather++;
      return other(r);
    });
    addTearDown(c.dispose);
    c.changeLocale('en');
    await c.select(point);
    await t.pumpWidget(Atlas(controller: c));
    await flush(t);
    for (var i = 0; i < 3; i++) {
      await t.pump(const Duration(seconds: 5));
      await flush(t);
    }
    expect(reverse, 3);
    expect(c.resolvingCity, isFalse);
    expect(c.cityLookupFailed, isTrue);
    healthy = true;
    t.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    t.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await flush(t);
    expect(reverse, 4);
    expect(c.place.name, names['en']);
    expect(weather, 1);
  });
  for (final action in ['city', 'language', 'origin', 'dispose']) {
    testWidgets('$action 取消排队的名称重试', (t) async {
      var reverse = 0;
      final c = await controller((r) async {
        if (r.url.path != '/api/reverse') return other(r);
        return ++reverse == 1
            ? jsonRes({'place': null, 'retryAfterMs': 1000})
            : jsonRes({'place': label('ko')});
      });
      c.changeLocale('en');
      await c.select(point);
      await flush(t);
      switch (action) {
        case 'city':
          await c.select(tokyo);
        case 'language':
          c.changeLocale('ko');
        case 'origin':
          await c.changeOrigin('https://new.invalid');
        case 'dispose':
          c.dispose();
      }
      await flush(t);
      await t.pump(const Duration(seconds: 3));
      await flush(t);
      expect(reverse, action == 'origin' || action == 'language' ? 2 : 1);
      if (action != 'dispose') c.dispose();
    });
  }
  test('退避字段有界，旧服务空结果兼容，异常结构不作为真实无覆盖', () async {
    Json data = {'place': null};
    final api = WeatherApi(
      'https://test.invalid',
      client: MockClient((r) async => jsonRes(data)),
    );
    addTearDown(api.close);
    expect((await api.reverseLookup(point, 'en')).retryDelay, isNull);
    for (final (raw, milliseconds) in [
      (-10, 1000),
      (1250, 1250),
      (90000, 10000),
    ]) {
      data = {'place': null, 'retryAfterMs': raw};
      expect(
        (await api.reverseLookup(point, 'en')).retryDelay?.inMilliseconds,
        milliseconds,
      );
    }
    data = {};
    await expectLater(api.reverseLookup(point, 'en'), throwsFormatException);
  });
  testWidgets('跟随系统时语言变化重启名称解析，旧请求不能留下永久加载态', (t) async {
    final old = Completer<http.Response>();
    var calls = 0;
    final c = await controller((r) async {
      if (r.url.path != '/api/reverse') return other(r);
      calls++;
      return r.url.queryParameters['lang'] == 'ko'
          ? jsonRes({'place': label('ko')})
          : old.future;
    });
    addTearDown(c.dispose);
    addTearDown(t.binding.platformDispatcher.clearLocaleTestValue);
    t.binding.platformDispatcher.localeTestValue = const Locale('en');
    await c.select(point);
    await t.pumpWidget(Atlas(controller: c));
    await flush(t);
    expect(c.resolvingCity, isTrue);
    t.binding.platformDispatcher.localeTestValue = const Locale('ko');
    await flush(t);
    expect(calls, 2);
    expect(c.place.name, names['ko']);
    expect(c.resolvingCity, isFalse);
    old.complete(jsonRes({'place': label('en')}));
    await flush(t);
    expect(c.place.name, names['ko']);
  });
}
