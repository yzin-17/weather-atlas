import 'package:flutter/material.dart';

/// 与 Web 的问天气入口共用配色、尺寸和星芒图案。
class WeatherAskButton extends StatelessWidget {
  final String label;
  final String tooltip;
  final VoidCallback onPressed;

  const WeatherAskButton({
    super.key,
    required this.label,
    required this.tooltip,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 52,
    child: DecoratedBox(
      decoration: const BoxDecoration(
        borderRadius: BorderRadius.all(Radius.circular(28)),
        boxShadow: [
          BoxShadow(
            color: Color(0x2b183624),
            offset: Offset(0, 6),
            blurRadius: 24,
          ),
        ],
      ),
      child: FloatingActionButton.extended(
        onPressed: onPressed,
        tooltip: tooltip,
        backgroundColor: const Color(0xff28523d),
        foregroundColor: Colors.white,
        elevation: 0,
        focusElevation: 0,
        hoverElevation: 0,
        highlightElevation: 0,
        shape: const StadiumBorder(),
        extendedPadding: const EdgeInsets.symmetric(horizontal: 20),
        extendedIconLabelSpacing: 9,
        extendedTextStyle: const TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w600,
        ),
        icon: const CustomPaint(size: Size(21, 21), painter: _SparkPainter()),
        label: Text(label),
      ),
    ),
  );
}

class _SparkPainter extends CustomPainter {
  const _SparkPainter();

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 24, size.height / 24);
    final paint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.6
      ..strokeJoin = StrokeJoin.round
      ..strokeCap = StrokeCap.round;
    final main = Path()
      ..moveTo(10, 2)
      ..lineTo(12.3, 8.2)
      ..lineTo(19, 11)
      ..lineTo(12.3, 13.6)
      ..lineTo(10, 20)
      ..lineTo(7.5, 13.6)
      ..lineTo(1, 11)
      ..lineTo(7.5, 8.2)
      ..close();
    final small = Path()
      ..moveTo(19, 3)
      ..lineTo(20, 5.5)
      ..lineTo(22, 6.5)
      ..lineTo(20, 7.5)
      ..lineTo(19, 10)
      ..lineTo(18, 7.5)
      ..lineTo(16, 6.5)
      ..lineTo(18, 5.5)
      ..close();
    canvas.drawPath(main, paint);
    canvas.drawPath(small, paint);
  }

  @override
  bool shouldRepaint(covariant _SparkPainter oldDelegate) => false;
}
