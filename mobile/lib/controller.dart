import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart' show WidgetsBinding;
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'data.dart';
import 'locale.dart' show resolveLanguage;

class WeatherController extends ChangeNotifier {
  WeatherController(this.api, this.prefs);
  final WeatherApi api;
  final SharedPreferences prefs;
  final language = ValueNotifier<String?>(null);
  final summariesUpdated = ValueNotifier<int>(0);
  static const lifetime = Duration(minutes: 15);
  final _cache = <String, Forecast>{};
  final _inflight = <String, Future<Forecast>>{};
  final summaries = <String, Json>{};
  Place place = defaultCity;
  List<Place> saved = List.of(defaultCities);
  String? get locale => language.value;
  String? locationMessage;
  String? weatherMessage;
  Forecast? forecast;
  bool refreshing = false,
      failed = false,
      locating = false,
      summaryFailed = false;
  int _intent = 0, _load = 0, _summaryRequest = 0;
  int _labelRequest = 0;
  final _labelInflight = <String, Future<ReverseLookup>>{};
  Timer? _labelRetry;
  bool resolvingCity = false, cityLookupFailed = false;
  String get _labelLanguage =>
      locale ??
      resolveLanguage(WidgetsBinding.instance.platformDispatcher.locale);
  bool _disposed = false;
  void emit() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    language.dispose();
    summariesUpdated.dispose();
    _intent++;
    _cancelLabelLookup();
    _summaryRequest++;
    api.close();
    super.dispose();
  }

  Future<void> restore({bool autoLocate = true}) async {
    final storedLocale = prefs.getString('locale');
    if (['en', 'zh-Hans', 'zh-Hant', 'ko'].contains(storedLocale)) {
      language.value = storedLocale;
    }
    try {
      final s = prefs.getString('saved');
      if (s != null) {
        saved = (jsonDecode(s) as List)
            .map((r) => Place.fromJson(r as Json))
            .toList();
      }
    } catch (_) {
      saved = List.of(defaultCities);
    }
    saved = saved
        .map((p) => p.withReverseLabel(p.label, _labelLanguage))
        .toList();
    try {
      final p = prefs.getString('place');
      if (p != null) place = Place.fromJson(jsonDecode(p) as Json);
    } catch (_) {
      place = defaultCity;
    }
    final mode = prefs.getString('mode');
    if (place.isCoordinate) {
      place = place.withReverseLabel(place.label, _labelLanguage);
    }
    final loading = load();
    if (place.isCoordinate) unawaited(_resolveLabel(place));
    unawaited(refreshSummaries());
    if (autoLocate && mode != 'manual') unawaited(locate(ask: false));
    await loading;
  }

  Future<void> changeOrigin(String origin) async {
    if (api.origin == origin) return;
    _load++;
    _intent++;
    _cancelLabelLookup();
    _summaryRequest++;
    _inflight.clear();
    api.origin = origin;
    _cache.clear();
    summaries.clear();
    forecast = null;
    await prefs.setString('origin', origin);
    final refresh = load(force: true);
    if (place.isCoordinate) unawaited(_resolveLabel(place));
    unawaited(refreshSummaries(force: true));
    await refresh;
  }

  String _storageKey(String key) => 'forecast.${api.origin}.$key';
  void changeLocale(String? v) {
    language.value = v;
    if (v == null) {
      unawaited(prefs.remove('locale'));
    } else {
      unawaited(prefs.setString('locale', v));
    }
    _cancelLabelLookup();
    if (place.isCoordinate) {
      place = place.withReverseLabel(place.label, _labelLanguage);
      emit();
      unawaited(_resolveLabel(place));
    }
    saved = saved
        .map((p) => p.withReverseLabel(p.label, _labelLanguage))
        .toList();
  }

  void toggleSave(Place p) {
    p = p.withReverseLabel(p.label, _labelLanguage);
    final adding = !saved.any((c) => c.key == p.key);
    if (saved.any((c) => c.key == p.key)) {
      saved.removeWhere((c) => c.key == p.key);
    } else {
      saved.add(p);
    }
    unawaited(
      prefs.setString(
        'saved',
        jsonEncode(saved.map((c) => c.toJson()).toList()),
      ),
    );
    emit();
    if (adding && p.isCoordinate && p.key != place.key) {
      unawaited(_resolveSavedLabel(p));
    }
    unawaited(refreshSummaries());
  }

  Future<ReverseLookup> _fetchLabel(Place target, String lang) async {
    final key = '${api.origin}|${target.key}|$lang';
    final future = _labelInflight.putIfAbsent(
      key,
      () => api.reverseLookup(target, lang),
    );
    try {
      return await future;
    } finally {
      if (identical(_labelInflight[key], future)) _labelInflight.remove(key);
    }
  }

  void _renameSaved(Place target, Json label, String lang) {
    var changed = false;
    saved = saved.map((p) {
      if (!p.isCoordinate || p.key != target.key) return p;
      changed = true;
      return p.withReverseLabel(label, lang);
    }).toList();
    if (changed) {
      unawaited(
        prefs.setString(
          'saved',
          jsonEncode(saved.map((p) => p.toJson()).toList()),
        ),
      );
    }
  }

  Future<void> _resolveLabel(Place target) async {
    _labelRetry?.cancel();
    final token = ++_labelRequest, intent = _intent;
    final origin = api.origin, lang = _labelLanguage;
    bool current() =>
        !_disposed &&
        token == _labelRequest &&
        intent == _intent &&
        origin == api.origin &&
        lang == _labelLanguage &&
        target.key == place.key &&
        target.id == place.id;
    Future<void> attempt(int index) async {
      if (!current()) return;
      resolvingCity = true;
      emit();
      ReverseLookup result;
      try {
        result = await _fetchLabel(target, lang);
      } catch (error) {
        // 无覆盖不重试；传输、超时或服务端临时故障使用五秒退避。
        final retryable =
            error is! RequestFailure ||
            error.status >= 500 ||
            error.status == 408 ||
            error.status == 429;
        result = ReverseLookup(
          null,
          retryDelay: retryable ? const Duration(seconds: 5) : null,
        );
      }
      if (!current()) return;
      resolvingCity = false;
      final label = result.label;
      cityLookupFailed = label == null;
      if (label != null) {
        place = place.withReverseLabel(label, lang);
        unawaited(prefs.setString('place', jsonEncode(place.toJson())));
        _renameSaved(target, label, lang);
      } else if (index < 2) {
        final delay = result.retryDelay;
        if (delay != null) {
          _labelRetry = Timer(delay, () => unawaited(attempt(index + 1)));
        }
      }
      emit();
    }

    await attempt(0);
  }

  void _cancelLabelLookup() {
    _labelRequest++;
    _labelRetry?.cancel();
    _labelRetry = null;
    resolvingCity = false;
    cityLookupFailed = false;
  }

  Future<void> retryCityLabel() async {
    if (_disposed || !place.isCoordinate || resolvingCity) return;
    await _resolveLabel(place);
  }

  void resumeCityLabel() {
    if (cityLookupFailed) unawaited(retryCityLabel());
  }

  Future<void> _resolveSavedLabel(Place target) async {
    final origin = api.origin, lang = _labelLanguage;
    try {
      final label = (await _fetchLabel(target, lang)).label;
      if (label == null ||
          _disposed ||
          origin != api.origin ||
          lang != _labelLanguage ||
          !saved.any((p) => p.isCoordinate && p.key == target.key)) {
        return;
      }
      _renameSaved(target, label, lang);
      emit();
    } catch (_) {
      /* 收藏保留已知区域或坐标。 */
    }
  }

  Future<void> refreshSummaries({bool force = false}) async {
    final requested = ++_summaryRequest;
    final targets = saved
        .where(
          (p) =>
              p.key != place.key &&
              (force ||
                  !summaries.containsKey(p.key) ||
                  (DateTime.now().millisecondsSinceEpoch -
                          ((summaries[p.key]?['savedAt'] as int?) ?? 0)) >
                      lifetime.inMilliseconds),
        )
        .toList();
    summaryFailed = false;
    if (targets.isEmpty) {
      if (!_disposed) summariesUpdated.value++;
      return;
    }
    try {
      final all = <String, Json>{};
      for (var i = 0; i < targets.length; i += 20) {
        final slice = targets.skip(i).take(20).toList();
        all.addAll(await api.summaries(slice));
        if (requested != _summaryRequest || _disposed) return;
      }
      for (final item in all.entries) {
        summaries[item.key] = {
          ...item.value,
          'savedAt': DateTime.now().millisecondsSinceEpoch,
        };
      }
      summaryFailed = targets.any((p) => !all.containsKey(p.key));
    } catch (_) {
      if (requested != _summaryRequest || _disposed) return;
      summaryFailed = true;
    }
    if (!_disposed) summariesUpdated.value++;
  }

  Future<void> select(Place p, {bool gps = false}) async {
    _intent++;
    _cancelLabelLookup();
    locating = false;
    locationMessage = null;
    place = p.withReverseLabel(p.label, _labelLanguage);
    forecast = null;
    failed = false;
    unawaited(prefs.setString('place', jsonEncode(place.toJson())));
    unawaited(prefs.setString('mode', gps ? 'gps' : 'manual'));
    final loading = load();
    if (place.isCoordinate) unawaited(_resolveLabel(place));
    unawaited(refreshSummaries());
    await loading;
  }

  Future<void> locate({bool ask = true}) async {
    final request = ++_intent;
    void issue(String key) {
      if (request != _intent || _disposed) return;
      locating = false;
      if (ask || prefs.getString('mode') == 'gps') locationMessage = key;
      emit();
    }

    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        issue('gpsOff');
        return;
      }
      if (request != _intent || _disposed) return;
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied && ask) {
        permission = await Geolocator.requestPermission();
      }
      if (request != _intent || _disposed) return;
      if (permission != LocationPermission.whileInUse &&
          permission != LocationPermission.always) {
        issue(
          permission == LocationPermission.deniedForever
              ? 'deniedForever'
              : 'denied',
        );
        return;
      }
      locating = true;
      locationMessage = null;
      emit();
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.low,
          timeLimit: Duration(seconds: 10),
        ),
      );
      if (request != _intent || _disposed) return;
      await select(
        Place('gps', '', '', '', pos.latitude, pos.longitude),
        gps: true,
      );
    } on TimeoutException {
      issue('gpsTimeout');
    } on LocationServiceDisabledException {
      issue('gpsOff');
    } on PermissionDeniedException {
      issue('denied');
    } catch (_) {
      issue('gpsFail');
    }
  }

  Forecast? _readCache(String key) {
    final value = _cache[key];
    if (value != null) return value;
    try {
      final raw = prefs.getString(_storageKey(key));
      if (raw == null) return null;
      return _cache[key] = Forecast.fromJson(jsonDecode(raw) as Json);
    } catch (_) {
      return null;
    }
  }

  Future<void> _persist(String key, Forecast value) async {
    _cache[key] = value;
    // Keep a bounded number of city snapshots, shared by foreground and offline reads.
    final order =
        prefs.getStringList('forecastKeys.${api.origin}')?.toList() ?? [];
    order.remove(key);
    order.add(key);
    while (order.length > 15) {
      final old = order.removeAt(0);
      _cache.remove(old);
      unawaited(prefs.remove(_storageKey(old)));
    }
    await Future.wait([
      prefs.setStringList('forecastKeys.${api.origin}', order),
      prefs.setString(_storageKey(key), jsonEncode(value.raw)),
    ]);
  }

  Future<void> acceptRefreshed(Place city, Forecast value) async {
    if (_disposed || city.key != place.key) return;
    final token = ++_load;
    await _persist(city.key, value);
    if (_disposed || token != _load || city.key != place.key) return;
    forecast = value;
    failed = value.stale;
    weatherMessage = value.stale ? 'weatherUpstream' : null;
    refreshing = false;
    emit();
  }

  Future<void> load({bool force = false}) async {
    final token = ++_load;
    final origin = api.origin;
    final city = place;
    final key = city.key;
    final cached = _readCache(key);
    forecast = cached;
    failed = false;
    weatherMessage = null;
    if (!force &&
        cached != null &&
        !cached.stale &&
        DateTime.now().difference(cached.fetchedAt) < lifetime) {
      refreshing = false;
      emit();
      return;
    }
    refreshing = true;
    emit();
    try {
      final future = _inflight.putIfAbsent(key, () => api.weather(city));
      final Forecast result;
      try {
        result = await future;
      } finally {
        if (identical(_inflight[key], future)) _inflight.remove(key);
      }
      if (_disposed || api.origin != origin) return;
      await _persist(key, result);
      if (_disposed || token != _load) return;
      forecast = result;
      failed = result.stale;
      weatherMessage = result.stale ? 'weatherUpstream' : null;
    } catch (error) {
      if (_disposed || token != _load) return;
      failed = true;
      weatherMessage = error is TimeoutException
          ? 'weatherTimeout'
          : error is http.ClientException
          ? 'weatherConnection'
          : error is RequestFailure
          ? 'weatherServer'
          : 'weatherInvalid';
    }
    refreshing = false;
    emit();
  }
}
