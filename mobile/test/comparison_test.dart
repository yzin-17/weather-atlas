import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:http/http.dart' as http;
import 'package:timezone/data/latest.dart' as zones;
import 'package:weather_atlas/data.dart';
import 'package:weather_atlas/locale.dart';
import 'package:weather_atlas/questions.dart';
import 'widget_test.dart' show snapshot, jsonRes;
import 'chat_fixture.dart';

void main() {
  setUpAll(zones.initializeTimeZones);
  test(
    'shared city links preserve locale, catalog identity and arbitrary coordinates',
    () {
      for (final lang in ['zh-Hans', 'zh-Hant', 'en', 'ko']) {
        expectSync(
          cityLink('https://weather.example', seoul, lang).toString(),
          'https://weather.example/$lang/weather/seoul-1835848',
        );
        final link = cityLink(
          'https://weather.example',
          const Place('point', '地点', '', '', 1.2, 3.4),
          lang,
        );
        expectSync(link.path, '/$lang/explore');
        expectSync(link.queryParameters['lat'], '1.2');
        expectSync(link.queryParameters['name'], '地点');
      }
    },
  );
  testWidgets('409 refresh reuses origin snapshot and updates both versions', (
    t,
  ) async {
    var asks = 0, weatherCalls = 0;
    String? refreshed;
    final cities = [
      seoul.toJson(),
      {'id': 'taipei', 'name': 'Taipei', 'lat': 25.0478, 'lon': 121.5319},
    ];
    final api = WeatherApi(
      'https://test.invalid',
      client: MockClient((r) async {
        if (r.url.path == '/api/weather') {
          weatherCalls++;
          return jsonRes(snapshot(v: 'new'));
        }
        asks++;
        if (asks == 2) {
          return http.Response(
            '{"error":"stale","code":"STALE_FORECAST"}',
            409,
          );
        }
        if (asks == 3) {
          final body = jsonDecode(r.body) as Json;
          expectSync(body['version'], 'new');
          expectSync(
            ((body['context'] as Json)['cities'] as List).every(
              (c) => c['version'] == 'new',
            ),
            true,
          );
        }
        return sseRes({
          'version': asks == 3 ? 'new' : 'test',
          'source': 'rules',
          'answer': 'answer $asks',
          'evidence': [],
          'context': comparisonContext(cities),
        });
      }),
    );
    final w = Words('en');
    await t.pumpWidget(
      MaterialApp(
        home: QuestionPage(
          api: api,
          city: seoul,
          forecast: Forecast.fromJson(snapshot()),
          w: w,
          onRefreshed: (f) async {
            refreshed = f.version;
          },
        ),
      ),
    );
    for (final key in ['compare', 'afternoon']) {
      if (key == 'compare') {
        final chip = find.widgetWithText(ActionChip, w(key));
        await t.ensureVisible(chip);
        await t.tap(chip);
      } else {
        await t.enterText(find.byKey(const ValueKey('chat-input')), w(key));
        await t.tap(find.byKey(const ValueKey('chat-send')));
      }
      await settleChat(t);
    }
    final retry = find.text(w('refreshAsk'));
    await t.ensureVisible(retry);
    await t.tap(retry);
    await settleChat(t);
    expectSync(asks, 3);
    expectSync(weatherCalls, 2);
    expectSync(refreshed, 'new');
  });
  testWidgets(
    'current city evidence beyond displayed 24 hours opens forecast detail',
    (t) async {
      final reading = {'time': 1735736400 + 40 * 3600, 'temp': 9, 'rain': 20};
      final api = WeatherApi(
        'https://test.invalid',
        client: MockClient(
          (_) async => sseRes({
            'version': 'test',
            'source': 'rules',
            'answer': 'tomorrow',
            'evidence': [reading],
          }),
        ),
      );
      final w = Words('en');
      await t.pumpWidget(
        MaterialApp(
          home: QuestionPage(
            api: api,
            city: seoul,
            forecast: Forecast.fromJson(snapshot()),
            w: w,
          ),
        ),
      );
      final chip = find.widgetWithText(ActionChip, w('compare'));
      await t.ensureVisible(chip);
      await t.tap(chip);
      await settleChat(t);
      final evidence = find.byKey(
        ValueKey('hour-evidence-Asia/Seoul-${reading['time']}'),
      );
      await t.ensureVisible(evidence);
      await settleChat(t);
      await t.tap(evidence);
      await settleChat(t);
      expectSync(find.byType(ComparisonEvidencePage), findsOneWidget);
      expectSync(find.textContaining('Asia/Seoul'), findsOneWidget);
    },
  );
  for (final lang in ['zh-Hans', 'zh-Hant', 'en', 'ko']) {
    testWidgets(
      '$lang comparison preserves context and opens Taipei evidence',
      (t) async {
        final requests = <Json>[];
        final taipei = {
          'id': 'taipei',
          'name': 'Taipei',
          'lat': 25.0478,
          'lon': 121.5319,
        };
        final reading = {
          'time': 1735736400,
          'temp': 20,
          'rain': 60,
          'city': taipei,
          'timezone': 'Asia/Taipei',
          'version': 'taipei-v',
        };
        final api = WeatherApi(
          'https://test.invalid',
          client: MockClient((request) async {
            final body = jsonDecode(request.body) as Json;
            requests.add(body);
            if (requests.length > 1) {
              expectSync(
                (body['context'] as Json)['marker'],
                requests.length - 1,
              );
            }
            return sseRes({
              'version': 'test',
              'source': 'rules',
              'answer': 'Seoul · Taipei ${requests.length}',
              'context': comparisonContext([
                seoul.toJson(),
                taipei,
              ], marker: requests.length),
              'evidence': [reading],
              'comparisons': [
                {
                  'city': taipei,
                  'timezone': 'Asia/Taipei',
                  'date': '2025-01-01',
                  'forecast': {
                    ...snapshot(v: 'taipei-v'),
                    'timezone': 'Asia/Taipei',
                  },
                  'evidence': [reading],
                },
              ],
            });
          }),
        );
        final w = Words(lang);
        await t.pumpWidget(
          MaterialApp(
            home: QuestionPage(
              api: api,
              city: seoul,
              forecast: Forecast.fromJson(snapshot()),
              w: w,
            ),
          ),
        );
        for (final key in ['compare', 'afternoon', 'colder']) {
          if (key == 'compare') {
            final button = find.widgetWithText(ActionChip, w(key));
            await t.ensureVisible(button);
            await t.tap(button);
          } else {
            await t.enterText(find.byKey(const ValueKey('chat-input')), w(key));
            await t.tap(find.byKey(const ValueKey('chat-send')));
          }
          await settleChat(t);
        }
        expectSync(requests.length, 3);
        expectSync(
          requests.every((r) => r['version'] == 'test' && r['locale'] == lang),
          true,
        );
        final evidence = find.byType(ListTile).first;
        await t.ensureVisible(evidence);
        await t.tap(evidence);
        await settleChat(t);
        expectSync(find.byType(ComparisonEvidencePage), findsOneWidget);
        expectSync(find.textContaining('Asia/Taipei'), findsOneWidget);
        expectSync(find.text('Taipei · ${w('evidence')}'), findsOneWidget);
      },
    );
  }
}
