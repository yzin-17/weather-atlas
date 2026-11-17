import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:weather_atlas/data.dart';

void main() {
  final document = jsonDecode(
    File('../contracts/forecast-cases.json').readAsStringSync(),
  );
  if (document is! Map<String, dynamic> || document['cases'] is! List) {
    throw const FormatException('Invalid shared contract cases');
  }
  for (final entry in document['cases']) {
    if (entry is! Map<String, dynamic> ||
        entry['name'] is! String ||
        entry['valid'] is! bool) {
      throw const FormatException('Invalid shared contract case');
    }
    test('共享预报契约：${entry['name']}', () {
      final value = jsonDecode(jsonEncode(document['base']));
      final path = entry['path'];
      if (path is List && path.isNotEmpty) {
        dynamic target = value;
        for (final key in path.take(path.length - 1)) {
          target = target[key];
        }
        target[path.last] = entry['value'];
      }
      if (value is! Map<String, dynamic>) {
        throw const FormatException('Invalid base');
      }
      if (entry['valid'] == true) {
        final f = Forecast.fromJson(value);
        if (entry['name'] == '零值和缺测降水') {
          expect(f.hours.first.rain, isNull);
        }
        expect(f.hours[1].rain, 0);
        expect(f.days.first.min, 0);
      } else {
        expect(() => Forecast.fromJson(value), throwsFormatException);
      }
    });
  }
}
