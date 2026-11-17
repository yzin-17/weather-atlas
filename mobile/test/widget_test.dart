import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/data/latest.dart' as zones;
import 'package:weather_atlas/controller.dart';
import 'package:weather_atlas/data.dart';
import 'package:weather_atlas/locale.dart';
import 'package:weather_atlas/main.dart';
import 'package:weather_atlas/location_picker.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:weather_atlas/questions.dart';
import 'chat_fixture.dart';

const tokyo = Place('1850147', 'Tokyo', '', 'JP', 35.6895, 139.6917);
Json snapshot({String v = 'test', DateTime? fetched}) => {
  'timezone': 'Asia/Seoul',
  'version': v,
  'source': 'demo',
  'fetchedAt': (fetched ?? DateTime.now()).toUtc().toIso8601String(),
  'current': {'time': 1735736400, 'temp': 12, 'code': 2},
  'hours': [
    for (var n = 0; n < 24; n++)
      {
        'time': 1735736400 + n * 3600,
        'temp': 12 + n % 5,
        'code': 2,
        'rain': n.isEven ? null : 30,
      },
  ],
  'days': [
    for (var n = 1; n <= 7; n++)
      {'date': '2025-01-0$n', 'min': 6, 'max': 17, 'code': 2},
  ],
};
http.Response jsonRes(Object v) => http.Response.bytes(
  utf8.encode(jsonEncode(v)),
  200,
  headers: {'content-type': 'application/json; charset=utf-8'},
);
Future<WeatherController> controller(
  Future<http.Response> Function(http.Request) fn,
) async {
  SharedPreferences.setMockInitialValues({});
  return WeatherController(
    WeatherApi('https://test.invalid', client: MockClient(fn)),
    await SharedPreferences.getInstance(),
  );
}

class SlowGeo extends GeolocatorPlatform {
  final received = Completer<void>();
  final pending = Completer<Position>();
  @override
  Future<bool> isLocationServiceEnabled() async => true;
  @override
  Future<LocationPermission> checkPermission() async =>
      LocationPermission.whileInUse;
  @override
  Future<Position> getCurrentPosition({LocationSettings? locationSettings}) {
    received.complete();
    return pending.future;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(zones.initializeTimeZones);
  test(
    'fresh installation uses Shenzhen and the six recommendations in order',
    () async {
      final c = await controller(
        (r) async => r.url.path == '/api/summaries'
            ? jsonRes({'items': []})
            : jsonRes({...snapshot(), 'timezone': 'Asia/Shanghai'}),
      );
      expect(c.place.id, '1795565');
      await c.restore(autoLocate: false);
      expect(c.place.id, '1795565');
      expect(c.saved.map((city) => city.id).toList(), [
        '1795565',
        '1835848',
        '1819729',
        '1850147',
        '5128581',
        '2643743',
      ]);
      c.dispose();
    },
  );
  test('destination day can differ from UTC and overlap at DST fall-back', () {
    final f = Forecast.fromJson(snapshot());
    final utc = DateTime.utc(2025, 1, 1, 17).millisecondsSinceEpoch ~/ 1000;
    expect(ymd(f.local(utc)), '2025-01-02');
    expect(hh(f.local(utc)), '02:00');
    final ny = Forecast.fromJson({
      ...snapshot(),
      'timezone': 'America/New_York',
    });
    final stamp = DateTime.utc(2025, 11, 2, 5).millisecondsSinceEpoch ~/ 1000;
    expect(hh(ny.local(stamp)), hh(ny.local(stamp + 3600)));
    expect(
      ny.local(stamp).timeZoneOffset,
      isNot(ny.local(stamp + 3600).timeZoneOffset),
    );
  });
  test('four languages resolve scripts and regional variants', () {
    expect(resolveLanguage(const Locale('zh', 'TW')), 'zh-Hant');
    expect(resolveLanguage(const Locale('ko')), 'ko');
    expect(
      resolveLanguage(
        const Locale.fromSubtags(
          languageCode: 'zh',
          scriptCode: 'Hans',
          countryCode: 'TW',
        ),
      ),
      'zh-Hans',
    );
    for (final lang in languageNames.keys) {
      for (final key in copy.keys) {
        expect(Words(lang)(key), isNotEmpty);
      }
    }
  });
  test('late city response cannot change the newest city', () async {
    final delayed = Completer<http.Response>();
    final c = await controller(
      (r) async => r.url.queryParameters['lat'] == '${seoul.lat}'
          ? delayed.future
          : jsonRes(snapshot(v: 'tokyo')),
    );
    final old = c.select(seoul);
    await c.select(tokyo);
    delayed.complete(jsonRes(snapshot(v: 'seoul')));
    await old;
    expect(c.place.id, tokyo.id);
    expect(c.forecast?.version, 'tokyo');
    c.dispose();
  });
  for (final language in languageNames.keys) {
    testWidgets(
      '$language selected location shows loading until weather resolves',
      (t) async {
        final pending = Completer<http.Response>();
        final c = await controller((r) async {
          if (r.url.path == '/api/reverse') return jsonRes({'place': null});
          if (r.url.path == '/api/summaries') return jsonRes({'items': []});
          return r.url.queryParameters['lat'] == '${seoul.lat}'
              ? jsonRes(snapshot())
              : pending.future;
        });
        await c.select(seoul);
        c.changeLocale(language);
        await t.pumpWidget(Atlas(controller: c));
        await t.pumpAndSettle();
        final task = c.select(const Place('point', '', '', '', 23.11, 114.41));
        await t.pump();
        await t.pump(const Duration(milliseconds: 300));
        expect(find.text(Words(language)('loadingWeather')), findsOneWidget);
        expect(find.byType(LinearProgressIndicator), findsOneWidget);
        expect(find.text('12°'), findsNothing);
        expect(find.text(Words(language)('hourly')), findsNothing);
        pending.complete(jsonRes(snapshot(v: 'selected')));
        await task;
        await t.pumpAndSettle();
        expect(find.text(Words(language)('loadingWeather')), findsNothing);
        expect(find.text(Words(language)('hourly')), findsOneWidget);
        expect(c.forecast?.version, 'selected');
        await t.pumpWidget(const SizedBox());
        c.dispose();
      },
    );
  }
  test(
    'a late automatic location cannot replace a manually selected city',
    () async {
      final old = GeolocatorPlatform.instance;
      final geo = SlowGeo();
      GeolocatorPlatform.instance = geo;
      addTearDown(() => GeolocatorPlatform.instance = old);
      final c = await controller((r) async => jsonRes(snapshot()));
      final gps = c.locate(ask: false);
      await geo.received.future;
      await c.select(tokyo);
      geo.pending.complete(
        Position(
          latitude: 1,
          longitude: 2,
          timestamp: DateTime.now(),
          accuracy: 2,
          altitude: 0,
          altitudeAccuracy: 0,
          heading: 0,
          headingAccuracy: 0,
          speed: 0,
          speedAccuracy: 0,
        ),
      );
      await gps;
      expect(c.place.id, tokyo.id);
      expect(c.locating, false);
      c.dispose();
    },
  );
  test(
    'language change and fresh cached selection do not fetch twice; failed refresh retains data',
    () async {
      var calls = 0;
      final c = await controller((r) async {
        if (r.url.path == '/api/summaries') return jsonRes({'items': []});
        return ++calls == 1 ? jsonRes(snapshot()) : http.Response('', 502);
      });
      await c.select(seoul);
      c.changeLocale('ko');
      await c.select(seoul);
      expect(calls, 1);
      await c.load(force: true);
      expect(c.failed, true);
      expect(c.forecast!.version, 'test');
      expect(calls, 2);
      c.dispose();
    },
  );
  test(
    'switching service origin cannot read an unrelated cached snapshot',
    () async {
      final c = await controller(
        (r) async => r.url.host == 'test.invalid'
            ? jsonRes(snapshot())
            : http.Response('', 503),
      );
      await c.load();
      await c.changeOrigin('https://new.invalid');
      expect(c.forecast, isNull);
      expect(c.failed, true);
      c.dispose();
    },
  );
  testWidgets(
    'dashboard renders, search works without GPS, language keeps snapshot',
    (t) async {
      final calls = <String>[];
      final c = await controller((r) async {
        calls.add(r.url.path);
        return r.url.path == '/api/places'
            ? jsonRes({
                'places': [tokyo.toJson()],
              })
            : jsonRes(snapshot());
      });
      await c.select(seoul);
      await t.pumpWidget(Atlas(controller: c));
      await t.pumpAndSettle();
      expect(find.text('Hourly forecast'), findsOneWidget);
      await t.tap(find.byTooltip('Search cities'));
      await t.pumpAndSettle();
      await t.enterText(find.byType(TextField), '東京');
      await t.pump(const Duration(milliseconds: 300));
      await t.pumpAndSettle();
      await t.tap(find.text('Tokyo'));
      await t.pumpAndSettle();
      expect(c.place.id, tokyo.id);
      final weatherCalls = calls.where((s) => s == '/api/weather').length;
      await t.tap(find.byTooltip('Language'));
      await t.pumpAndSettle();
      await t.tap(find.text('한국어'));
      await t.pumpAndSettle();
      expect(find.text('도쿄'), findsOneWidget);
      expect(calls.where((s) => s == '/api/weather').length, weatherCalls);
      await t.pumpWidget(const SizedBox());
      c.dispose();
    },
  );
  testWidgets(
    'answer uses versioned evidence and labels deterministic fallback',
    (t) async {
      final f = Forecast.fromJson(snapshot());
      final api = WeatherApi(
        'https://test.invalid',
        client: MockClient((r) async {
          expectSync(jsonDecode(r.body)['version'], f.version);
          return sseRes({
            'answer': 'Rain likely.',
            'version': f.version,
            'source': 'rules',
            'evidence': [
              {'time': f.hours.first.time, 'temp': 14, 'rain': null},
            ],
            'dailyEvidence': [],
          });
        }),
      );
      await t.pumpWidget(
        MaterialApp(
          home: QuestionPage(
            api: api,
            city: seoul,
            forecast: f,
            w: const Words('en'),
          ),
        ),
      );
      await t.tap(find.text('Do I need an umbrella in the next 6 hours?'));
      await settleChat(t);
      expect(find.text('Rain likely.'), findsOneWidget);
      expect(find.text('Forecast guide'), findsOneWidget);
      expect(find.textContaining('Precipitation chance —'), findsOneWidget);
      api.close();
    },
  );

  testWidgets(
    'map keeps one point and never loads weather before confirmation',
    (t) async {
      var calls = 0;
      final c = await controller((r) async {
        calls++;
        return jsonRes({});
      });
      Place? confirmed;
      await t.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () async {
                  confirmed = await Navigator.push<Place>(
                    context,
                    MaterialPageRoute(
                      builder: (_) => LocationPicker(
                        api: c.api,
                        w: const Words('en'),
                        initial: seoul,
                      ),
                    ),
                  );
                },
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      );
      await t.tap(find.text('Open'));
      await t.pumpAndSettle();
      await t.tap(find.byTooltip('Map search'));
      await t.pumpAndSettle();
      final map = t.widget<FlutterMap>(find.byType(FlutterMap)).mapController!;
      expect(t.widget<MarkerLayer>(find.byType(MarkerLayer)).markers.length, 1);
      expect(find.textContaining('°'), findsNothing);
      expect(find.byTooltip('Language'), findsNothing);
      expect(
        t.widget<TileLayer>(find.byType(TileLayer)).urlTemplate,
        '${c.api.origin}/api/map-tiles/{z}/{x}/{y}',
      );
      await t.drag(find.byType(FlutterMap), const Offset(85, 50));
      await t.pumpAndSettle();
      expect(map.camera.center.latitude, isNot(seoul.lat));
      final bounds = t.getRect(find.byType(FlutterMap));
      await t.tapAt(bounds.center + const Offset(30, 20));
      await t.pumpAndSettle();
      final point = t
          .widget<MarkerLayer>(find.byType(MarkerLayer))
          .markers
          .single
          .point;
      expect(calls, 0);
      await t.tap(find.text('View weather here'));
      await t.pumpAndSettle();
      expect(confirmed?.lat, point.latitude);
      expect(confirmed?.lon, point.longitude);
      expect(calls, 0);
      await t.pumpWidget(const SizedBox());
      c.dispose();
    },
  );
}
