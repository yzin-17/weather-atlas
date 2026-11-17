import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/data/latest.dart' as zones;
import 'package:url_launcher/url_launcher.dart';
import 'controller.dart';
import 'data.dart';
import 'locale.dart';
import 'location_picker.dart';
import 'questions.dart';
import 'weather_chat.dart';
import 'weather_ask_button.dart';
import 'weather_icon.dart';

const ink = Color(0xff193c3c),
    accent = Color(0xffa34328),
    paper = Color(0xfff6f5ef),
    line = Color(0xffdbded5);
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  zones.initializeTimeZones();
  final prefs = await SharedPreferences.getInstance();
  const configured = String.fromEnvironment('WEATHER_API_BASE');
  final origin = configured.isNotEmpty
      ? configured
      : defaultTargetPlatform == TargetPlatform.android
      ? 'http://10.0.2.2:3000'
      : 'http://127.0.0.1:3000';
  final controller = WeatherController(
    WeatherApi(prefs.getString('origin') ?? origin),
    prefs,
  );
  runApp(Atlas(controller: controller));
  unawaited(controller.restore());
}

class Atlas extends StatelessWidget {
  final WeatherController controller;
  const Atlas({super.key, required this.controller});
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: controller.language,
    builder: (context, child) => MaterialApp(
      title: 'Weather Atlas',
      debugShowCheckedModeBanner: false,
      supportedLocales: supportedLocales,
      locale: controller.locale == null ? null : asLocale(controller.locale!),
      localeListResolutionCallback: (preferred, supported) =>
          controller.locale == null
          ? asLocale(
              resolveLanguage(preferred?.firstOrNull ?? const Locale('en')),
            )
          : asLocale(controller.locale!),
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: paper,
        colorScheme: ColorScheme.fromSeed(
          seedColor: ink,
          primary: ink,
          surface: paper,
          secondary: accent,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: paper,
          foregroundColor: ink,
          surfaceTintColor: Colors.transparent,
        ),
        dividerTheme: const DividerThemeData(color: line),
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(),
          isDense: true,
        ),
      ),
      home: ListenableBuilder(
        listenable: controller,
        builder: (context, _) => Dashboard(controller: controller),
      ),
    ),
  );
}

class Dashboard extends StatefulWidget {
  final WeatherController controller;
  const Dashboard({super.key, required this.controller});
  @override
  State<Dashboard> createState() => _DashboardState();
}

class _DashboardState extends State<Dashboard> with WidgetsBindingObserver {
  final ScrollController hours = ScrollController();
  final hourAnchor = GlobalKey();
  String? visibleCity;
  int? highlighted;
  WeatherChat? weatherChat;
  String? weatherChatKey;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) widget.controller.resumeCityLabel();
  }

  @override
  void didChangeLocales(List<Locale>? locales) {
    if (widget.controller.locale == null) widget.controller.changeLocale(null);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    weatherChat?.dispose();
    hours.dispose();
    super.dispose();
  }

  Future<void> configure(Words w) async {
    final c = widget.controller;
    final selected = await showDialog<String>(
      context: context,
      builder: (_) => EndpointDialog(w: w, origin: c.api.origin),
    );
    if (selected != null && mounted) await c.changeOrigin(selected);
  }

  Future<void> pick(Words w, {bool save = false}) async {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    final c = widget.controller;
    final p = await Navigator.push<Place>(
      context,
      MaterialPageRoute(
        builder: (_) => LocationPicker(api: c.api, w: w, initial: c.place),
      ),
    );
    if (p == null || !mounted) return;
    if (save) {
      if (!c.saved.any((city) => city.key == p.key)) c.toggleSave(p);
    } else {
      await c.select(p);
    }
  }

  Future<void> ask(Words w, Forecast weather) async {
    final c = widget.controller;
    final city = c.place, key = c.place.key;
    final sessionKey = '${c.api.origin}|$key|${w.language}';
    if (weatherChatKey != sessionKey) {
      weatherChat?.dispose();
      weatherChatKey = sessionKey;
      weatherChat = WeatherChat(
        api: c.api,
        city: city,
        forecast: weather,
        language: w.language,
        onRefreshed: (f) => c.acceptRefreshed(city, f),
      );
    }
    weatherChat!.forecast = weather;
    final time = await Navigator.push<int>(
      context,
      MaterialPageRoute(
        builder: (_) => QuestionPage(
          api: c.api,
          city: city,
          forecast: weather,
          w: w,
          session: weatherChat,
        ),
      ),
    );
    final evidenceWeather = weatherChat!.forecast;
    if (time == null ||
        !mounted ||
        key != c.place.key ||
        evidenceWeather.version != c.forecast?.version) {
      return;
    }
    final idx = evidenceWeather.hours.indexWhere((v) => v.time == time);
    if (idx < 0 || hourAnchor.currentContext == null) return;
    setState(() => highlighted = time);
    await Scrollable.ensureVisible(
      hourAnchor.currentContext!,
      alignment: 0.12,
      duration: const Duration(milliseconds: 260),
    );
    if (mounted && hours.hasClients) {
      await hours.animateTo(
        (idx * 82.0).clamp(0.0, hours.position.maxScrollExtent),
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller, p = c.place, f = c.forecast;
    final w = Words(resolveLanguage(Localizations.localeOf(context)));
    final texts = Theme.of(context).textTheme;
    final isSaved = c.saved.any((s) => s.key == p.key);
    if (visibleCity != p.key) {
      visibleCity = p.key;
      highlighted = null;
      if (hours.hasClients) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted && hours.hasClients) hours.jumpTo(0);
        });
      }
    }
    return Scaffold(
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
      floatingActionButton: f == null
          ? null
          : WeatherAskButton(
              key: const ValueKey('weather-ask-launcher'),
              label: w('askShort'),
              tooltip: w('ask'),
              onPressed: () => ask(w, f),
            ),
      appBar: AppBar(
        title: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.explore_outlined, size: 24),
            SizedBox(width: 8),
            Flexible(
              child: Text(
                'Weather Atlas',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  letterSpacing: -0.8,
                ),
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            onPressed: () => pick(w),
            icon: const Icon(Icons.search),
            tooltip: w('search'),
          ),
          PopupMenuButton<String>(
            tooltip: w('language'),
            icon: const Icon(Icons.translate),
            initialValue: c.locale ?? 'system',
            onSelected: (lang) {
              if (lang == 'server') {
                configure(w);
              } else {
                c.changeLocale(lang == 'system' ? null : lang);
              }
            },
            itemBuilder: (context) => [
              PopupMenuItem(value: 'system', child: Text(w('system'))),
              for (final e in languageNames.entries)
                PopupMenuItem(value: e.key, child: Text(e.value)),
              const PopupMenuDivider(),
              PopupMenuItem(value: 'server', child: Text(w('server'))),
            ],
          ),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => Future.wait([
            c.load(force: true),
            c.refreshSummaries(force: true),
          ]),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 104),
            children: [
              Wrap(
                alignment: WrapAlignment.spaceBetween,
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: 12,
                children: [
                  TextButton.icon(
                    style: TextButton.styleFrom(padding: EdgeInsets.zero),
                    onPressed: c.locating ? null : () => c.locate(),
                    icon: const Icon(Icons.my_location, size: 16),
                    label: Text(w(c.locating ? 'locating' : 'locate')),
                  ),
                  IconButton(
                    icon: const Icon(Icons.link),
                    tooltip: w('copyLink'),
                    onPressed: () async {
                      const publicOrigin = String.fromEnvironment(
                        'WEATHER_SITE_URL',
                      );
                      final url = cityLink(
                        publicOrigin.isEmpty ? c.api.origin : publicOrigin,
                        Place(
                          p.id,
                          w.city(p.id, p.name),
                          p.region,
                          p.country,
                          p.lat,
                          p.lon,
                          label: p.label,
                        ),
                        w.language,
                      );
                      await Clipboard.setData(
                        ClipboardData(text: url.toString()),
                      );
                      if (context.mounted) {
                        ScaffoldMessenger.of(context)
                          ..hideCurrentSnackBar()
                          ..showSnackBar(
                            SnackBar(
                              content: Text(w('linkCopied')),
                              duration: const Duration(seconds: 2),
                            ),
                          );
                      }
                    },
                  ),
                  IconButton(
                    icon: Icon(
                      isSaved ? Icons.bookmark : Icons.bookmark_outline,
                    ),
                    tooltip: w(isSaved ? 'remove' : 'save'),
                    onPressed: () => c.toggleSave(p),
                  ),
                ],
              ),
              if (c.locationMessage != null)
                Text(
                  w(c.locationMessage!),
                  style: const TextStyle(color: accent),
                ),
              DecoratedBox(
                decoration: BoxDecoration(
                  color: ink,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(22, 22, 22, 19),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Semantics(
                        liveRegion: true,
                        child: Text(
                          c.resolvingCity &&
                                  !c.cityLookupFailed &&
                                  p.label == null
                              ? w('resolvingCity')
                              : w.city(p.id, p.name),
                          key: const ValueKey('city-name'),
                          style: const TextStyle(
                            fontSize: 36,
                            letterSpacing: -1.5,
                            height: 1.2,
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      if (p.isCoordinate && c.cityLookupFailed)
                        Align(
                          alignment: Alignment.centerLeft,
                          child: FilledButton.tonalIcon(
                            key: const ValueKey('retry-city'),
                            onPressed: c.resolvingCity
                                ? null
                                : c.retryCityLabel,
                            icon: c.resolvingCity
                                ? const SizedBox.square(
                                    dimension: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Icon(Icons.refresh, size: 18),
                            label: Text(
                              w(
                                c.resolvingCity ? 'resolvingCity' : 'retryCity',
                              ),
                            ),
                          ),
                        ),
                      if (p.context.isNotEmpty)
                        Text(
                          p.context,
                          style: const TextStyle(color: Color(0xffc4d6cc)),
                        ),
                      if (f != null) ...[
                        const SizedBox(height: 16),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            Expanded(
                              child: FittedBox(
                                fit: BoxFit.scaleDown,
                                alignment: Alignment.centerLeft,
                                child: Text(
                                  '${temp(f.current.temp)}C',
                                  style: const TextStyle(
                                    fontSize: 72,
                                    letterSpacing: -4,
                                    color: Colors.white,
                                    height: 1,
                                  ),
                                ),
                              ),
                            ),
                            Icon(
                              skySymbol(f.current.code),
                              color: const Color(0xffffcb87),
                              size: 50,
                            ),
                          ],
                        ),
                        Text(
                          w.condition(f.current.code),
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 19,
                          ),
                        ),
                        const Divider(height: 30, color: Color(0xff53706a)),
                        Text(
                          '${w('local')}  ${hh(f.local(f.current.time))}  ·  ${f.timezone}',
                          style: const TextStyle(color: Color(0xffe1e8db)),
                        ),
                        if (f.source == 'demo' || f.source == 'fixture')
                          Text(
                            w('demo'),
                            style: const TextStyle(color: Color(0xffffcb87)),
                          ),
                      ],
                      if (f == null) ...[
                        const SizedBox(height: 22),
                        if (c.refreshing)
                          Semantics(
                            liveRegion: true,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Text(
                                  w('loadingWeather'),
                                  style: const TextStyle(color: Colors.white),
                                ),
                                const SizedBox(height: 20),
                                const LinearProgressIndicator(),
                                const SizedBox(height: 90),
                              ],
                            ),
                          )
                        else if (c.failed)
                          Text(
                            w(c.weatherMessage ?? 'weatherFail'),
                            style: const TextStyle(color: Colors.white),
                          ),
                      ],
                    ],
                  ),
                ),
              ),
              if (c.refreshing && f != null) const LinearProgressIndicator(),
              if (c.failed || f?.stale == true)
                Row(
                  children: [
                    if (f != null)
                      Expanded(
                        child: Text(
                          [
                            w('stale'),
                            if (c.weatherMessage != null) w(c.weatherMessage!),
                          ].join('\n'),
                          style: const TextStyle(color: accent),
                        ),
                      ),
                    TextButton(
                      onPressed: () => c.load(force: true),
                      child: Text(w('retry')),
                    ),
                  ],
                ),
              if (f != null) ...[
                Align(
                  alignment: AlignmentDirectional.centerEnd,
                  child: Text(
                    '${w('updated')} ${ymd(f.local(f.fetchedAt.millisecondsSinceEpoch ~/ 1000))} ${hh(f.local(f.fetchedAt.millisecondsSinceEpoch ~/ 1000))}',
                    style: texts.bodySmall,
                  ),
                ),
                KeyedSubtree(key: hourAnchor, child: _heading(w('hourly'))),
                SizedBox(
                  height: 108,
                  child: ListView.builder(
                    controller: hours,
                    scrollDirection: Axis.horizontal,
                    itemExtent: 82,
                    itemCount: f.hours.length,
                    itemBuilder: (_, i) {
                      final h = f.hours[i], d = f.local(h.time);
                      final color = h.time == highlighted
                          ? const Color(0xffffdfac)
                          : i == 0
                          ? const Color(0xffe0ece3)
                          : Colors.transparent;
                      return Container(
                        margin: const EdgeInsets.only(right: 5),
                        decoration: BoxDecoration(
                          color: color,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                          children: [
                            Text(
                              i == 0
                                  ? w('now')
                                  : d.hour == 0
                                  ? '${d.month}/${d.day}'
                                  : hh(d),
                              style: texts.labelMedium,
                            ),
                            Icon(skySymbol(h.code), size: 23, color: ink),
                            Text(temp(h.temp), style: texts.titleMedium),
                            Text(
                              h.rain == null ? '—' : '${h.rain!.round()}%',
                              style: const TextStyle(
                                fontSize: 11,
                                color: Color(0xff3d697c),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),

                _heading(w('week')),
                for (final d in f.days)
                  DecoratedBox(
                    decoration: const BoxDecoration(
                      border: Border(bottom: BorderSide(color: line)),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 11),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              _day(context, w, d.date, f),
                              style: texts.titleSmall,
                            ),
                          ),
                          Expanded(
                            child: Row(
                              children: [
                                Icon(skySymbol(d.code), size: 19, color: ink),
                                const SizedBox(width: 5),
                                Flexible(
                                  child: Text(
                                    w.condition(d.code),
                                    overflow: TextOverflow.ellipsis,
                                    style: texts.bodySmall,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          SizedBox(
                            width: 42,
                            child: Text(
                              temp(d.min),
                              textAlign: TextAlign.end,
                              style: const TextStyle(color: Color(0xff54706b)),
                            ),
                          ),
                          const SizedBox(width: 6),
                          _DayRange(week: f, day: d),
                          SizedBox(
                            width: 42,
                            child: Text(
                              temp(d.max),
                              textAlign: TextAlign.end,
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
              Row(
                children: [
                  Expanded(child: _heading(w('places'))),
                  IconButton.outlined(
                    tooltip: w('add'),
                    onPressed: () => pick(w, save: true),
                    icon: const Icon(Icons.add, size: 18),
                  ),
                ],
              ),
              ListenableBuilder(
                listenable: c.summariesUpdated,
                builder: (context, _) => Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (c.saved.isEmpty)
                      Text(w('empty'), style: texts.bodyMedium),
                    for (final city in c.saved)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        onTap: () => c.select(city),
                        title: Text(w.city(city.id, city.name)),
                        subtitle: city.context.isEmpty
                            ? null
                            : Text(city.context),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              skySymbol(
                                city.key == p.key
                                    ? f?.current.code
                                    : (c.summaries[city.key]?['code'] as num?)
                                          ?.toInt(),
                              ),
                              size: 17,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              temp(
                                city.key == p.key
                                    ? f?.current.temp
                                    : c.summaries[city.key]?['temp'] as num?,
                              ),
                              style: texts.titleMedium,
                            ),
                            IconButton(
                              tooltip: w('remove'),
                              icon: const Icon(Icons.close, size: 17),
                              onPressed: () => c.toggleSave(city),
                            ),
                          ],
                        ),
                      ),
                    if (c.summaryFailed)
                      TextButton(
                        onPressed: () => c.refreshSummaries(force: true),
                        child: Text(w('retry')),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              const Divider(),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton.icon(
                  onPressed: () =>
                      launchUrl(Uri.parse('https://open-meteo.com/')),
                  icon: const Icon(Icons.open_in_new, size: 15),
                  label: Text('${w('data')} · Open-Meteo'),
                ),
              ),
              if (p.label?['source'] == 'photon-osm')
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: TextButton(
                    onPressed: () => launchUrl(
                      Uri.parse('https://www.openstreetmap.org/copyright'),
                    ),
                    child: const Text('© OpenStreetMap contributors'),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _heading(String text) => Padding(
    padding: const EdgeInsets.only(top: 22, bottom: 14),
    child: Text(
      text,
      style: const TextStyle(
        color: ink,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.7,
        fontSize: 22,
      ),
    ),
  );
  String _day(BuildContext context, Words w, String date, Forecast f) {
    if (date == ymd(f.local(f.current.time))) return w('today');
    final d = DateTime.parse(date);
    return MaterialLocalizations.of(context).formatShortDate(d);
  }
}

class EndpointDialog extends StatefulWidget {
  final Words w;
  final String origin;
  const EndpointDialog({super.key, required this.w, required this.origin});
  @override
  State<EndpointDialog> createState() => _EndpointDialogState();
}

class _EndpointDialogState extends State<EndpointDialog> {
  late final input = TextEditingController(text: widget.origin);
  bool invalid = false;
  @override
  void dispose() {
    input.dispose();
    super.dispose();
  }

  void save() {
    final uri = Uri.tryParse(input.text.trim());
    if (uri == null ||
        !{'https', 'http'}.contains(uri.scheme) ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment ||
        (uri.path.isNotEmpty && uri.path != '/')) {
      setState(() => invalid = true);
      return;
    }
    Navigator.pop(context, uri.origin);
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.w('server')),
    content: TextField(
      controller: input,
      keyboardType: TextInputType.url,
      autocorrect: false,
      decoration: InputDecoration(
        hintText: 'https://weather.example.com',
        errorText: invalid ? widget.w('badUrl') : null,
      ),
      onSubmitted: (_) => save(),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: Text(MaterialLocalizations.of(context).cancelButtonLabel),
      ),
      FilledButton(onPressed: save, child: Text(widget.w('connect'))),
    ],
  );
}

class _DayRange extends StatelessWidget {
  final Forecast week;
  final ForecastDay day;
  const _DayRange({required this.week, required this.day});
  @override
  Widget build(BuildContext context) {
    final low = day.min, high = day.max;
    if (low == null || high == null) return const SizedBox(width: 44);
    final span = week.weeklyMaximum - week.weeklyMinimum;
    final left = span == 0 ? 0.0 : 44 * (low - week.weeklyMinimum) / span;
    final width = span == 0
        ? 44.0
        : (44 * (high - low) / span).clamp(2.0, 44.0);
    return SizedBox(
      width: 44,
      height: 5,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: line,
          borderRadius: BorderRadius.circular(4),
        ),
        child: Stack(
          children: [
            Positioned(
              left: left.clamp(0, 44 - width).toDouble(),
              width: width.toDouble(),
              height: 5,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: const Color(0xffce8056),
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
