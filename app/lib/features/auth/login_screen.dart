import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_state.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';

/// Sign-in screen: splash backdrop, stacked "CURATE, STYLE, INSPIRE."
/// headline (BebasNeue with KirangHaerang accent letters), and Apple + Google
/// sign-in buttons in the lower third.
class LoginScreen extends ConsumerWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: AppColors.dark,
      body: Stack(
        fit: StackFit.expand,
        children: [
          Image.asset('assets/splash.png', fit: BoxFit.cover),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 32),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 64),
                  Center(
                    child: Image.asset(
                      'assets/logomark.png',
                      width: 96,
                      height: 96,
                      fit: BoxFit.contain,
                    ),
                  ),
                  const Spacer(),
                  const _Headline(),
                  const SizedBox(height: 40),
                  _SignInButton(
                    label: 'Apple',
                    icon: const _AppleLogo(size: 24),
                    onPressed: () {},
                  ),
                  const SizedBox(height: 16),
                  _SignInButton(
                    label: 'Google',
                    icon: const _GoogleLogo(size: 24),
                    onPressed: () =>
                        ref.read(authStateProvider.notifier).signInWithGoogle(),
                  ),
                  const SizedBox(height: 48),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Headline extends StatelessWidget {
  const _Headline();

  static const TextStyle _bebas = TextStyle(
    fontFamily: 'BebasNeue',
    fontSize: 64,
    height: 70 / 64,
    color: Colors.white,
  );
  static const TextStyle _kirang = TextStyle(
    fontFamily: 'KirangHaerang',
    fontSize: 75,
    height: 70 / 75,
    color: Colors.white,
  );

  @override
  Widget build(BuildContext context) {
    return const Text.rich(
      TextSpan(
        style: _bebas,
        children: [
          TextSpan(text: 'C', style: _kirang),
          TextSpan(text: 'URATE,'),
          TextSpan(text: '\n'),
          TextSpan(text: 'ST'),
          TextSpan(text: 'Y', style: _kirang),
          TextSpan(text: 'LE,'),
          TextSpan(text: '\n'),
          TextSpan(text: 'I', style: _kirang),
          TextSpan(text: 'NSPIRE.'),
        ],
      ),
      textAlign: TextAlign.center,
    );
  }
}

class _SignInButton extends StatelessWidget {
  const _SignInButton({
    required this.label,
    required this.icon,
    required this.onPressed,
  });

  final String label;
  final Widget icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 56,
      child: ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xE6FFFFFF),
          foregroundColor: AppColors.textPrimary,
          elevation: 0,
          shape: const StadiumBorder(),
          textStyle: AppTypography.buttonLabel,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const SizedBox(width: 8),
            icon,
            const SizedBox(width: 8),
            Text(label),
          ],
        ),
      ),
    );
  }
}

class _AppleLogo extends StatelessWidget {
  const _AppleLogo({required this.size});

  final double size;

  @override
  Widget build(BuildContext context) => CustomPaint(
        size: Size.square(size),
        painter: _LogoPainter(
          paths: [_applePath],
          colors: const [Color(0xFF000000)],
        ),
      );
}

class _GoogleLogo extends StatelessWidget {
  const _GoogleLogo({required this.size});

  final double size;

  @override
  Widget build(BuildContext context) => CustomPaint(
        size: Size.square(size),
        painter: _LogoPainter(
          paths: [_googleRed, _googleYellow, _googleBlue, _googleGreen],
          colors: const [
            Color(0xFFF44336),
            Color(0xFFFFC107),
            Color(0xFF448AFF),
            Color(0xFF43A047),
          ],
        ),
      );
}

class _LogoPainter extends CustomPainter {
  _LogoPainter({required this.paths, required this.colors});

  final List<Path> paths;
  final List<Color> colors;

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / 24;
    canvas.save();
    canvas.scale(scale, scale);
    for (var i = 0; i < paths.length; i++) {
      canvas.drawPath(paths[i], Paint()..color = colors[i]);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_LogoPainter oldDelegate) =>
      oldDelegate.paths != paths || oldDelegate.colors != colors;
}

Path _parseSvgPath(String d) {
  final path = Path();
  final token = RegExp(r'([MLHVCSZ])|([-+]?\d*\.?\d+)');
  String? cmd;
  final args = <double>[];
  double cx = 0, cy = 0;
  double sx = 0, sy = 0;

  void apply() {
    switch (cmd) {
      case 'M':
        cx = args[0];
        cy = args[1];
        path.moveTo(cx, cy);
        sx = cx;
        sy = cy;
        cmd = 'L';
      case 'L':
        while (args.length >= 2) {
          cx = args.removeAt(0);
          cy = args.removeAt(0);
          path.lineTo(cx, cy);
        }
      case 'H':
        while (args.isNotEmpty) {
          cx = args.removeAt(0);
          path.lineTo(cx, cy);
        }
      case 'V':
        while (args.isNotEmpty) {
          cy = args.removeAt(0);
          path.lineTo(cx, cy);
        }
      case 'C':
        while (args.length >= 6) {
          final c1x = args.removeAt(0);
          final c1y = args.removeAt(0);
          final c2x = args.removeAt(0);
          final c2y = args.removeAt(0);
          cx = args.removeAt(0);
          cy = args.removeAt(0);
          path.cubicTo(c1x, c1y, c2x, c2y, cx, cy);
        }
      case 'Z':
        path.close();
        cx = sx;
        cy = sy;
    }
    args.clear();
  }

  for (final m in token.allMatches(d)) {
    if (m.group(1) != null) {
      apply();
      cmd = m.group(1);
    } else if (m.group(2) != null) {
      args.add(double.parse(m.group(2)!));
    }
  }
  apply();
  return path;
}

final Path _applePath = _parseSvgPath(
  'M17.05 20.28C16.07 21.23 15 21.08 13.97 20.63C12.88 20.17 11.88 20.15 '
  '10.73 20.63C9.29 21.25 8.53 21.07 7.67 20.28C2.79 15.25 3.51 7.59 9.05 '
  '7.31C10.4 7.38 11.34 8.05 12.13 8.11C13.31 7.87 14.44 7.18 15.7 7.27C17.21 '
  '7.39 18.35 7.99 19.1 9.07C15.98 10.94 16.72 15.05 19.58 16.2C19.01 17.7 '
  '18.27 19.19 17.04 20.29L17.05 20.28ZM12.03 7.25C11.88 5.02 13.69 3.18 15.77 '
  '3C16.06 5.58 13.43 7.5 12.03 7.25Z',
);

final Path _googleRed = _parseSvgPath(
  'M10.9151 3.07814C11.8477 2.97395 12.3995 2.97395 13.4015 3.07814C15.1751 '
  '3.34066 16.8193 4.16051 18.0963 5.41913C17.2334 6.23479 16.3818 7.06236 '
  '15.5418 7.9016C13.9331 6.53817 12.1375 6.22347 10.1549 6.95749C8.70062 '
  '7.62634 7.68791 8.71023 7.11681 10.2091C6.18356 9.51435 5.26246 8.80337 '
  '4.35393 8.07653C4.29079 8.0433 4.21868 8.03113 4.14813 8.0418C5.59131 '
  '5.2592 7.84655 3.60422 10.9138 3.07685',
);

final Path _googleYellow = _parseSvgPath(
  'M4.14556 8.04176C4.21845 8.03061 4.28748 8.04219 4.35265 8.07649C5.26117 '
  '8.80333 6.18227 9.5143 7.11552 10.2091C6.96867 10.7931 6.87609 11.3895 '
  '6.83898 11.9906C6.87071 12.572 6.96289 13.1426 7.11552 13.7026L4.21502 '
  '16.0114C2.95191 13.372 2.92876 10.7155 4.14556 8.04176Z',
);

final Path _googleBlue = _parseSvgPath(
  'M17.9587 18.8078C17.0555 18.0113 16.11 17.2642 15.1263 16.5697C16.1125 '
  '15.8734 16.711 14.9181 16.9219 13.7039H12.0895V10.3481C14.8764 10.3249 '
  '17.662 10.3485 20.4463 10.4188C20.9745 13.2872 20.3644 15.8734 18.6159 '
  '18.1775C18.408 18.3985 18.1878 18.6089 17.9587 18.8078Z',
);

final Path _googleGreen = _parseSvgPath(
  'M7.11553 13.7039C8.17026 16.3252 10.1039 17.5489 12.9165 17.3748C13.7061 '
  '17.2834 14.4631 17.0076 15.1263 16.5696C16.1108 17.2659 17.0549 18.012 '
  '17.9587 18.8077C16.5266 20.0946 14.7007 20.8581 12.7789 20.9738C12.3423 '
  '21.0087 11.9036 21.0087 11.4669 20.9738C8.19299 20.5879 5.77568 18.9338 '
  '4.21503 16.0114L7.11553 13.7039Z',
);