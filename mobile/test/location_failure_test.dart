import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:timezone/data/latest.dart' as zones;
import 'package:weather_atlas/data.dart';
import 'package:weather_atlas/locale.dart';
import 'package:weather_atlas/main.dart';
import 'widget_test.dart' show controller, snapshot, jsonRes;

class LocationScenario extends GeolocatorPlatform {
  bool enabled = true;
  LocationPermission permission = LocationPermission.whileInUse;
  Object? error;
  @override
  Future<bool> isLocationServiceEnabled() async => enabled;
  @override
  Future<LocationPermission> checkPermission() async => permission;
  @override
  Future<LocationPermission> requestPermission() async => permission;
  @override
  Future<Position> getCurrentPosition({
    LocationSettings? locationSettings,
  }) async {
    if (error != null) throw error!;
    return Position(
      latitude: 30.5728,
      longitude: 104.0668,
      timestamp: DateTime.now(),
      accuracy: 10,
      altitude: 0,
      altitudeAccuracy: 0,
      heading: 0,
      headingAccuracy: 0,
      speed: 0,
      speedAccuracy: 0,
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(zones.initializeTimeZones);
  late LocationScenario geo;
  late GeolocatorPlatform previous;
  setUp(() {
    previous = GeolocatorPlatform.instance;
    geo = LocationScenario();
    GeolocatorPlatform.instance = geo;
  });
  tearDown(() => GeolocatorPlatform.instance = previous);

  final scenarios = <String, void Function(LocationScenario)>{
    'gpsOff': (g) => g.enabled = false,
    'denied': (g) => g.permission = LocationPermission.denied,
    'deniedForever': (g) => g.permission = LocationPermission.deniedForever,
    'gpsTimeout': (g) => g.error = TimeoutException('no fix'),
    'gpsFail': (g) => g.error = StateError('no location'),
  };
  for (final scenario in scenarios.entries) {
    test(
      'location failure ${scenario.key} preserves the selected city',
      () async {
        final c = await controller((r) async => jsonRes(snapshot()));
        scenario.value(geo);
        await c.locate();
        expect(c.locationMessage, scenario.key);
        expect(c.locating, false);
        expect(c.place.id, defaultCity.id);
        c.dispose();
      },
    );
  }
  test(
    'native permission and service errors are classified after the checks',
    () async {
      final c = await controller((r) async => jsonRes(snapshot()));
      geo.error = const LocationServiceDisabledException();
      await c.locate();
      expect(c.locationMessage, 'gpsOff');
      geo.error = const PermissionDeniedException('denied during request');
      await c.locate();
      expect(c.locationMessage, 'denied');
      c.dispose();
    },
  );
  test(
    'a successful location is independent of a weather service failure and retry',
    () async {
      var fail = true;
      final weatherCoords = <String?>[];
      final c = await controller((r) async {
        if (r.url.path == '/api/reverse') {
          return jsonRes({
            'place': {'name': '成都市'},
          });
        }
        if (r.url.path == '/api/summaries') return jsonRes({'items': []});
        weatherCoords.add(r.url.query);
        return fail ? http.Response('', 503) : jsonRes(snapshot());
      });
      await c.locate();
      expect(c.place.id, 'gps');
      expect(c.place.lat, 30.5728);
      expect(c.place.lon, 104.0668);
      expect(c.locationMessage, isNull);
      expect(c.weatherMessage, 'weatherServer');
      expect(c.failed, true);
      fail = false;
      await c.load(force: true);
      expect(c.failed, false);
      expect(c.weatherMessage, isNull);
      expect(c.locationMessage, isNull);
      expect(weatherCoords, everyElement('lat=30.5728&lon=104.0668&fresh=1'));
      c.dispose();
    },
  );
  for (final error in <String, Object>{
    'weatherTimeout': TimeoutException('timeout'),
    'weatherConnection': http.ClientException('connection refused'),
    'weatherInvalid': const FormatException('invalid data'),
  }.entries) {
    test(
      'refresh failure ${error.key} retains cache then clears on recovery',
      () async {
        var fail = false;
        final c = await controller((r) async {
          if (fail) throw error.value;
          return jsonRes(snapshot());
        });
        await c.load();
        fail = true;
        await c.load(force: true);
        expect(c.forecast?.version, 'test');
        expect(c.weatherMessage, error.key);
        fail = false;
        await c.load(force: true);
        expect(c.failed, false);
        expect(c.weatherMessage, isNull);
        c.dispose();
      },
    );
  }
  for (final lang in languageNames.keys) {
    testWidgets('$lang cached weather failure shows reason and retry', (
      t,
    ) async {
      t.view.physicalSize = const Size(390, 844);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.resetPhysicalSize);
      addTearDown(t.view.resetDevicePixelRatio);
      var fail = false;
      final c = await controller((r) async {
        if (fail) throw http.ClientException('connection refused');
        return jsonRes({...snapshot(), 'timezone': 'Asia/Shanghai'});
      });
      await c.load();
      c.changeLocale(lang);
      fail = true;
      await c.load(force: true);
      await t.pumpWidget(Atlas(controller: c));
      await t.pumpAndSettle();
      expect(
        find.textContaining(Words(lang)('weatherConnection')),
        findsOneWidget,
      );
      fail = false;
      await t.tap(find.text(Words(lang)('retry')).first);
      await t.pumpAndSettle();
      expect(
        find.textContaining(Words(lang)('weatherConnection')),
        findsNothing,
      );
      expect(c.failed, false);
      await t.pumpWidget(const SizedBox());
      c.dispose();
    });
  }
}
