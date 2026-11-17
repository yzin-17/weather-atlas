import 'package:flutter/material.dart';

IconData skySymbol(int? code) => switch (code ?? -1) {
  0 => Icons.wb_sunny_outlined,
  1 || 2 => Icons.wb_cloudy_outlined,
  3 => Icons.cloud_outlined,
  45 || 48 => Icons.foggy,
  >= 71 && <= 77 || 85 || 86 => Icons.ac_unit,
  >= 95 => Icons.thunderstorm_outlined,
  >= 51 => Icons.grain,
  _ => Icons.cloud_outlined,
};
