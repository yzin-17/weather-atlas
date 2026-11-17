import 'dart:async';
import 'dart:convert';
import 'package:ai_ui_stream/ai_ui_stream.dart';
import 'package:ai_ui_stream/http.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:timezone/data/latest.dart' as zones;
import 'package:weather_atlas/data.dart';
import 'package:weather_atlas/locale.dart';
import 'package:weather_atlas/questions.dart';
import 'package:weather_atlas/weather_chat.dart';
import 'chat_fixture.dart';
import 'widget_test.dart' show snapshot, jsonRes;

Json result([String answer = '广州 ☀️ 👨‍👩‍👧‍👦 é']) => {
  'answer': answer,
  'version': 'test',
  'source': 'rules',
  'evidence': [],
};
Future<void> flush(WidgetTester t) async {
  await t.pump();
  await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 5)));
  await t.pump(const Duration(milliseconds: 50));
}

class AbortClient extends http.BaseClient {
  final headers = Completer<http.StreamedResponse>();
  int aborts = 0, closes = 0;
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    (request as http.AbortableRequest).abortTrigger!.then((_) {
      aborts++;
      if (!headers.isCompleted) {
        headers.completeError(http.RequestAbortedException(request.url));
      }
    });
    return headers.future;
  }

  @override
  void close() => closes++;
}

void main() {
  setUpAll(zones.initializeTimeZones);

  testWidgets('SDK protocol completes in fake clock', (t) async {
    final chat = ChatController(
      transport: HttpChatTransport(
        endpoint: Uri.parse('https://test.invalid/api/ask'),
        client: MockClient((r) async => sseRes(result('ok'))),
      ),
    );
    final task = chat.sendText('test');
    await flush(t);
    expectSync(chat.status, ChatStatus.ready);
    await task;
    await chat.dispose();
  });

  testWidgets(
    'transient phase is observable and late chunks cannot resume stopped display',
    (t) async {
      final stream = StreamController<List<int>>();
      final api = WeatherApi(
        'https://test.invalid',
        client: MockClient.streaming(
          (r, _) async =>
              http.StreamedResponse(stream.stream, 200, headers: sseHeaders),
        ),
      );
      final c = WeatherChat(
        api: api,
        city: seoul,
        forecast: Forecast.fromJson(snapshot()),
        language: 'en',
      );
      final task = c.send('rain?');
      stream.add(
        utf8.encode(
          frame({'type': 'start', 'messageId': 'held'}) +
              frame({
                'type': 'data-phase',
                'data': {'phase': 'model'},
                'transient': true,
              }) +
              frame({'type': 'text-start', 'id': 't'}) +
              frame({'type': 'text-delta', 'id': 't', 'delta': '天气晴朗'}),
        ),
      );
      await flush(t);
      expectSync(c.phase, 'model');
      expectSync(c.messages.last.parts.whereType<DataUIPart>(), isEmpty);
      c.stop();
      final prefix = c.visible(c.messages.last);
      stream.add(
        utf8.encode(frame({'type': 'text-delta', 'id': 't', 'delta': '迟到'})),
      );
      unawaited(stream.close());
      await flush(t);
      await task;
      await t.pump(const Duration(seconds: 8));
      expectSync(c.visible(c.messages.last), prefix);
      expectSync(messageText(c.messages.last), '天气晴朗');
      c.dispose();
      api.close();
    },
  );

  test('finite SSE completes the controller', () async {
    final api = WeatherApi(
      'https://test.invalid',
      client: MockClient((r) async => sseRes(result('ok'))),
    );
    final c = WeatherChat(
      api: api,
      city: seoul,
      forecast: Forecast.fromJson(snapshot()),
      language: 'en',
    );
    c.setReducedMotion(true);
    try {
      await c.send('rain?').timeout(const Duration(seconds: 3));
      expectSync(c.error, isNull);
      expectSync(c.chat.isBusy, false);
    } finally {
      c.dispose();
      api.close();
    }
  });

  testWidgets(
    'SSE split within UTF8, local grapheme reveal, stop after finish and explicit retry',
    (t) async {
      var calls = 0;
      final api = WeatherApi(
        'https://test.invalid',
        client: MockClient.streaming((r, _) async {
          calls++;
          expectSync(r.headers['accept'], 'text/event-stream');
          final bytes = utf8.encode(sseAnswer(result()));
          return http.StreamedResponse(
            Stream.fromIterable([
              for (final byte in bytes) [byte],
            ]),
            200,
            headers: sseHeaders,
          );
        }),
      );
      final c = WeatherChat(
        api: api,
        city: seoul,
        forecast: Forecast.fromJson(snapshot()),
        language: 'zh-Hans',
      );
      final request = c.send('今天广州天气怎样');
      await flush(t);
      await request;
      expectSync(c.chat.isBusy, false);
      expectSync(
        c.revealing,
        true,
        reason:
            '${c.error} ${c.chat.error} ${c.messages.map((m) => m.toJson()).toList()}',
      );
      final m = c.messages.last;
      final text = messageText(m);
      expectSync(text.characters.toList().map((s) => s).join(), text);
      expectSync(
        text.characters.toList().take(c.visible(m).characters.length).join(),
        c.visible(m),
      );
      expectSync(c.result(m), isNull);
      c.stop();
      final partial = c.visible(m);
      await t.pump(const Duration(seconds: 8));
      expectSync(c.visible(m), partial);
      expectSync(c.busy, false);
      expectSync(c.result(m), isNull);
      final retry = c.retry();
      await flush(t);
      await retry;
      await t.pump(const Duration(seconds: 8));
      expectSync(calls, 2);
      expectSync(
        c.messages.where((m) => m.role == MessageRole.user),
        hasLength(1),
      );
      expectSync(c.result(c.messages.last)?['answer'], text);
      c.dispose();
      api.close();
    },
  );

  testWidgets(
    'stopping before response headers aborts shared HTTP without closing it',
    (t) async {
      final client = AbortClient(),
          api = WeatherApi('https://test.invalid', client: AbortClient());
      final c = WeatherChat(
        api: WeatherApi(api.origin, client: client),
        city: seoul,
        forecast: Forecast.fromJson(snapshot()),
        language: 'en',
      );
      final request = c.send('rain?');
      await flush(t);
      c.stop();
      await flush(t);
      await request;
      expectSync(client.aborts, 1);
      expectSync(c.error, isNull);
      expectSync(c.stopped, true);
      c.dispose();
      await flush(t);
      expectSync(client.closes, 0);
      client.close();
      api.close();
    },
  );

  testWidgets(
    'disconnect never commits data or evidence and retries only on demand',
    (t) async {
      var calls = 0;
      final api = WeatherApi(
        'https://test.invalid',
        client: MockClient((r) async {
          calls++;
          return http.Response.bytes(
            utf8.encode(sseAnswer(result(), finish: false)),
            200,
            headers: sseHeaders,
          );
        }),
      );
      final c = WeatherChat(
        api: api,
        city: seoul,
        forecast: Forecast.fromJson(snapshot()),
        language: 'en',
      );
      final request = c.send('rain?');
      await flush(t);
      await request;
      expectSync(c.error, 'askFail');
      expectSync(c.singleContext, isNull);
      expectSync(c.result(c.messages.last), isNull);
      await t.pump(const Duration(seconds: 8));
      expectSync(calls, 1);
      c.dispose();
      api.close();
    },
  );

  testWidgets('hung stream times out once and aborts without a hidden retry', (
    t,
  ) async {
    final client = AbortClient();
    final api = WeatherApi('https://test.invalid', client: client);
    final c = WeatherChat(
      api: api,
      city: seoul,
      forecast: Forecast.fromJson(snapshot()),
      language: 'en',
    );
    final task = c.send('rain?');
    await flush(t);
    await t.pump(const Duration(seconds: 46));
    await flush(t);
    await task;
    expectSync(client.aborts, 1);
    expectSync(c.error, 'askFail');
    expectSync(c.stopped, false);
    c.dispose();
    api.close();
  });

  testWidgets('closing during 409 refresh never starts a later model request', (
    t,
  ) async {
    final response = Completer<http.Response>();
    var asks = 0;
    final api = WeatherApi(
      'https://test.invalid',
      client: MockClient((r) async {
        if (r.url.path == '/api/weather') return response.future;
        asks++;
        return sseRes(result());
      }),
    );
    final c = WeatherChat(
      api: api,
      city: seoul,
      forecast: Forecast.fromJson(snapshot()),
      language: 'en',
    );
    final refresh = c.refreshAndRetry();
    await flush(t);
    c.stop();
    response.complete(jsonRes(snapshot(v: 'new')));
    await flush(t);
    await refresh;
    expectSync(asks, 0);
    expectSync(c.forecast.version, 'test');
    c.dispose();
    api.close();
  });

  for (final inStream in [false, true]) {
    testWidgets(
      '429 ${inStream ? 'SSE' : 'HTTP'} manual retry keeps user history',
      (t) async {
        var calls = 0;
        final api = WeatherApi(
          'https://test.invalid',
          client: MockClient((r) async {
            calls++;
            if (calls > 1) return sseRes(result('ok'));
            return inStream
                ? http.Response(
                    frame({
                      'type': 'error',
                      'errorText': jsonEncode({
                        'status': 429,
                        'code': 'RATE_LIMITED',
                      }),
                    }),
                    200,
                    headers: sseHeaders,
                  )
                : http.Response('{"code":"RATE_LIMITED"}', 429);
          }),
        );
        final c = WeatherChat(
          api: api,
          city: seoul,
          forecast: Forecast.fromJson(snapshot()),
          language: 'en',
        );
        c.setReducedMotion(true);
        var request = c.send('rain?');
        await flush(t);
        await request;
        expectSync(c.error, 'limited');
        expectSync(calls, 1);
        request = c.retry();
        await flush(t);
        await request;
        expectSync(c.error, isNull);
        expectSync(calls, 2);
        expectSync(
          c.messages.where((m) => m.role == MessageRole.user),
          hasLength(1),
        );
        c.dispose();
        api.close();
      },
    );
  }

  testWidgets(
    'single city follow-up and 409 refresh preserve date anchor and city version',
    (t) async {
      var calls = 0, weatherCalls = 0;
      final gz = {
        'id': 'guangzhou',
        'name': '广州',
        'country': 'CN',
        'lat': 23.13,
        'lon': 113.26,
        'version': 'gz-old',
        'lookup': '广州',
      };
      final context = {
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
      };
      final api = WeatherApi(
        'https://test.invalid',
        client: MockClient((r) async {
          if (r.url.path == '/api/weather') {
            weatherCalls++;
            return jsonRes(snapshot(v: 'new'));
          }
          final body = jsonDecode(r.body) as Json;
          calls++;
          expectSync(body.containsKey('messages'), false);
          if (calls == 2) {
            expectSync(body['singleContext'], context);
            return http.Response('{"code":"STALE_FORECAST"}', 409);
          }
          if (calls == 3) {
            expectSync(body['question'], '出门穿什么衣服');
            expectSync(body['version'], 'new');
            expectSync(body['singleContext']['city']['version'], 'new');
            expectSync(
              body['singleContext']['dateAnchor'],
              context['dateAnchor'],
            );
          }
          return sseRes({
            ...result(),
            'version': calls == 3 ? 'new' : 'test',
            'singleContext': context,
            'singleForecast': {'city': gz, 'forecast': snapshot(v: 'gz-old')},
          });
        }),
      );
      final c = WeatherChat(
        api: api,
        city: seoul,
        forecast: Forecast.fromJson(snapshot()),
        language: 'zh-Hans',
      );
      c.setReducedMotion(true);
      var task = c.send('今天广州天气怎样');
      await flush(t);
      await task;
      expectSync(c.error, isNull);
      expectSync(c.singleContext, context);
      task = c.send('出门穿什么衣服');
      await flush(t);
      await task;
      expectSync(c.error, 'changed');
      task = c.refreshAndRetry();
      await flush(t);
      await task;
      expectSync(calls, 3);
      expectSync(weatherCalls, 2);
      expectSync(c.snapshotFor(c.messages[1]).version, 'test');
      c.dispose();
      api.close();
    },
  );

  testWidgets('invalid result does not poison valid conversation context', (
    t,
  ) async {
    final api = WeatherApi(
      'https://test.invalid',
      client: MockClient(
        (r) async => sseRes({
          ...result(),
          'singleContext': {'city': 'broken'},
        }),
      ),
    );
    final c = WeatherChat(
      api: api,
      city: seoul,
      forecast: Forecast.fromJson(snapshot()),
      language: 'en',
    );
    var task = c.send('rain?');
    await flush(t);
    await task;
    expectSync(c.error, 'askFail');
    expectSync(c.singleContext, isNull);
    expectSync(c.result(c.messages.last), isNull);
    c.dispose();
    api.close();
  });

  for (final lang in languageNames.keys) {
    testWidgets(
      '$lang composer clear, history, hide prompts, stop, preserve new draft, city day evidence',
      (t) async {
        final pending = Completer<http.Response>();
        var calls = 0;
        final gz = {
          'id': 'guangzhou',
          'name': '广州',
          'country': 'CN',
          'lat': 23.13,
          'lon': 113.26,
        };
        final api = WeatherApi(
          'https://test.invalid',
          client: MockClient((r) async {
            calls++;
            if (calls == 2) return pending.future;
            return sseRes({
              ...result('广州今天温暖'),
              'dailyEvidence': [
                {'date': '2025-01-01', 'min': 10, 'max': 20, 'code': 2},
              ],
              'singleForecast': {
                'city': gz,
                'forecast': {...snapshot(), 'timezone': 'Asia/Shanghai'},
              },
            });
          }),
        );
        final session = WeatherChat(
          api: api,
          city: seoul,
          forecast: Forecast.fromJson(snapshot()),
          language: lang,
        );
        await t.pumpWidget(
          MaterialApp(
            home: QuestionPage(
              api: api,
              city: seoul,
              forecast: session.forecast,
              w: Words(lang),
              session: session,
            ),
          ),
        );
        final field = find.byKey(const ValueKey('chat-input'));
        final send = find.byKey(const ValueKey('chat-send'));
        expectSync(find.byType(ActionChip), findsNWidgets(4));
        await t.enterText(field, '今天广州天气怎样');
        await t.tap(send);
        await t.pump();
        expectSync(t.widget<TextField>(field).controller!.text, isEmpty);
        await settleChat(t);
        expectSync(find.byType(ActionChip), findsNothing);
        final day = find.byType(ListTile).last;
        await t.ensureVisible(day);
        await t.tap(day);
        await settleChat(t);
        expectSync(find.text('广州 · 2025-01-01'), findsOneWidget);
        expectSync(find.textContaining('Asia/Shanghai'), findsOneWidget);
        await t.tap(find.byType(BackButton));
        await settleChat(t);
        await t.enterText(field, '出门穿什么衣服');
        await t.tap(send);
        await flush(t);
        await t.enterText(field, 'new draft');
        pending.complete(http.Response('{"code":"UNAVAILABLE"}', 503));
        await settleChat(t);
        expectSync(t.widget<TextField>(field).controller!.text, 'new draft');
        expectSync(
          session.messages
              .where((m) => m.role == MessageRole.user)
              .map(messageText),
          ['今天广州天气怎样', '出门穿什么衣服'],
        );
        await t.tap(find.byKey(const ValueKey('chat-retry')));
        await settleChat(t);
        expectSync(calls, 3);
        expectSync(t.widget<TextField>(field).controller!.text, 'new draft');
        await t.pumpWidget(const SizedBox());
        await t.pumpWidget(
          MaterialApp(
            home: QuestionPage(
              api: api,
              city: seoul,
              forecast: session.forecast,
              w: Words(lang),
              session: session,
            ),
          ),
        );
        await settleChat(t);
        expectSync(find.byType(ActionChip), findsNothing);
        expectSync(
          session.messages.where((m) => m.role == MessageRole.user),
          hasLength(2),
        );
        expectSync(calls, 3);
        await t.pumpWidget(const SizedBox());
        session.dispose();
        api.close();
      },
    );
  }
}
