import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:weather_atlas/main.dart' as app;
import 'package:weather_atlas/locale.dart';
import 'package:weather_atlas/questions.dart';
import 'package:weather_atlas/location_picker.dart';
import 'package:flutter_map/flutter_map.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;

void main() {
  WidgetController.hitTestWarningShouldBeFatal = true;
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('本机服务四语、三轮比较、台北依据和地图语言', (t) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('mode', 'manual');
    await prefs.setString('locale', 'zh-Hans');
    await prefs.remove('place');
    await prefs.remove('saved');
    const base = String.fromEnvironment('WEATHER_API_BASE');
    const traceNetwork = bool.fromEnvironment('TRACE_NETWORK');
    Future<void> phase(String name) async {
      if (traceNetwork) {
        final response = await http.get(
          Uri.parse('$base/__qa/phase?name=$name'),
        );
        expect(response.statusCode, 204);
      }
    }

    if (traceNetwork) {
      for (final key
          in prefs
              .getKeys()
              .where(
                (k) =>
                    k.startsWith('forecast.$base.') ||
                    k == 'forecastKeys.$base',
              )
              .toList()) {
        await prefs.remove(key);
      }
    }
    await prefs.setString('origin', base);
    await phase('home');
    await app.main();
    Future<void> waitFor(Finder finder) async {
      for (var i = 0; i < 40; i++) {
        await t.pump(const Duration(milliseconds: 250));
        if (finder.evaluate().isNotEmpty) return;
      }
      expect(finder, findsWidgets);
    }

    await waitFor(find.text(const Words('zh-Hans')('hourly')));
    await phase('language');
    var w = const Words('zh-Hans');
    for (final lang in ['zh-Hant', 'en', 'ko', 'zh-Hans']) {
      await t.tap(find.byTooltip(w('language')));
      await t.pumpAndSettle();
      await t.tap(find.text(languageNames[lang]!));
      await t.pumpAndSettle();
      w = Words(lang);
      expect(find.text(w('hourly')), findsOneWidget);
      await t.tap(find.byTooltip(w('copyLink')));
      await t.pumpAndSettle();
      expect(
        (await Clipboard.getData('text/plain'))?.text,
        contains('/$lang/weather/seoul-1835848'),
      );
      const publicOrigin = String.fromEnvironment('WEATHER_SITE_URL');
      expect(
        Uri.parse((await Clipboard.getData('text/plain'))!.text!).origin,
        Uri.parse(publicOrigin.isEmpty ? base : publicOrigin).origin,
      );
    }
    final ask = find.byTooltip(w('ask'));
    await phase('ask');
    await t.ensureVisible(ask);
    await t.tap(ask);
    await t.pumpAndSettle();
    for (final key in ['compare', 'afternoon', 'colder']) {
      if (key == 'compare') {
        final chip = find.widgetWithText(ActionChip, w(key));
        await t.ensureVisible(chip);
        await t.tap(chip);
      } else {
        await t.enterText(find.byKey(const ValueKey('chat-input')), w(key));
        await t.tap(find.byKey(const ValueKey('chat-send')));
      }
      for (var i = 0; i < 80; i++) {
        await t.pump(const Duration(milliseconds: 250));
        if (find.byType(LinearProgressIndicator).evaluate().isEmpty) break;
      }
      await t.pumpAndSettle();
      final refresh = find.text(w('refreshAsk'));
      if (refresh.evaluate().isNotEmpty) {
        await t.ensureVisible(refresh);
        await t.tap(refresh);
        for (var i = 0; i < 80; i++) {
          await t.pump(const Duration(milliseconds: 250));
          if (find.byType(LinearProgressIndicator).evaluate().isEmpty) break;
        }
        await t.pumpAndSettle();
      }
      await waitFor(find.byType(SelectableText));
      final answer = t
          .widget<SelectableText>(find.byType(SelectableText).last)
          .data!;
      expect(
        answer,
        contains(key == 'compare' ? '07:00–09:00' : '12:00–17:00'),
      );
      expect(answer, contains(key == 'colder' ? '最低温度' : '降水概率'));
      expect(answer, isNot(contains('无法比较')));
      if (const bool.fromEnvironment('EXPECT_MODEL')) {
        expect(find.text(w('model')), findsWidgets);
      }
      await waitFor(find.byIcon(Icons.arrow_forward));
      expect(find.textContaining('台北'), findsWidgets);
    }
    final evidence = find.byWidgetPredicate(
      (widget) =>
          widget is ListTile &&
          widget.key.toString().contains('hour-evidence-Asia/Taipei'),
    );
    final answerScroll = find
        .descendant(
          of: find.byType(QuestionPage),
          matching: find.byType(Scrollable),
        )
        .first;
    for (var i = 0; i < 40 && evidence.evaluate().isEmpty; i++) {
      await t.drag(answerScroll, const Offset(0, -350));
      await t.pumpAndSettle();
    }
    expect(evidence, findsWidgets);
    await t.ensureVisible(evidence.first);
    await t.pumpAndSettle();
    await t.tap(evidence.first);
    await t.pumpAndSettle();
    expect(find.byType(ComparisonEvidencePage), findsOneWidget);
    expect(find.textContaining('Asia/Taipei'), findsOneWidget);
    await t.tap(find.byType(BackButton).first);
    await t.pumpAndSettle();
    await t.tap(find.byType(BackButton).first);
    await t.pumpAndSettle();
    await t.ensureVisible(find.byTooltip(w('search')));
    await phase('search-map');
    await t.tap(find.byTooltip(w('search')));
    await t.pumpAndSettle();
    expect(find.byType(LocationPicker), findsOneWidget);
    await phase('map-open');
    await t.tap(find.byTooltip(w('map')));
    await t.pumpAndSettle();
    expect(find.byType(FlutterMap), findsOneWidget);
    final map = t.widget<FlutterMap>(find.byType(FlutterMap)).mapController!;
    await phase('map-drag');
    await t.drag(find.byType(FlutterMap), const Offset(50, 30));
    await t.pumpAndSettle();
    final center = map.camera.center, zoom = map.camera.zoom;
    await phase('map-weather');
    expect(find.byTooltip(w('language')), findsNothing);
    final layer = t.widget<TileLayer>(find.byType(TileLayer));
    expect(layer.urlTemplate, '$base/api/map-tiles/{z}/{x}/{y}');
    expect(map.camera.center, center);
    expect(map.camera.zoom, zoom);
    final mapRect = t.getRect(find.byType(FlutterMap));
    await phase('map-point');
    await t.tapAt(
      Offset(
        mapRect.left + mapRect.width * .3,
        mapRect.top + mapRect.height * .3,
      ),
    );
    await t.pump(const Duration(milliseconds: 400));
    await t.pumpAndSettle();
    final selectedPoint = t
        .widget<MarkerLayer>(find.byType(MarkerLayer))
        .markers
        .single
        .point;
    expect(selectedPoint.latitude, isNot(37.566));
    await phase('confirm');
    await t.tap(find.text(w('confirm')));
    await t.pumpAndSettle();
    await t.scrollUntilVisible(
      find.byTooltip(w('copyLink')),
      -350,
      maxScrolls: 40,
      scrollable: find.byType(Scrollable).first,
    );
    await t.pumpAndSettle();
    await waitFor(find.text(w('hourly')));
    await t.tap(find.byTooltip(w('copyLink')));
    await t.pumpAndSettle();
    final pointLink = Uri.parse((await Clipboard.getData('text/plain'))!.text!);
    expect(pointLink.path, '/zh-Hans/explore');
    expect(
      double.parse(pointLink.queryParameters['lat']!),
      closeTo(selectedPoint.latitude, 0.0001),
    );
    expect(
      double.parse(pointLink.queryParameters['lon']!),
      closeTo(selectedPoint.longitude, 0.0001),
    );
    if (traceNetwork) {
      final record =
          jsonDecode((await http.get(Uri.parse('$base/__qa/report'))).body)
              as Map<String, dynamic>;
      final rows = (record['rows'] as List).cast<Map<String, dynamic>>();
      expect(
        rows.where(
          (r) =>
              r['phase'] == 'home' &&
              r['path'].toString().startsWith('/api/tiles/'),
        ),
        isEmpty,
      );
      for (final name in ['language', 'map-drag', 'map-weather', 'map-point']) {
        expect(
          rows.where((r) => r['phase'] == name && r['path'] == '/api/weather'),
          isEmpty,
        );
      }
      final confirms = rows
          .where((r) => r['phase'] == 'confirm' && r['path'] == '/api/weather')
          .toList();
      expect(confirms, hasLength(1));
      expect(
        double.parse(confirms.single['lat'] as String),
        closeTo(selectedPoint.latitude, .0001),
      );
      expect(
        double.parse(confirms.single['lon'] as String),
        closeTo(selectedPoint.longitude, .0001),
      );
    }
    await phase('search-save');
    await t.tap(find.byTooltip(w('search')));
    await t.pumpAndSettle();
    await t.enterText(find.byType(TextField), '台北');
    final taipeiResult = find.widgetWithText(ListTile, '台北');
    await waitFor(taipeiResult);
    await t.tap(taipeiResult.first);
    await t.pumpAndSettle();
    await waitFor(find.text(w('hourly')));
    await t.scrollUntilVisible(
      find.byTooltip(w('save')),
      -350,
      maxScrolls: 40,
      scrollable: find.byType(Scrollable).first,
    );
    await t.pumpAndSettle();
    expect(find.textContaining('Asia/Taipei'), findsOneWidget);
    await t.tap(find.byTooltip(w('save')));
    await t.pumpAndSettle();
    expect(find.byTooltip(w('remove')), findsOneWidget);
    expect(prefs.getString('place'), contains('121.5319'));
    expect(prefs.getString('saved'), contains('121.5319'));
    await prefs.remove('origin');
  });
}
