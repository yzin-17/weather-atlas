import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:integration_test/integration_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:timezone/data/latest.dart' as zones;
import 'package:weather_atlas/data.dart';
import 'package:weather_atlas/locale.dart';
import 'package:weather_atlas/location_picker.dart';

class CountedClient extends http.BaseClient {
  final inner = http.Client();
  final calls = <Json>[];
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final row = <String, dynamic>{
      'url': request.url.toString(),
      'path': request.url.path,
    };
    calls.add(row);
    try {
      final response = await inner.send(request);
      final bytes = await response.stream.toBytes();
      row.addAll({
        'status': response.statusCode,
        'bytes': bytes.length,
        'source': response.headers['x-map-source'],
        'cache': response.headers['x-map-cache'],
      });
      return http.StreamedResponse(
        Stream.value(bytes),
        response.statusCode,
        headers: response.headers,
        request: request,
      );
    } catch (error) {
      row['error'] = error.toString();
      rethrow;
    }
  }

  @override
  void close() => inner.close();
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('真实底图、单点无天气、拖动零预报、确认坐标', (t) async {
    zones.initializeTimeZones();
    const base = String.fromEnvironment('WEATHER_API_BASE');
    const receiver = String.fromEnvironment('QA_RECEIVER');
    const device = String.fromEnvironment('QA_DEVICE');
    const taipei = Place('1668341', 'Taipei', '', 'Taiwan', 25.0478, 121.5319);
    final transport = CountedClient(), tiles = CountedClient();
    final api = WeatherApi(base, client: transport);
    await api.weather(seoul);
    const huizhou = Place('point', '', '', '', 23.11, 114.41);
    final label = await api.reverse(huizhou, 'zh-Hans');
    final named = huizhou.withReverseLabel(label, 'zh-Hans');
    expect(named.name, '惠州市');
    expect(named.lat, huizhou.lat);
    expect(named.lon, huizhou.lon);
    Place? confirmed;
    await t.pumpWidget(
      MaterialApp(
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff193c3c)),
          scaffoldBackgroundColor: const Color(0xfff6f5ef),
        ),
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: FilledButton(
                onPressed: () async {
                  confirmed = await Navigator.push<Place>(
                    context,
                    MaterialPageRoute(
                      builder: (_) => LocationPicker(
                        api: api,
                        w: const Words('en'),
                        initial: seoul,
                        tileClient: tiles,
                      ),
                    ),
                  );
                },
                child: const Text('Open map'),
              ),
            ),
          ),
        ),
      ),
    );
    Future<void> waitFor(bool Function() ready) async {
      for (var i = 0; i < 300 && !ready(); i++) {
        await t.pump(const Duration(milliseconds: 100));
      }
      if (!ready()) {
        // ignore: avoid_print
        print(
          'WEATHER_MAP_WAIT_DIAGNOSTIC:${jsonEncode({'api': transport.calls, 'tiles': tiles.calls, 'images': t.widgetList<RawImage>(find.byType(RawImage)).map((w) => w.image?.width).toList()})}',
        );
      }
      expect(ready(), isTrue);
      await t.pump(const Duration(milliseconds: 200));
    }

    Future<void> checkpoint(String phase) async {
      if (phase != 'completed') {
        await waitFor(
          () =>
              tiles.calls.every(
                (r) => r.containsKey('status') || r.containsKey('error'),
              ) &&
              t
                  .widgetList<RawImage>(find.byType(RawImage))
                  .any((w) => w.image?.width == 256),
        );
      }
      final result = {
        'phase': phase,
        'device': device,
        'api': transport.calls,
        'tiles': tiles.calls,
      };
      final r = await http.post(
        Uri.parse('$receiver/checkpoint'),
        headers: {'content-type': 'application/json'},
        body: jsonEncode(result),
      );
      expect(r.statusCode, 200, reason: r.body);
    }

    try {
      await t.tap(find.text('Open map'));
      await t.pumpAndSettle();
      await t.tap(find.byTooltip('Map search'));
      await t.pump();
      await waitFor(
        () => t
            .widgetList<RawImage>(find.byType(RawImage))
            .any((w) => w.image?.width == 256),
      );
      expect(find.byTooltip('Language'), findsNothing);
      expect(
        t.widget<TileLayer>(find.byType(TileLayer)).urlTemplate,
        '$base/api/map-tiles/{z}/{x}/{y}',
      );
      expect(find.textContaining('°'), findsNothing);
      expect(t.widget<MarkerLayer>(find.byType(MarkerLayer)).markers.length, 1);
      await checkpoint('map-open');
      final before = transport.calls.length;
      await t.drag(find.byType(FlutterMap), const Offset(60, 50));
      await t.pumpAndSettle();
      expect(transport.calls.length, before);
      final map = t.widget<FlutterMap>(find.byType(FlutterMap)).mapController!;
      map.move(LatLng(taipei.lat, taipei.lon), 7);
      await t.pumpAndSettle();
      expect(transport.calls.length, before);
      final rect = t.getRect(find.byType(FlutterMap));
      await t.tapAt(
        Offset(rect.left + rect.width * .22, rect.top + rect.height * .25),
      );
      await waitFor(
        () =>
            t
                .widget<MarkerLayer>(find.byType(MarkerLayer))
                .markers
                .single
                .point
                .latitude !=
            seoul.lat,
      );
      expect(transport.calls.length, before);
      expect(find.textContaining('°'), findsNothing);
      final layer = t.widget<MarkerLayer>(find.byType(MarkerLayer));
      final point = layer.markers.last.point;
      await t.tap(find.text('View weather here'));
      await t.pumpAndSettle();
      expect(confirmed, isNotNull);
      expect(confirmed!.id, 'point');
      expect(confirmed!.lat, closeTo(point.latitude, 0.0001));
      expect(confirmed!.lon, closeTo(point.longitude, 0.0001));
      await api.weather(confirmed!);
      expect(
        transport.calls.where((r) => r['path'] == '/api/weather').length,
        2,
      );
      expect(
        tiles.calls
            .where((r) => r['status'] == 200)
            .every((r) => r['source'] == 'openstreetmap'),
        isTrue,
      );
      expect(tiles.calls.any((r) => r['status'] == 200), isTrue);
      await checkpoint('completed');
      // ignore: avoid_print
      print(
        'WEATHER_MAP_NATIVE_RESULT:${jsonEncode({'device': device, 'confirmed': confirmed!.toJson(), 'api': transport.calls, 'tiles': tiles.calls, 'dragForecastDelta': 0, 'testTiles': 0})}',
      );
    } finally {
      await t.pumpWidget(const SizedBox());
      api.close();
      tiles.close();
    }
  });
}
