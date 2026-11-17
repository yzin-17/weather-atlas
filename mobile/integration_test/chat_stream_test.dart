import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:ai_ui_stream/ai_ui_stream.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:timezone/data/latest.dart' as zones;
import 'package:weather_atlas/data.dart';
import 'package:weather_atlas/locale.dart';
import 'package:weather_atlas/questions.dart';
import 'package:weather_atlas/weather_chat.dart';
import '../test/chat_fixture.dart';
import '../test/widget_test.dart' show snapshot;

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => binding.testTextInput.register());
  tearDown(() => binding.testTextInput.unregister());
  zones.initializeTimeZones();
  const live = bool.fromEnvironment('LIVE_CHAT');
  const origin = String.fromEnvironment(
    'WEATHER_API_BASE',
    defaultValue: 'http://10.0.2.2:3300',
  );
  final gz = {
    'id': 'guangzhou',
    'name': '广州',
    'country': 'CN',
    'lat': 23.13,
    'lon': 113.26,
    'version': 'test',
    'lookup': '广州',
  };
  final taipei = {
    'id': 'taipei',
    'name': '台北',
    'country': 'TW',
    'lat': 25.0478,
    'lon': 121.5319,
  };

  Future<void> until(WidgetTester t, bool Function() done) async {
    for (var i = 0; i < 240; i++) {
      await t.pump(const Duration(milliseconds: 100));
      if (done()) {
        await t.pump();
        return;
      }
    }
    throw StateError('等待对话状态超时');
  }

  for (final language in live ? ['zh-Hans'] : languageNames.keys) {
    testWidgets(
      '$language native ${live ? 'real backend' : 'HTTP SSE fixture'} conversation',
      (t) async {
        var requests = 0, disconnected = 0;
        final slowRelease = Completer<void>();
        final bodies = <Json>[];
        HttpServer? server;
        if (!live) {
          server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
          server.listen((request) async {
            requests++;
            final data =
                jsonDecode(await utf8.decoder.bind(request).join()) as Json;
            bodies.add(data);
            request.response.headers.set(
              'content-type',
              'text/event-stream; charset=utf-8',
            );
            request.response.headers.set('x-vercel-ai-ui-message-stream', 'v1');
            request.response.bufferOutput = false;
            request.response.write(
              frame({'type': 'start', 'messageId': 'native-$requests'}),
            );
            request.response.write(
              frame({
                'type': 'data-phase',
                'data': {'phase': 'model'},
                'transient': true,
              }),
            );
            await request.response.flush();
            if (data['question'] == 'slow') {
              request.response.done.catchError((Object _) {
                disconnected++;
              });
              await slowRelease.future;
            }
            final compare =
                (data['question'] as String).contains('compare') ||
                data['context'] != null;
            final context = comparisonContext([seoul.toJson(), taipei]);
            final reading = {
              'time': 1735736400,
              'temp': 20,
              'rain': null,
              'code': 2,
              'city': compare ? taipei : gz,
              'timezone': compare ? 'Asia/Taipei' : 'Asia/Shanghai',
              'version': 'test',
            };
            final f = {
              ...snapshot(),
              'timezone': compare ? 'Asia/Taipei' : 'Asia/Shanghai',
            };
            final answer = '广州 / 台北 天气 🧥 ${'适宜出行 '.padRight(120, '☀️')}';
            final result = <String, dynamic>{
              'version': 'test',
              'source': 'rules',
              'answer': answer,
              'evidence': [reading],
              if (compare) ...{
                'context': context,
                'comparisons': [
                  {
                    'city': taipei,
                    'forecast': f,
                    'date': '2025-01-01',
                    'evidence': [reading],
                  },
                ],
              } else ...{
                'singleContext': {
                  'origin': seoul.key,
                  'createdAt': 1735736400000,
                  'dateAnchor': 1735736400000,
                  'city': gz,
                  'plan': {
                    'intent': 'daily',
                    'window': 'days',
                    'startDay': 0,
                    'dayCount': 1,
                  },
                },
                'singleForecast': {'city': gz, 'forecast': f},
              },
            };
            try {
              request.response.write(sseAnswer(result));
              await request.response.close();
            } catch (_) {
              disconnected++;
            }
          });
        }
        final api = WeatherApi(
          live ? origin : 'http://127.0.0.1:${server!.port}',
        );
        final forecast = live
            ? await api.weather(seoul)
            : Forecast.fromJson(snapshot());
        final chat = WeatherChat(
          api: api,
          city: seoul,
          forecast: forecast,
          language: language,
        );
        await t.pumpWidget(
          MaterialApp(
            home: QuestionPage(
              api: api,
              city: seoul,
              forecast: forecast,
              w: Words(language),
              session: chat,
            ),
          ),
        );
        final field = find.byKey(const ValueKey('chat-input')),
            send = find.byKey(const ValueKey('chat-send'));
        final questions = live
            ? [
                '今天广州天气怎样',
                '出门穿什么衣服',
                '明天下午呢',
                '首尔和台北明天早上 7–9 点，哪里更容易下雨？',
                '那下午呢？',
                '哪个更冷？',
              ]
            : ['今天广州天气怎样', '出门穿什么衣服', 'compare', '那下午呢？', '哪个更冷？'];
        for (final question in questions) {
          final before = chat.messages
              .where((m) => m.role == MessageRole.user)
              .length;
          await t.showKeyboard(field);
          await t.pumpAndSettle();
          await t.enterText(field, question);
          await t.pump();
          expect(t.widget<TextField>(field).controller!.text, question);
          await t.ensureVisible(send);
          await t.tap(send);
          await t.pump();
          expect(
            chat.messages.where((m) => m.role == MessageRole.user).length,
            before + 1,
            reason:
                'busy=${chat.busy} stopped=${chat.stopped} input=${t.widget<TextField>(field).controller!.text} messages=${chat.messages.map((m) => m.toJson()).toList()} requests=$requests bodies=$bodies',
          );
          expect(t.widget<TextField>(field).controller!.text, isEmpty);
          await until(t, () => !chat.busy);
          if (chat.error == 'changed') {
            await t.ensureVisible(find.byKey(const ValueKey('chat-retry')));
            await t.tap(find.byKey(const ValueKey('chat-retry')));
            await until(t, () => !chat.busy);
          }
          expect(chat.error, isNull, reason: '$question ${chat.chat.error}');
          expect(chat.result(chat.messages.last), isNotNull);
          if (live) expect(chat.result(chat.messages.last)!['source'], 'model');
          expect(find.byType(ActionChip), findsNothing);
          // ignore: avoid_print
          print(
            'CHAT_NATIVE ${jsonEncode({'language': language, 'question': question, 'source': chat.result(chat.messages.last)!['source'], 'model': chat.result(chat.messages.last)!['model'], 'modelMs': chat.result(chat.messages.last)!['modelMs'], 'context': chat.comparisonContext != null ? 'comparison' : 'single'})}',
          );
        }
        final tile = find.byWidgetPredicate(
          (widget) =>
              widget is ListTile &&
              widget.key.toString().contains('hour-evidence-Asia/Taipei'),
        );
        final list = t
            .widget<ListView>(find.byType(ListView).first)
            .controller!;
        list.jumpTo(list.position.maxScrollExtent);
        await t.pump();
        await t.ensureVisible(tile.last);
        await t.tap(tile.last);
        await t.pumpAndSettle();
        expect(find.byType(ComparisonEvidencePage), findsOneWidget);
        expect(find.textContaining('Asia/Taipei'), findsWidgets);
        await t.tap(find.byType(BackButton));
        await t.pumpAndSettle();
        if (!live) {
          expect(requests, 5);
          expect(bodies[1]['singleContext'], isNotNull);
          expect(bodies[3]['context'], isNotNull);
          expect(bodies.every((b) => !b.containsKey('messages')), true);
          await t.showKeyboard(field);
          await t.pumpAndSettle();
          await t.enterText(field, 'slow');
          await t.pump();
          await t.tap(send);
          await until(t, () => chat.busy && bodies.last['question'] == 'slow');
          await t.showKeyboard(field);
          await t.pump(const Duration(milliseconds: 400));
          await t.enterText(field, '草稿');
          await t.tap(send);
          await until(t, () => !chat.busy);
          slowRelease.complete();
          expect(chat.stopped, true);
          expect(t.widget<TextField>(field).controller!.text, '草稿');
          expect(requests, 6);
        }
        expect(
          chat.messages.where((m) => m.role == MessageRole.user).length,
          6,
        );
        await t.pumpWidget(const SizedBox());
        chat.dispose();
        api.close();
        if (server != null) await server.close(force: true);
        // ignore: avoid_print
        print(
          'CHAT_NATIVE_SUMMARY ${jsonEncode({'language': language, 'live': live, 'requests': requests, 'disconnected': disconnected})}',
        );
      },
    );
  }
}
