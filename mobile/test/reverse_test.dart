import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:weather_atlas/controller.dart';
import 'package:weather_atlas/data.dart';
import 'widget_test.dart' show controller, snapshot, jsonRes, tokyo;

const label = {
  'name': 'Taipei',
  'region': 'Zhongshan',
  'country': 'Taiwan',
  'level': 'city',
  'source': 'photon-osm',
  'names': {'zh-Hans': '台北', 'zh-Hant': '臺北', 'en': 'Taipei', 'ko': '타이베이'},
  'countries': {'zh-Hans': '台湾', 'zh-Hant': '臺灣', 'en': 'Taiwan', 'ko': '대만'},
};
Future<void> flush() async {
  for (var i = 0; i < 15; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

http.Response weather(http.Request r) => jsonRes({
  ...snapshot(),
  'timezone': r.url.queryParameters['lat'] == '${tokyo.lat}'
      ? 'Asia/Tokyo'
      : 'Asia/Taipei',
});

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'saved map point has coordinate fallback and late lookup cannot re-add removed favorite',
    () async {
      final pending = Completer<http.Response>();
      final c = await controller(
        (r) async => r.url.path == '/api/reverse'
            ? pending.future
            : jsonRes({'items': []}),
      );
      c.saved = [];
      const p = Place('point', '', '', '', 25.1, 121.5);
      c.toggleSave(p);
      expect(c.saved.single.name, '25.1000, 121.5000');
      c.toggleSave(p);
      pending.complete(jsonRes({'place': label}));
      await flush();
      expect(c.saved, isEmpty);
      c.dispose();
    },
  );
  test(
    'GPS point gets city, keeps original coordinate identity, translates and persists without fetching weather on language change',
    () async {
      var weatherCalls = 0;
      final c = await controller((r) async {
        if (r.url.path == '/api/reverse') {
          return jsonRes({
            'place': {...label, 'locale': r.url.queryParameters['lang']},
          });
        }
        if (r.url.path == '/api/summaries') return jsonRes({'items': []});
        weatherCalls++;
        return weather(r);
      });
      c.changeLocale('zh-Hans');
      const point = Place('gps', '', '', '', 25.01000123, 121.59998765);
      await c.select(point, gps: true);
      await flush();
      expect(c.place.name, '台北');
      expect(c.place.id, 'gps');
      expect(c.place.lat, point.lat);
      expect(c.place.lon, point.lon);
      expect(c.forecast!.timezone, 'Asia/Taipei');
      expect(c.prefs.getString('mode'), 'gps');
      c.toggleSave(c.place);
      await flush();
      expect(c.saved.last.name, '台北');
      c.changeLocale('ko');
      await flush();
      expect(c.place.name, '타이베이');
      expect(weatherCalls, 1);
      final link = cityLink('https://weather.example', c.place, 'ko');
      expect(link.path, '/ko/explore');
      expect(link.queryParameters['lat'], '${point.lat}');
      expect(link.queryParameters['id'], 'gps');
      final stored = Place.fromJson(
        jsonDecode(c.prefs.getString('place')!) as Json,
      );
      expect(stored.label!['source'], 'photon-osm');
      expect(stored.lat, point.lat);
      final restored = WeatherController(
        WeatherApi(
          c.api.origin,
          client: MockClient((r) async {
            if (r.url.path == '/api/reverse') return jsonRes({'place': label});
            if (r.url.path == '/api/summaries') return jsonRes({'items': []});
            weatherCalls++;
            return weather(r);
          }),
        ),
        c.prefs,
      );
      await restored.restore(autoLocate: false);
      await flush();
      expect(restored.place.name, '타이베이');
      expect(weatherCalls, 1);
      restored.dispose();
      c.dispose();
    },
  );
  test(
    'failed or empty reverse uses existing region then coordinates while weather succeeds',
    () async {
      for (final region in ['Known region', '']) {
        final c = await controller((r) async {
          if (r.url.path == '/api/reverse') {
            throw TimeoutException('reverse timeout');
          }
          if (r.url.path == '/api/summaries') return jsonRes({'items': []});
          return weather(r);
        });
        await c.select(Place('point', '', region, '', 12.3456789, 98.7654321));
        await flush();
        expect(c.place.name, region.isEmpty ? '12.3457, 98.7654' : region);
        expect(c.place.lat, 12.3456789);
        expect(c.failed, isFalse);
        expect(c.forecast, isNotNull);
        c.dispose();
      }
      final c = await controller(
        (r) async => r.url.path == '/api/reverse'
            ? jsonRes({
                'place': {
                  'name': 'County',
                  'level': 'region',
                  'source': 'photon-osm',
                },
              })
            : r.url.path == '/api/summaries'
            ? jsonRes({'items': []})
            : weather(r),
      );
      await c.select(const Place('point', '', '', '', 10, 20));
      await flush();
      expect(c.place.name, 'County');
      c.dispose();
    },
  );
  test(
    'late reverse cannot overwrite manually selected city or its forecast',
    () async {
      final pending = Completer<http.Response>();
      final c = await controller(
        (r) async => r.url.path == '/api/reverse'
            ? pending.future
            : r.url.path == '/api/summaries'
            ? jsonRes({'items': []})
            : weather(r),
      );
      await c.select(const Place('point', '', '', '', 25.1, 121.5));
      await c.select(tokyo);
      pending.complete(jsonRes({'place': label}));
      await flush();
      expect(c.place.id, tokyo.id);
      expect(c.forecast!.timezone, 'Asia/Tokyo');
      c.dispose();
    },
  );
  test(
    'late language and origin labels cannot overwrite current label',
    () async {
      final old = Completer<http.Response>(),
          korean = Completer<http.Response>();
      var calls = 0;
      final c = await controller((r) async {
        if (r.url.path == '/api/reverse') {
          if (r.url.host == 'new.invalid') {
            return jsonRes({
              'place': {
                'name': 'New region',
                'level': 'region',
                'source': 'photon-osm',
              },
            });
          }
          return calls++ == 0 ? old.future : korean.future;
        }
        if (r.url.path == '/api/summaries') return jsonRes({'items': []});
        return weather(r);
      });
      c.changeLocale('en');
      await c.select(const Place('point', '', '', '', 25.1, 121.5));
      c.changeLocale('ko');
      old.complete(
        jsonRes({
          'place': {'name': 'Old English city'},
        }),
      );
      await flush();
      expect(c.place.name, isNot('Old English city'));
      await c.changeOrigin('https://new.invalid');
      await flush();
      korean.complete(jsonRes({'place': label}));
      await flush();
      expect(c.place.name, 'New region');
      c.dispose();
    },
  );
}
