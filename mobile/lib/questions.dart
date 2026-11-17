import 'package:ai_ui_stream/ai_ui_stream.dart';
import 'package:flutter/material.dart';
import 'data.dart';
import 'locale.dart';
import 'weather_chat.dart';

class QuestionPage extends StatefulWidget {
  final WeatherApi api;
  final Place city;
  final Forecast forecast;
  final Words w;
  final WeatherChat? session;
  final Future<void> Function(Forecast)? onRefreshed;
  const QuestionPage({
    super.key,
    required this.api,
    required this.city,
    required this.forecast,
    required this.w,
    this.session,
    this.onRefreshed,
  });
  @override
  State<QuestionPage> createState() => _QuestionPageState();
}

class _QuestionPageState extends State<QuestionPage> {
  final input = TextEditingController();
  final scroll = ScrollController();
  late final WeatherChat conversation;
  bool follow = true;

  @override
  void initState() {
    super.initState();
    conversation =
        widget.session ??
        WeatherChat(
          api: widget.api,
          city: widget.city,
          forecast: widget.forecast,
          language: widget.w.language,
          onRefreshed: widget.onRefreshed,
        );
    conversation.addListener(changed);
    scroll.addListener(() {
      follow = !scroll.hasClients || scroll.position.extentAfter < 100;
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    conversation.setReducedMotion(MediaQuery.disableAnimationsOf(context));
  }

  void changed() {
    if (!mounted) return;
    setState(() {});
    if (follow) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && scroll.hasClients) {
          scroll.jumpTo(scroll.position.maxScrollExtent);
        }
      });
    }
  }

  @override
  void dispose() {
    conversation.removeListener(changed);
    if (widget.session == null) {
      conversation.dispose();
    } else if (conversation.busy) {
      conversation.stop();
    }
    input.dispose();
    scroll.dispose();
    super.dispose();
  }

  Future<void> submit([String? preset]) async {
    final text = (preset ?? input.text).trim();
    if (conversation.busy || text.isEmpty) return;
    input.clear();
    follow = true;
    FocusScope.of(context).unfocus();
    await conversation.send(text);
  }

  Future<void> retry() async {
    if (conversation.busy) return;
    follow = true;
    if (conversation.error == 'changed') {
      await conversation.refreshAndRetry();
    } else {
      await conversation.retry();
    }
  }

  Json evidenceRow(Json data, Json evidence, Forecast origin) {
    final city = evidence['city'] as Json?;
    for (final row in (data['comparisons'] as List? ?? []).cast<Json>()) {
      final place = row['city'] as Json;
      if (city != null &&
          place['lat'] == city['lat'] &&
          place['lon'] == city['lon']) {
        return row;
      }
    }
    final single = data['singleForecast'] as Json?;
    return {
      'city':
          single?['city'] ??
          {
            ...widget.city.toJson(),
            'name': widget.w.city(widget.city.id, widget.city.name),
          },
      'forecast': single?['forecast'] ?? origin.raw,
      'date': evidence['date'],
      'evidence': data['evidence'],
    };
  }

  void showEvidence(Json data, Json e, Forecast origin) {
    final time = (e['time'] as num).toInt();
    final row = evidenceRow(data, e, origin);
    final forecast = Forecast.fromJson(row['forecast'] as Json);
    if (Place.fromJson(row['city'] as Json).key == widget.city.key &&
        forecast.version == conversation.forecast.version &&
        forecast.hours.any((h) => h.time == time)) {
      Navigator.pop(context, time);
      return;
    }
    Navigator.push(
      context,
      MaterialPageRoute<void>(
        builder: (_) => ComparisonEvidencePage(
          row: {...row, 'date': row['date'] ?? ymd(forecast.local(time))},
          selectedTime: time,
          w: widget.w,
        ),
      ),
    );
  }

  Widget answer(UIMessage message) {
    final w = widget.w, data = conversation.result(message);
    final origin = conversation.snapshotFor(message);
    return Padding(
      padding: const EdgeInsets.only(top: 24, bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            w(data?['source'] == 'rules' ? 'rules' : 'model'),
            style: Theme.of(context).textTheme.labelLarge,
          ),
          const SizedBox(height: 10),
          SelectableText(
            conversation.visible(message),
            key: ValueKey('answer-${message.id}'),
            style: Theme.of(context).textTheme.bodyLarge,
          ),
          if (data != null &&
              ((data['evidence'] as List).isNotEmpty ||
                  (data['dailyEvidence'] as List? ?? []).isNotEmpty)) ...[
            const Divider(height: 32),
            Text(w('evidence')),
            for (final day
                in (data['dailyEvidence'] as List? ?? []).cast<Json>())
              ListTile(
                contentPadding: EdgeInsets.zero,
                key: ValueKey('day-evidence-${message.id}-${day['date']}'),
                title: Text(
                  '${(data['singleForecast'] as Json?)?['city']['name'] ?? w.city(widget.city.id, widget.city.name)} · ${day['date']}',
                ),
                subtitle: Text(
                  '${temp(day['min'] as num?)} – ${temp(day['max'] as num?)} · ${w.condition((day['code'] as num?)?.toInt())}',
                ),
                trailing: const Icon(Icons.arrow_forward, size: 18),
                onTap: () {
                  final row = evidenceRow(data, day, origin),
                      f = Forecast.fromJson(
                        evidenceRow(data, day, origin)['forecast'] as Json,
                      );
                  Navigator.push(
                    context,
                    MaterialPageRoute<void>(
                      builder: (_) => Scaffold(
                        appBar: AppBar(
                          title: Text(
                            '${(row['city'] as Json)['name']} · ${day['date']}',
                          ),
                        ),
                        body: Padding(
                          padding: const EdgeInsets.all(22),
                          child: Text(
                            '${f.timezone}\n${day['date']}\n${temp(day['min'] as num?)} – ${temp(day['max'] as num?)}\n${w.condition((day['code'] as num?)?.toInt())}\n${w('updated')} ${ymd(f.local(f.fetchedAt.millisecondsSinceEpoch ~/ 1000))} ${hh(f.local(f.fetchedAt.millisecondsSinceEpoch ~/ 1000))}',
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            for (final e in (data['evidence'] as List).cast<Json>())
              Builder(
                builder: (_) {
                  final row = evidenceRow(data, e, origin),
                      f = Forecast.fromJson(
                        evidenceRow(data, e, origin)['forecast'] as Json,
                      );
                  final time = (e['time'] as num).toInt();
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    key: ValueKey(
                      'hour-evidence-${e['timezone'] ?? f.timezone}-${e['time']}',
                    ),
                    title: Text(
                      '${(row['city'] as Json)['name']} · ${ymd(f.local(time))} ${hh(f.local(time))}',
                    ),
                    subtitle: Text(
                      '${temp(e['temp'] as num?)} · ${w('rain')} ${e['rain'] == null ? '—' : '${e['rain']}%'}${e['code'] is num ? ' · ${w.condition((e['code'] as num).toInt())}' : ''}',
                    ),
                    trailing: const Icon(Icons.arrow_forward, size: 18),
                    onTap: () => showEvidence(data, e, origin),
                  );
                },
              ),
          ],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final w = widget.w, c = conversation;
    return Scaffold(
      appBar: AppBar(title: Text(w('ask'))),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                controller: scroll,
                padding: const EdgeInsets.all(22),
                children: [
                  Text(
                    '${w.city(widget.city.id, widget.city.name)} · ${c.forecast.timezone}',
                  ),
                  Text(
                    '${w('updated')} ${hh(c.forecast.local(c.forecast.current.time))}',
                  ),
                  for (final message in c.messages)
                    if (message.role == MessageRole.user)
                      Align(
                        alignment: Alignment.centerRight,
                        child: Padding(
                          padding: const EdgeInsets.only(top: 24),
                          child: Container(
                            padding: const EdgeInsets.all(14),
                            color: Theme.of(
                              context,
                            ).colorScheme.secondaryContainer,
                            child: Text(messageText(message)),
                          ),
                        ),
                      )
                    else
                      answer(message),
                  if (c.messages.isEmpty) ...[
                    const SizedBox(height: 24),
                    for (final key in [
                      'umbrella',
                      'warm',
                      'weekQuestion',
                      'compare',
                    ])
                      ActionChip(
                        label: Text(w(key), softWrap: true, maxLines: 3),
                        onPressed: () => submit(w(key)),
                      ),
                  ],
                  if (c.busy) ...[
                    const SizedBox(height: 16),
                    const LinearProgressIndicator(),
                    Text(
                      w(
                        c.refreshing || c.phase == 'weather'
                            ? 'askWeather'
                            : c.phase == 'city'
                            ? 'askSearch'
                            : c.phase == 'model'
                            ? 'askModel'
                            : 'askDisplaying',
                      ),
                    ),
                  ],
                  if (c.error != null)
                    Text(
                      w(c.error!),
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  if (c.stopped) Text(w('askStopped')),
                  if (!c.busy && (c.error != null || c.stopped))
                    Align(
                      alignment: Alignment.centerLeft,
                      child: FilledButton.tonal(
                        key: const ValueKey('chat-retry'),
                        onPressed: retry,
                        child: Text(
                          w(c.error == 'changed' ? 'refreshAsk' : 'retry'),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(22, 8, 22, 12),
              child: Column(
                children: [
                  TextField(
                    key: const ValueKey('chat-input'),
                    controller: input,
                    maxLength: 400,
                    minLines: 1,
                    maxLines: 4,
                    decoration: InputDecoration(labelText: w('question')),
                  ),
                  Align(
                    alignment: Alignment.centerRight,
                    child: FilledButton.icon(
                      key: const ValueKey('chat-send'),
                      onPressed: c.refreshing
                          ? null
                          : c.busy
                          ? c.stop
                          : submit,
                      icon: Icon(c.busy ? Icons.stop : Icons.arrow_upward),
                      label: Text(w(c.busy ? 'askStop' : 'send')),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    w('askFootnote'),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ComparisonEvidencePage extends StatelessWidget {
  final Json row;
  final int selectedTime;
  final Words w;
  const ComparisonEvidencePage({
    super.key,
    required this.row,
    required this.selectedTime,
    required this.w,
  });
  @override
  Widget build(BuildContext context) {
    final city = row['city'] as Json,
        forecast = Forecast.fromJson(row['forecast'] as Json);
    final readings = (row['evidence'] as List).whereType<Json>().toList();
    return Scaffold(
      appBar: AppBar(title: Text('${city['name']} · ${w('evidence')}')),
      body: ListView.builder(
        padding: const EdgeInsets.all(20),
        itemCount: readings.length + 1,
        itemBuilder: (_, index) {
          if (index == 0) {
            return Text(
              '${forecast.timezone} · ${row['date']}\n${w('updated')} ${ymd(forecast.local(forecast.fetchedAt.millisecondsSinceEpoch ~/ 1000))} ${hh(forecast.local(forecast.fetchedAt.millisecondsSinceEpoch ~/ 1000))}',
            );
          }
          final h = readings[index - 1], time = (h['time'] as num).toInt();
          return ListTile(
            selected: time == selectedTime,
            contentPadding: EdgeInsets.zero,
            title: Text(
              '${ymd(forecast.local(time))} ${hh(forecast.local(time))}',
            ),
            subtitle: Text(
              '${temp(h['temp'] as num?)}C · ${w('rain')} ${h['rain'] == null ? '—' : '${h['rain']}%'}${h['code'] is num ? ' · ${w.condition((h['code'] as num).toInt())}' : ''}',
            ),
          );
        },
      ),
    );
  }
}
