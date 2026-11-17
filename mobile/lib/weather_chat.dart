import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'package:ai_ui_stream/ai_ui_stream.dart';
import 'package:ai_ui_stream/http.dart';
import 'package:characters/characters.dart';
import 'package:flutter/foundation.dart';
import 'data.dart';

String messageText(UIMessage message) =>
    message.parts.whereType<TextUIPart>().map((p) => p.text).join();

/// Adapts the shared weather contract without uploading the SDK transcript.
class WeatherChat extends ChangeNotifier {
  final WeatherApi api;
  final Place city;
  final String language;
  final Future<void> Function(Forecast)? onRefreshed;
  Forecast forecast;
  late final ChatController chat;
  late final StreamSubscription<ChatSnapshot> _snapshots;
  late final StreamSubscription<DataEvent> _data;
  final _visible = <String, String>{};
  final _frozen = <String>{};
  final _completed = <String>{};
  final _results = <String, Json>{};
  final _forecasts = <String, Forecast>{};
  Timer? _timer;
  Timer? _deadline;
  int _operation = 0;
  Json? comparisonContext, singleContext;
  String? error, phase;
  bool refreshing = false, _disposed = false, reducedMotion = false;
  bool stopped = false;

  WeatherChat({
    required this.api,
    required this.city,
    required this.forecast,
    required this.language,
    this.onRefreshed,
  }) {
    chat = ChatController(
      transport: _WeatherTransport(
        HttpChatTransport(
          endpoint: Uri.parse('${api.origin}/api/ask'),
          client: api.client,
          body: (request) => request.extraBody!,
        ),
      ),
      onError: (failure) => error = errorKey(failure),
      onFinish: _finish,
    );
    _snapshots = chat.snapshots.listen((_) => _update());
    _data = chat.dataEvents.listen((event) {
      if (event.type == 'data-phase' && event.data is Map) {
        phase = (event.data as Map)['phase'] as String?;
        _notify();
      }
    });
  }

  List<UIMessage> get messages => chat.messages;
  bool get revealing => messages.any(
    (m) =>
        m.role == MessageRole.assistant &&
        !_frozen.contains(m.id) &&
        visible(m) != messageText(m),
  );
  bool get busy => refreshing || chat.isBusy || revealing;
  String visible(UIMessage message) => _visible[message.id] ?? '';
  Forecast snapshotFor(UIMessage message) => _forecasts[message.id] ?? forecast;
  Json? result(UIMessage message) =>
      _completed.contains(message.id) &&
          !_frozen.contains(message.id) &&
          visible(message) == messageText(message)
      ? _results[message.id]
      : null;

  Json _body(String question) => {
    'question': question,
    'locale': language,
    'lat': city.lat,
    'lon': city.lon,
    'version': forecast.version,
    if (comparisonContext != null) 'context': comparisonContext,
    if (singleContext != null) 'singleContext': singleContext,
  };

  Future<void> send(String text) async {
    if (busy || text.trim().isEmpty) return;
    error = null;
    phase = 'weather';
    stopped = false;
    _startDeadline();
    await chat.sendText(text, extraBody: _body(text.trim()));
    _update();
  }

  Future<void> retry() async {
    if (busy || messages.isEmpty) return;
    final user = messages.where((m) => m.role == MessageRole.user).last;
    error = null;
    phase = 'weather';
    stopped = false;
    _startDeadline();
    await chat.regenerate(extraBody: _body(messageText(user)));
    _update();
  }

  Future<void> refreshAndRetry() async {
    if (busy) return;
    final operation = ++_operation;
    refreshing = true;
    error = null;
    _notify();
    try {
      final latest = await api.weather(city);
      if (_disposed || operation != _operation) return;
      forecast = latest;
      await onRefreshed?.call(forecast);
      final versions = <String, String>{city.key: forecast.version};
      Future<Json> refresh(Json data) async {
        final place = Place.fromJson(data);
        final version =
            versions[place.key] ?? (await api.weather(place)).version;
        versions[place.key] = version;
        return {...data, 'version': version};
      }

      if (comparisonContext != null) {
        final cities = <Json>[];
        for (final p in (comparisonContext!['cities'] as List).cast<Json>()) {
          cities.add(await refresh(p));
        }
        comparisonContext = {
          ...comparisonContext!,
          'cities': cities,
          'createdAt': DateTime.now().millisecondsSinceEpoch,
        };
      }
      if (singleContext != null) {
        singleContext = {
          ...singleContext!,
          'city': await refresh(singleContext!['city'] as Json),
          'createdAt': DateTime.now().millisecondsSinceEpoch,
        };
      }
      if (_disposed || operation != _operation) return;
      refreshing = false;
      await retry();
    } catch (_) {
      error = 'askFail';
    } finally {
      refreshing = false;
      _notify();
    }
  }

  void stop() {
    _operation++;
    _deadline?.cancel();
    for (final m in messages.where((m) => m.role == MessageRole.assistant)) {
      if (chat.isBusy && m == messages.last || visible(m) != messageText(m)) {
        _frozen.add(m.id);
      }
    }
    _timer?.cancel();
    _timer = null;
    stopped = true;
    phase = null;
    chat.stop();
    _notify();
  }

  void _finish(ChatFinishDetails finish) {
    _deadline?.cancel();
    phase = null;
    if (finish.isAbort || finish.isError) {
      _frozen.add(finish.message.id);
      _notify();
      return;
    }
    try {
      final parts = finish.message.parts.whereType<DataUIPart>().where(
        (p) => p.type == 'data-weather',
      );
      if (parts.length != 1 || parts.single.data is! Json) {
        throw const FormatException('Missing weather result');
      }
      final result = parts.single.data as Json;
      validateResult(result);
      if (result['version'] != forecast.version) {
        error = 'changed';
        _frozen.add(finish.message.id);
      } else {
        if (result['answer'] != messageText(finish.message)) {
          throw const FormatException('Weather text mismatch');
        }
        _results[finish.message.id] = result;
        _forecasts[finish.message.id] = forecast;
        _completed.add(finish.message.id);
        comparisonContext = result['context'] as Json?;
        singleContext = result['singleContext'] as Json?;
      }
    } catch (_) {
      error = 'askFail';
      _frozen.add(finish.message.id);
    }
    _update();
  }

  void setReducedMotion(bool value) {
    if (reducedMotion == value) return;
    reducedMotion = value;
    _update();
  }

  void _update() {
    if (_disposed) return;
    if (reducedMotion) {
      for (final m in messages.where((m) => m.role == MessageRole.assistant)) {
        if (!_frozen.contains(m.id)) _visible[m.id] = messageText(m);
      }
    }
    if (revealing && _timer == null) {
      _timer = Timer.periodic(const Duration(milliseconds: 24), (_) {
        for (final m in messages.where(
          (m) => m.role == MessageRole.assistant,
        )) {
          if (_frozen.contains(m.id)) continue;
          final full = messageText(m);
          if (visible(m) == full) continue;
          final text = full.characters;
          final shown = visible(m).characters.length;
          final count = math.min(
            text.length,
            shown + math.max(1, (text.length / 250).ceil()),
          );
          _visible[m.id] = text.take(count.toInt()).join();
        }
        if (!revealing) {
          _timer?.cancel();
          _timer = null;
        }
        _notify();
      });
    }
    _notify();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  void _startDeadline() {
    _deadline?.cancel();
    _deadline = Timer(const Duration(seconds: 45), () {
      if (!chat.isBusy || _disposed) return;
      stop();
      stopped = false;
      error = 'askFail';
      _notify();
    });
  }

  @override
  void dispose() {
    _disposed = true;
    _operation++;
    _deadline?.cancel();
    _timer?.cancel();
    unawaited(_snapshots.cancel());
    unawaited(_data.cancel());
    unawaited(chat.dispose());
    super.dispose();
  }
}

/// Read bounded HTTP errors before the SDK's protocol validation consumes them.
class _WeatherTransport extends ChatTransport {
  final HttpChatTransport delegate;
  _WeatherTransport(this.delegate);
  @override
  Future<ChatResponse> send(
    ChatRequest request, {
    required Future<void> abort,
  }) async {
    final response = await delegate
        .send(request, abort: abort)
        .timeout(const Duration(seconds: 45));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      String? code;
      final bytes = <int>[];
      await for (final chunk in response.body) {
        bytes.addAll(chunk);
        if (bytes.length > 8192) break;
      }
      try {
        code = (jsonDecode(utf8.decode(bytes)) as Json)['code'] as String?;
      } catch (_) {
        /* Non-JSON upstream errors remain generic. */
      }
      throw RequestFailure(response.statusCode, code);
    }
    return response;
  }

  @override
  void dispose() => delegate.dispose();
}

String errorKey(Object error) {
  int? status;
  String? code;
  if (error is RequestFailure) {
    status = error.status;
    code = error.code;
  }
  if (error is ChatProtocolException) status = error.statusCode;
  if (error is AiStreamException) {
    try {
      final data = jsonDecode(error.message) as Json;
      status = (data['status'] as num?)?.toInt();
      code = data['code'] as String?;
    } catch (_) {
      /* Do not expose server messages. */
    }
  }
  if (status == 409) return 'changed';
  if (status == 429) return 'limited';
  if (code == 'CITY_NOT_FOUND' || code == 'AMBIGUOUS_CITY') return 'askCity';
  return status == 400 ? 'askInput' : 'askFail';
}

void validateResult(Json data) {
  bool finite(dynamic n) => n is num && n.isFinite;
  bool evidence(dynamic row) =>
      row is Json &&
      finite(row['time']) &&
      (row['temp'] == null || finite(row['temp'])) &&
      (row['rain'] == null ||
          finite(row['rain']) && row['rain'] >= 0 && row['rain'] <= 100);
  void snapshot(dynamic raw) {
    if (raw is! Json) throw const FormatException('Invalid snapshot');
    final f = Forecast.fromJson(raw);
    f.local(f.current.time);
    if (f.version.isEmpty) throw const FormatException('Invalid version');
  }

  void place(dynamic raw) {
    if (raw is! Json ||
        raw['name'] is! String ||
        !finite(raw['lat']) ||
        !finite(raw['lon']) ||
        (raw['lat'] as num).abs() > 90 ||
        (raw['lon'] as num).abs() > 180) {
      throw const FormatException('Invalid city');
    }
  }

  if (data['answer'] is! String ||
      data['version'] is! String ||
      !['rules', 'model'].contains(data['source']) ||
      data['evidence'] is! List ||
      !(data['evidence'] as List).every(evidence)) {
    throw const FormatException('Invalid result');
  }
  if (data['context'] != null) {
    final c = data['context'];
    if (c is! Json ||
        c['cities'] is! List ||
        (c['cities'] as List).length != 2 ||
        c['plan'] is! Json ||
        c['origin'] is! String) {
      throw const FormatException('Invalid context');
    }
    for (final p in c['cities']) {
      place(p);
      if (p['version'] is! String) {
        throw const FormatException('Invalid version');
      }
    }
  }
  if (data['singleContext'] != null) {
    final c = data['singleContext'];
    if (c is! Json ||
        c['plan'] is! Json ||
        c['origin'] is! String ||
        !finite(c['dateAnchor'])) {
      throw const FormatException('Invalid single context');
    }
    place(c['city']);
    if (c['city']['version'] is! String) {
      throw const FormatException('Invalid version');
    }
  }
  if (data['singleForecast'] != null) {
    final row = data['singleForecast'] as Json;
    place(row['city']);
    snapshot(row['forecast']);
  }
  for (final row in (data['comparisons'] as List? ?? [])) {
    place(row['city']);
    if (row['forecast'] != null) snapshot(row['forecast']);
    if (row['evidence'] is! List ||
        !(row['evidence'] as List).every(evidence)) {
      throw const FormatException('Invalid comparison evidence');
    }
  }
  for (final row in (data['dailyEvidence'] as List? ?? [])) {
    if (row is! Json ||
        row['date'] is! String ||
        !finite(row['min']) ||
        !finite(row['max']) ||
        !finite(row['code'])) {
      throw const FormatException('Invalid daily evidence');
    }
  }
}
