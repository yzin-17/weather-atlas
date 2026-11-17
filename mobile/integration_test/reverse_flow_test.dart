import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:integration_test/integration_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/data/latest.dart' as zones;
import 'package:weather_atlas/controller.dart';
import 'package:weather_atlas/data.dart';
import 'package:weather_atlas/locale.dart';
import 'package:weather_atlas/main.dart' show Atlas;

class CountedClient extends http.BaseClient {
  final inner = http.Client();
  final calls = <Uri>[];
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    calls.add(request.url);
    return inner.send(request);
  }

  @override
  void close() => inner.close();
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('真实城市标签、四语、原点、分享、降级与迟到结果', (t) async {
    zones.initializeTimeZones();
    const base = String.fromEnvironment('WEATHER_API_BASE');
    const point = Place('point', '', '', '', 25.0478, 121.5319);
    const tokyo = Place('1850147', 'Tokyo', '', 'JP', 35.6895, 139.6917);
    final seed = WeatherApi(base);
    final taipeiWeather = await seed.weather(point),
        tokyoWeather = await seed.weather(tokyo);
    final realLabel = await seed.reverse(point, 'zh-Hans');
    expect(realLabel?['name'], '台北');
    expect(realLabel?['source'], 'photon-osm');
    seed.close();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('mode', 'manual');
    await prefs.setString('locale', 'zh-Hans');
    await prefs.setString('saved', '[]');
    final transport = CountedClient();
    final c = WeatherController(WeatherApi(base, client: transport), prefs);
    c.saved = [];
    c.changeLocale('zh-Hans');
    runApp(Atlas(controller: c));
    Future<void> waitFor(bool Function() ready) async {
      for (var i = 0; i < 100 && !ready(); i++) {
        await t.pump(const Duration(milliseconds: 100));
      }
      expect(ready(), isTrue);
      await t.pumpAndSettle();
    }

    final results = <Json>[];
    HttpServer? local;
    final release = Completer<void>(), arrived = Completer<void>();
    var mode = 'empty';
    final controlled = <Json>[];
    try {
      await c.select(point);
      await waitFor(() => c.place.name == '台北' && c.forecast != null);
      expect(c.place.id, 'point');
      expect(c.place.lat, point.lat);
      expect(c.place.lon, point.lon);
      expect(c.forecast!.timezone, 'Asia/Taipei');
      expect(find.text('台北'), findsOneWidget);
      results.add({
        '场景': '真实 Photon 标签',
        'name': c.place.name,
        'lat': c.place.lat,
        'lon': c.place.lon,
        'timezone': c.forecast!.timezone,
      });
      c.toggleSave(c.place);
      final before = transport.calls
          .where((u) => u.path == '/api/weather')
          .length;
      var current = 'zh-Hans';
      const expected = {
        'zh-Hant': '臺北',
        'en': 'Taipei',
        'ko': '타이베이',
        'zh-Hans': '台北',
      };
      for (final lang in ['zh-Hant', 'en', 'ko', 'zh-Hans']) {
        await t.tap(find.byTooltip(Words(current)('language')));
        await t.pumpAndSettle();
        await t.tap(find.text(languageNames[lang]!));
        await t.pumpAndSettle();
        await waitFor(() => c.place.name == expected[lang]);
        expect(find.text(expected[lang]!), findsOneWidget);
        current = lang;
      }
      expect(
        transport.calls.where((u) => u.path == '/api/weather').length,
        before,
      );
      final stored = Place.fromJson(
        jsonDecode(prefs.getString('place')!) as Json,
      );
      expect(stored.name, '台北');
      expect(stored.lat, point.lat);
      expect(stored.label?['source'], 'photon-osm');
      results.add({'场景': '实际菜单四语与持久化', '新增天气请求': 0, 'name': stored.name});
      await t.tap(find.byTooltip(Words(current)('copyLink')));
      await t.pumpAndSettle();
      final copied = (await Clipboard.getData('text/plain'))!.text!,
          link = Uri.parse(copied);
      expect(link.path, '/zh-Hans/explore');
      expect(link.queryParameters['lat'], '${point.lat}');
      expect(link.queryParameters['lon'], '${point.lon}');
      expect(link.queryParameters['id'], 'point');
      results.add({'场景': '实际剪贴板原点链接', 'URL': copied});
      local = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      local.listen((request) async {
        final selected = mode;
        controlled.add({
          'path': request.uri.path,
          'lat': request.uri.queryParameters['lat'],
          'mode': selected,
        });
        try {
          Json body;
          if (request.uri.path == '/api/reverse') {
            if (selected == 'late') {
              if (!arrived.isCompleted) arrived.complete();
              await release.future;
            }
            body = {'place': selected == 'late' ? realLabel : null};
          } else if (request.uri.path == '/api/summaries') {
            body = {'items': []};
          } else {
            body = request.uri.queryParameters['lat'] == '${tokyo.lat}'
                ? tokyoWeather.raw
                : taipeiWeather.raw;
          }
          request.response.headers.contentType = ContentType.json;
          request.response.write(jsonEncode(body));
          await request.response.close();
        } catch (_) {
          /* 离开旧连接后的写入错误属于故障场景。 */
        }
      });
      await c.changeOrigin('http://127.0.0.1:${local.port}');
      await c.select(
        const Place('point', '', 'Known region', '', 25.0481, 121.5321),
      );
      await waitFor(() => !c.refreshing);
      expect(c.place.name, 'Known region');
      expect(c.place.lat, 25.0481);
      expect(c.forecast, isNotNull);
      results.add({'场景': '区域回退', 'name': c.place.name, 'lat': c.place.lat});
      await c.select(const Place('point', '', '', '', 25.0482, 121.5322));
      await waitFor(() => !c.refreshing);
      expect(c.place.name, '25.0482, 121.5322');
      results.add({'场景': '坐标回退', 'name': c.place.name});
      mode = 'late';
      await c.select(const Place('point', '', '', '', 25.1, 121.5));
      await waitFor(() => arrived.isCompleted);
      await c.select(tokyo);
      release.complete();
      await t.pump(const Duration(milliseconds: 500));
      await t.pumpAndSettle();
      expect(c.place.id, tokyo.id);
      expect(c.forecast!.timezone, 'Asia/Tokyo');
      expect(c.forecast!.current.temp, tokyoWeather.current.temp);
      results.add({
        '场景': '迟到解析不覆盖手选',
        'id': c.place.id,
        'timezone': c.forecast!.timezone,
        'temp': c.forecast!.current.temp,
      });
      debugPrint(
        'NATIVE_REVERSE ${jsonEncode({
          '结果': results,
          '实际服务请求': transport.calls.where((u) => u.host == Uri.parse(base).host).map((u) => {'path': u.path, 'lat': u.queryParameters['lat'], 'lon': u.queryParameters['lon'], 'lang': u.queryParameters['lang']}).toList(),
          '受控请求': controlled,
          '说明': '城市标签成功来自真实服务；回退与迟到由原生回环 HTTP 构造',
        })}',
      );
    } finally {
      if (!release.isCompleted) release.complete();
      c.dispose();
      await local?.close(force: true);
    }
  });
}
