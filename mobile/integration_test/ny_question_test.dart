import 'package:ai_ui_stream/ai_ui_stream.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:timezone/data/latest.dart' as zones;
import 'package:weather_atlas/data.dart';
import 'package:weather_atlas/locale.dart';
import 'package:weather_atlas/questions.dart';
import 'package:weather_atlas/weather_chat.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  const live = bool.fromEnvironment('LIVE_NY_CHAT');
  zones.initializeTimeZones();
  testWidgets('纽约单城真实 SSE 回答与清空输入', (t) async {
    binding.testTextInput.register();
    final api = WeatherApi(
      const String.fromEnvironment(
        'WEATHER_API_BASE',
        defaultValue: 'http://127.0.0.1:3300',
      ),
    );
    const city = Place('chengdu-probe', '成都', '', 'CN', 30.5728, 104.0668);
    final forecast = await api.weather(city);
    final chat = WeatherChat(
      api: api,
      city: city,
      forecast: forecast,
      language: 'zh-Hans',
    );
    try {
      await t.pumpWidget(
        MaterialApp(
          home: QuestionPage(
            api: api,
            city: city,
            forecast: forecast,
            w: Words('zh-Hans'),
            session: chat,
          ),
        ),
      );
      final input = find.byKey(const ValueKey('chat-input'));
      await t.enterText(input, '今天纽约天气怎样');
      await t.tap(find.byKey(const ValueKey('chat-send')));
      await t.pump();
      expect(t.widget<TextField>(input).controller!.text, isEmpty);
      for (var i = 0; i < 600 && chat.busy; i++) {
        await t.pump(const Duration(milliseconds: 100));
      }
      expect(chat.busy, false);
      expect(chat.error, isNull, reason: '${chat.chat.error}');
      final answer = chat.messages.lastWhere(
        (m) => m.role == MessageRole.assistant,
      );
      expect(messageText(answer), contains('纽约'));
      final result = chat.result(answer)!;
      expect(result['source'], 'model');
      expect(
        result['singleForecast']['forecast']['timezone'],
        'America/New_York',
      );
      expect(
        (result['evidence'] as List).isNotEmpty ||
            (result['dailyEvidence'] as List? ?? []).isNotEmpty,
        true,
      );
      expect(t.widget<TextField>(input).controller!.text, isEmpty);
      debugPrint(
        'NY_CHAT_RESULT: model SSE, America/New_York, evidence, empty input',
      );
    } finally {
      await t.pumpWidget(const SizedBox());
      chat.dispose();
      api.close();
      binding.testTextInput.unregister();
    }
  }, skip: !live);
}
