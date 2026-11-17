import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_test/flutter_test.dart';
import 'package:weather_atlas/data.dart';

int _sequence = 0;
// async* cancellation at [DONE] can settle on Dart's root event loop.
Future<void> settleChat(WidgetTester t) async {
  await t.pump();
  await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 5)));
  await t.pumpAndSettle();
}

String frame(Json data) => 'data: ${jsonEncode(data)}\n\n';
String sseAnswer(Json data, {bool finish = true}) =>
    [
      {'type': 'start', 'messageId': 'answer-${++_sequence}'},
      {
        'type': 'data-phase',
        'data': {'phase': 'model'},
        'transient': true,
      },
      {'type': 'text-start', 'id': 'text'},
      {'type': 'text-delta', 'id': 'text', 'delta': data['answer']},
      {'type': 'text-end', 'id': 'text'},
      {'type': 'data-weather', 'data': data},
      if (finish) {'type': 'finish', 'finishReason': 'stop'},
    ].map(frame).join() +
    (finish ? 'data: [DONE]\n\n' : '');
const sseHeaders = {
  'content-type': 'text/event-stream; charset=utf-8',
  'x-vercel-ai-ui-message-stream': 'v1',
};
http.Response sseRes(Json data) =>
    http.Response.bytes(utf8.encode(sseAnswer(data)), 200, headers: sseHeaders);

Json comparisonContext(List<Json> cities, {int marker = 1}) => {
  'origin': '37.5660,126.9784',
  'createdAt': 1735736400000,
  'dateAnchor': 1735736400000,
  'cities': [
    for (final p in cities) {...p, 'version': 'test'},
  ],
  'alignmentZone': null,
  'marker': marker,
  'plan': {
    'intent': 'rain',
    'window': 'local',
    'startDay': 1,
    'dayCount': 1,
    'fromHour': 7,
    'toHour': 9,
  },
};
