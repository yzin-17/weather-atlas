import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/data/latest.dart' as zones;
import 'package:weather_atlas/locale.dart';
import 'package:weather_atlas/main.dart';
import 'package:weather_atlas/questions.dart';
import 'widget_test.dart' show controller, snapshot, jsonRes;

void main() {
  setUpAll(zones.initializeTimeZones);
  for (final language in languageNames.keys) {
    testWidgets(
      '$language floating ask survives scrolling and opens the chat',
      (tester) async {
        tester.view.physicalSize = const Size(390, 844);
        tester.view.devicePixelRatio = 1;
        tester.view.viewPadding = const FakeViewPadding(bottom: 34);
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.view.resetViewPadding);
        var calls = 0;
        final c = await controller((request) async {
          calls++;
          return jsonRes(snapshot());
        });
        await c.load();
        c.changeLocale(language);
        await tester.pumpWidget(Atlas(controller: c));
        await tester.pumpAndSettle();
        final launcher = find.byKey(const ValueKey('weather-ask-launcher'));
        final before = tester.getRect(launcher);
        expect(before.center.dx, greaterThan(195));
        expect(before.right, lessThanOrEqualTo(390 - 16));
        expect(before.bottom, lessThanOrEqualTo(844 - 34));
        expect(find.text(Words(language)('askShort')), findsOneWidget);
        await tester.drag(find.byType(ListView).first, const Offset(0, -600));
        await tester.pumpAndSettle();
        expect(tester.getRect(launcher), before);
        final beforeOpen = calls;
        await tester.tap(launcher);
        await tester.pumpAndSettle();
        expect(find.byType(QuestionPage), findsOneWidget);
        expect(launcher, findsNothing);
        expect(calls, beforeOpen, reason: '打开入口不额外请求天气或模型');
        await tester.tap(find.byType(BackButton));
        await tester.pumpAndSettle();
        expect(launcher, findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
        c.dispose();
      },
    );
  }
}
