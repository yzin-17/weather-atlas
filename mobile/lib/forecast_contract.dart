// 内部 API 边界；对应 contracts/forecast-cases.json 的跨端契约。
bool validForecast(Object? value) {
  bool finite(Object? v) => v is num && v.isFinite;
  bool code(Object? v) =>
      v is num && v.isFinite && v == v.round() && v >= 0 && v <= 99;
  bool text(Object? v) => v is String && v.isNotEmpty;
  bool current(Object? v) =>
      v is Map<String, dynamic> &&
      finite(v['time']) &&
      finite(v['temp']) &&
      code(v['code']);
  bool hour(Object? v) =>
      v is Map<String, dynamic> &&
      current(v) &&
      v.containsKey('rain') &&
      (v['rain'] == null ||
          (v['rain'] is num &&
              finite(v['rain']) &&
              v['rain'] >= 0 &&
              v['rain'] <= 100));
  bool day(Object? v) =>
      v is Map<String, dynamic> &&
      v['date'] is String &&
      RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(v['date']) &&
      finite(v['min']) &&
      finite(v['max']) &&
      v['min'] <= v['max'] &&
      code(v['code']);
  if (value is! Map<String, dynamic>) return false;
  final hours = value['hours'],
      days = value['days'],
      comparison = value['comparisonHours'],
      fetched = value['fetchedAt'];
  return text(value['version']) &&
      text(value['timezone']) &&
      ['demo', 'fixture', 'open-meteo'].contains(value['source']) &&
      value['stale'] is bool &&
      fetched is String &&
      DateTime.tryParse(fetched) != null &&
      current(value['current']) &&
      hours is List &&
      hours.length == 24 &&
      hours.every(hour) &&
      days is List &&
      days.length == 7 &&
      days.every(day) &&
      (!value.containsKey('comparisonHours') ||
          (comparison is List && comparison.every(hour)));
}
