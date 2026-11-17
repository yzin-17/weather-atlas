import 'dart:convert';
import 'dart:math' as math;
import 'package:http/http.dart' as http;
import 'package:timezone/timezone.dart' as tz;

typedef Json = Map<String, dynamic>;
const seoul = Place('1835848', 'Seoul', '', 'KR', 37.566, 126.9784);
const shenzhen = Place('1795565', 'Shenzhen', '', 'CN', 22.5455, 114.0683);
const defaultCity = shenzhen;
const defaultCities = [
  defaultCity,
  seoul,
  Place('1819729', 'Hong Kong', '', 'HK', 22.2783, 114.1747),
  Place('1850147', 'Tokyo', '', 'JP', 35.6895, 139.6917),
  Place('5128581', 'New York', '', 'US', 40.7143, -74.006),
  Place('2643743', 'London', '', 'GB', 51.5085, -0.1257),
];

Uri cityLink(String origin, Place place, String language) {
  const slugs = {
    '1835848': 'seoul',
    '1795565': 'shenzhen',
    '1819729': 'hong-kong',
    '1668341': 'taipei',
    '1815286': 'chengdu',
    '2643743': 'london',
    '1850147': 'tokyo',
    '5128581': 'new-york',
  };
  final slug = slugs[place.id];
  return Uri.parse(Uri.parse(origin).origin).replace(
    path: slug == null
        ? '/$language/explore'
        : '/$language/weather/$slug-${place.id}',
    queryParameters: slug == null
        ? {
            'lat': '${place.lat}',
            'lon': '${place.lon}',
            'name': place.name,
            'country': place.country,
            'id': place.id,
            if (place.isCoordinate)
              'kind': place.id.startsWith('gps') ? 'gps' : 'pin',
            if (place.region.isNotEmpty) 'region': place.region,
          }
        : null,
  );
}

class Place {
  final String id, name, region, country;
  final double lat, lon;
  final Json? label;
  const Place(
    this.id,
    this.name,
    this.region,
    this.country,
    this.lat,
    this.lon, {
    this.label,
  });
  factory Place.fromJson(Json row) => Place(
    row['id'].toString(),
    row['name'] as String,
    row['region'] as String? ?? '',
    row['country'] as String? ?? '',
    (row['lat'] as num).toDouble(),
    (row['lon'] as num).toDouble(),
    label: row['label'] is Map<String, dynamic> ? row['label'] as Json : null,
  );
  Json toJson() => {
    'id': id,
    'name': name,
    'region': region,
    'country': country,
    'lat': lat,
    'lon': lon,
    if (label != null) 'label': label,
  };
  bool get isCoordinate => RegExp(r'^(gps|pin|point)(?:-|$)').hasMatch(id);
  Place withReverseLabel(Json? value, String language) {
    if (!isCoordinate) return this;
    String clean(dynamic v) => v is String ? v.trim() : '';
    final data = value ?? label;
    final names = data?['names'] is Map ? data!['names'] as Map : null;
    final countries = data?['countries'] is Map
        ? data!['countries'] as Map
        : null;
    final title = clean(names?[language]).isNotEmpty
        ? clean(names?[language])
        : clean(data?['name']);
    final area = clean(data?['region']).isNotEmpty
        ? clean(data?['region'])
        : region;
    final nation = clean(countries?[language]).isNotEmpty
        ? clean(countries?[language])
        : clean(data?['country']);
    return Place(
      id,
      title.isNotEmpty
          ? title
          : area.isNotEmpty
          ? area
          : '${lat.toStringAsFixed(4)}, ${lon.toStringAsFixed(4)}',
      area,
      nation.isNotEmpty ? nation : country,
      lat,
      lon,
      label: data == null ? null : {...data, 'locale': language, 'name': title},
    );
  }

  String get key => '${lat.toStringAsFixed(4)},${lon.toStringAsFixed(4)}';
  String get context =>
      [region, country].where((s) => s.isNotEmpty).toSet().join(' · ');
}

class Reading {
  final int time;
  final num? temp, rain;
  final int? code;
  Reading.fromJson(Json json)
    : time = (json['time'] as num).toInt(),
      temp = json['temp'] as num?,
      rain = json['rain'] as num?,
      code = (json['code'] as num?)?.toInt();
}

class ForecastDay {
  final String date;
  final num? min, max;
  final int? code;
  ForecastDay.fromJson(Json json)
    : date = json['date'] as String,
      min = json['min'] as num?,
      max = json['max'] as num?,
      code = (json['code'] as num?)?.toInt();
}

class Forecast {
  final Json raw;
  final String timezone, version, source;
  final bool stale;
  final DateTime fetchedAt;
  final Reading current;
  final List<Reading> hours;
  final List<ForecastDay> days;
  late final num weeklyMinimum = days
      .map((d) => d.min)
      .whereType<num>()
      .fold<double>(double.infinity, (a, b) => math.min(a, b.toDouble()));
  late final num weeklyMaximum = days
      .map((d) => d.max)
      .whereType<num>()
      .fold<double>(
        double.negativeInfinity,
        (a, b) => math.max(a, b.toDouble()),
      );
  Forecast.fromJson(this.raw)
    : timezone = raw['timezone'] as String,
      version = raw['version'] as String,
      source = raw['source'] as String? ?? 'open-meteo',
      stale = raw['stale'] == true,
      fetchedAt = DateTime.parse(raw['fetchedAt'] as String),
      current = Reading.fromJson(raw['current'] as Json),
      hours = (raw['hours'] as List)
          .map((r) => Reading.fromJson(r as Json))
          .toList(),
      days = (raw['days'] as List)
          .map((r) => ForecastDay.fromJson(r as Json))
          .toList();
  tz.TZDateTime local(int unixSeconds) =>
      tz.TZDateTime.fromMillisecondsSinceEpoch(
        tz.getLocation(timezone),
        unixSeconds * 1000,
      );
}

class RequestFailure implements Exception {
  final int status;
  final String? code;
  const RequestFailure(this.status, [this.code]);
}

class ReverseLookup {
  const ReverseLookup(this.label, {this.retryDelay});
  final Json? label;
  final Duration? retryDelay;
}

class WeatherApi {
  String origin;
  final http.Client client;
  WeatherApi(this.origin, {http.Client? client})
    : client = client ?? http.Client();
  void close() => client.close();
  Future<Json> request(
    String path, {
    Map<String, String>? query,
    Json? body,
    Duration? timeout,
    Future<void>? abortTrigger,
  }) async {
    final uri = Uri.parse(origin).resolve(path).replace(queryParameters: query);
    final result =
        await (body == null
                ? abortTrigger == null
                      ? client.get(uri)
                      : client
                            .send(
                              http.AbortableRequest(
                                'GET',
                                uri,
                                abortTrigger: abortTrigger,
                              ),
                            )
                            .then(http.Response.fromStream)
                : client.post(
                    uri,
                    headers: {'content-type': 'application/json'},
                    body: jsonEncode(body),
                  ))
            .timeout(timeout ?? Duration(seconds: body == null ? 22 : 45));
    if (result.statusCode != 200) {
      String? code;
      try {
        code = (jsonDecode(result.body) as Json)['code'] as String?;
      } on FormatException {
        /* Upstream can return a plain text error. */
      } on TypeError {
        /* Non-JSON response. */
      }
      throw RequestFailure(result.statusCode, code);
    }
    return jsonDecode(utf8.decode(result.bodyBytes)) as Json;
  }

  Future<Forecast> weather(Place p) async => Forecast.fromJson(
    await request(
      '/api/weather',
      query: {'lat': '${p.lat}', 'lon': '${p.lon}', 'fresh': '1'},
    ),
  );
  Future<Json?> reverse(Place p, String language) async =>
      (await reverseLookup(p, language)).label;

  Future<ReverseLookup> reverseLookup(Place p, String language) async {
    final data = await request(
      '/api/reverse',
      query: {'lat': '${p.lat}', 'lon': '${p.lon}', 'lang': language},
      timeout: const Duration(milliseconds: 8500),
    );
    final label = data['place'];
    if (label is Json) {
      final name = label['name'];
      if (name is String && name.trim().isNotEmpty) return ReverseLookup(label);
    }
    final delay = data['retryAfterMs'];
    if (label == null && data.containsKey('place')) {
      return ReverseLookup(
        null,
        retryDelay: delay is num && delay.isFinite
            ? Duration(milliseconds: delay.clamp(1000, 10000).toInt())
            : null,
      );
    }
    throw const FormatException('Invalid reverse lookup response');
  }

  Future<List<Place>> search(String term, String locale) async =>
      ((await request(
                '/api/places',
                query: {'q': term, 'lang': locale},
              ))['places']
              as List)
          .map((r) => Place.fromJson(r as Json))
          .toList();
  Future<Map<String, Json>> summaries(
    List<Place> places, {
    Future<void>? abortTrigger,
  }) async {
    if (places.isEmpty) return {};
    final items =
        (await request(
              '/api/summaries',
              abortTrigger: abortTrigger,
              query: {
                'coords': places.map((p) => '${p.lat},${p.lon}').join(';'),
              },
            ))['items']
            as List;
    return {
      for (final r in items)
        '${(r['lat'] as num).toStringAsFixed(4)},${(r['lon'] as num).toStringAsFixed(4)}':
            r as Json,
    };
  }

  Future<Json> ask(
    String q,
    String lang,
    Place city,
    Forecast f, {
    Json? context,
  }) => request(
    '/api/ask',
    body: {
      'question': q,
      'locale': lang,
      'lat': city.lat,
      'lon': city.lon,
      'version': f.version,
      'context': ?context,
    },
  );
}

String temp(num? value) => value == null ? '—' : '${value.round()}°';
String hh(DateTime d) =>
    '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
String ymd(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
