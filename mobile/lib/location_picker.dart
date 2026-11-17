import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:http/http.dart' as http;
import 'data.dart';
import 'locale.dart';

class LocationPicker extends StatefulWidget {
  final WeatherApi api;
  final Words w;
  final Place initial;
  final http.Client? tileClient;
  const LocationPicker({
    super.key,
    required this.api,
    required this.w,
    required this.initial,
    this.tileClient,
  });
  @override
  State<LocationPicker> createState() => _LocationPickerState();
}

class _LocationPickerState extends State<LocationPicker> {
  final input = TextEditingController();
  final focus = FocusNode();
  final map = MapController();
  Timer? debounce;
  int request = 0;
  bool loading = false, failed = false, showMap = false, tileFailed = false;
  int tileAttempt = 0;
  String last = '';
  late Words words;
  List<Place> results = [];
  Place? point;
  @override
  void initState() {
    super.initState();
    words = widget.w;
    input.addListener(changed);
  }

  @override
  void dispose() {
    request++;
    debounce?.cancel();
    input.dispose();
    focus.dispose();
    map.dispose();
    super.dispose();
  }

  void changed() {
    if (input.value.composing.isValid && !input.value.composing.isCollapsed) {
      return;
    }
    final q = input.text.trim();
    if (q == last) return;
    last = q;
    final id = ++request;
    debounce?.cancel();
    setState(() {
      results = [];
      failed = false;
      loading = q.runes.length >= 2;
    });
    if (loading) {
      debounce = Timer(const Duration(milliseconds: 280), () => find(q, id));
    }
  }

  Future<void> find(String q, int id) async {
    try {
      final list = await widget.api.search(q, words.language);
      if (!mounted || request != id) return;
      setState(() {
        results = list;
        loading = false;
      });
    } catch (_) {
      if (!mounted || id != request) return;
      setState(() {
        failed = true;
        loading = false;
      });
    }
  }

  void pick(Place next) {
    if (!showMap) {
      Navigator.pop(context, next);
      return;
    }
    input.clear();
    focus.unfocus();
    setState(() => point = next);
    map.move(LatLng(next.lat, next.lon), 10);
  }

  @override
  Widget build(BuildContext context) {
    final w = words;
    final p = point ?? widget.initial;
    final choices = input.text.trim().isEmpty ? defaultCities : results;
    const urls = {
      'en': String.fromEnvironment('TILES_EN'),
      'ko': String.fromEnvironment('TILES_KO'),
      'zh-Hans': String.fromEnvironment('TILES_ZH_HANS'),
      'zh-Hant': String.fromEnvironment('TILES_ZH_HANT'),
    };
    final custom = urls[w.language];
    final tiles = custom == null || custom.isEmpty
        ? '${widget.api.origin}/api/map-tiles/{z}/{x}/{y}'
        : custom;
    const extraAttribution = String.fromEnvironment('TILES_ATTRIBUTION');
    return Scaffold(
      appBar: AppBar(
        title: Text(w('choose')),
        actions: [
          IconButton(
            tooltip: w(showMap ? 'search' : 'map'),
            icon: Icon(showMap ? Icons.list : Icons.map_outlined),
            onPressed: () {
              focus.unfocus();
              setState(() {
                showMap = !showMap;
                tileFailed = false;
              });
            },
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              child: TextField(
                controller: input,
                focusNode: focus,
                autofocus: !showMap,
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search),
                  hintText: w('search'),
                  suffixIcon: input.text.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.close),
                          onPressed: input.clear,
                        ),
                ),
              ),
            ),
            if (loading) const LinearProgressIndicator(),
            if (input.text.trim().isNotEmpty || !showMap)
              Flexible(
                flex: showMap ? 1 : 4,
                child: failed
                    ? Center(
                        child: TextButton(
                          onPressed: () {
                            setState(() {
                              loading = true;
                              failed = false;
                            });
                            find(last, ++request);
                          },
                          child: Text('${w('searchFail')}  ${w('retry')}'),
                        ),
                      )
                    : choices.isEmpty
                    ? Center(
                        child: Text(
                          loading
                              ? '…'
                              : w(
                                  input.text.trim().runes.length < 2
                                      ? 'citiesHint'
                                      : 'none',
                                ),
                        ),
                      )
                    : ListView.separated(
                        itemCount: choices.length,
                        separatorBuilder: (_, _) => const Divider(height: 1),
                        itemBuilder: (_, i) {
                          final item = choices[i];
                          return ListTile(
                            title: Text(w.city(item.id, item.name)),
                            subtitle: Text(item.context),
                            trailing: const Icon(Icons.north_west, size: 18),
                            onTap: () => pick(item),
                          );
                        },
                      ),
              ),
            if (showMap)
              Expanded(
                flex: 3,
                child: FlutterMap(
                  mapController: map,
                  options: MapOptions(
                    initialCenter: LatLng(p.lat, p.lon),
                    initialZoom: 7,
                    onTap: (_, pt) {
                      focus.unfocus();
                      final lon = ((pt.longitude + 180) % 360) - 180;
                      setState(
                        () => point = Place(
                          'point',
                          '',
                          '',
                          '',
                          pt.latitude,
                          lon,
                        ),
                      );
                    },
                  ),
                  children: [
                    TileLayer(
                      key: ValueKey('$tiles:$tileAttempt'),
                      urlTemplate: tiles,
                      tileProvider: widget.tileClient == null
                          ? null
                          : NetworkTileProvider(httpClient: widget.tileClient),
                      userAgentPackageName: 'dev.weatheratlas.weather_atlas',
                      maxNativeZoom: 19,
                      panBuffer: 0,
                      errorTileCallback: (_, _, _) {
                        if (mounted && !tileFailed) {
                          setState(() => tileFailed = true);
                        }
                      },
                    ),
                    MarkerLayer(
                      markers: [
                        Marker(
                          point: LatLng(p.lat, p.lon),
                          width: 46,
                          height: 46,
                          alignment: Alignment.topCenter,
                          child: const Icon(
                            Icons.location_on,
                            size: 44,
                            color: Color(0xffbc502f),
                          ),
                        ),
                      ],
                    ),
                    SimpleAttributionWidget(
                      source: Text(
                        [
                          'OpenStreetMap contributors',
                          if (custom != null &&
                              custom.isNotEmpty &&
                              extraAttribution.isNotEmpty)
                            extraAttribution,
                        ].join(' · '),
                      ),
                      onTap: () => launchUrl(
                        Uri.parse('https://www.openstreetmap.org/copyright'),
                      ),
                    ),
                  ],
                ),
              ),
            if (showMap)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (p.name.isNotEmpty) Text(w.city(p.id, p.name)),
                    Text(
                      '${p.lat.toStringAsFixed(3)}, ${p.lon.toStringAsFixed(3)}',
                    ),
                    const SizedBox(height: 12),
                    if (tileFailed)
                      TextButton(
                        onPressed: () => setState(() {
                          tileAttempt++;
                          tileFailed = false;
                        }),
                        child: Text('${w('mapTileError')} ${w('retry')}'),
                      ),
                    FilledButton(
                      onPressed: () => Navigator.pop(context, p),
                      child: Text(w('confirm')),
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
