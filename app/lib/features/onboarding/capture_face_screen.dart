import 'dart:io';
import 'dart:math' as math;

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'avatar_job_state.dart';
import 'profile_state.dart';

/// Front-facing face capture for the avatar. Port of RN `capture-face.tsx`:
/// camera preview framed by corner brackets + a silhouette guide, a white
/// shutter that stores the captured photo in [facePhotoProvider] and pops.
///
/// Failure-tolerant: on any camera error (simulator / no camera) it falls
/// back to the bundled `test-face.png` so onboarding still completes.
class CaptureFaceScreen extends ConsumerStatefulWidget {
  const CaptureFaceScreen({super.key});

  @override
  ConsumerState<CaptureFaceScreen> createState() => _CaptureFaceScreenState();
}

class _CaptureFaceScreenState extends ConsumerState<CaptureFaceScreen> {
  static const _testFaceAsset = 'assets/test-face.png';

  CameraController? _controller;
  bool _cameraFailed = false;

  @override
  void initState() {
    super.initState();
    _initCamera();
  }

  Future<void> _initCamera() async {
    try {
      final cameras = await availableCameras();
      CameraDescription? selected;
      for (final camera in cameras) {
        if (camera.lensDirection == CameraLensDirection.front) {
          selected = camera;
          break;
        }
      }
      selected ??= cameras.isEmpty ? null : cameras.first;
      if (selected == null) throw CameraException('NO_CAMERA', 'No camera available');
      final controller = CameraController(selected, ResolutionPreset.high, enableAudio: false);
      await controller.initialize();
      if (!mounted) return;
      setState(() => _controller = controller);
    } catch (err) {
      if (!mounted) return;
      setState(() => _cameraFailed = true);
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _capture() async {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;
    try {
      final photo = await controller.takePicture();
      _usePhoto(photo.path);
    } catch (err) {
      await _useFallback();
    }
  }

  Future<void> _useFallback() async {
    final data = await rootBundle.load(_testFaceAsset);
    final file = File('${Directory.systemTemp.path}/test-face-${DateTime.now().microsecondsSinceEpoch}.png');
    await file.writeAsBytes(data.buffer.asUint8List());
    _usePhoto(file.path);
  }

  void _usePhoto(String path) {
    ref.read(avatarJobStateProvider.notifier).reset();
    ref.read(facePhotoProvider.notifier).state = path;
    if (mounted) context.pop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (_cameraFailed)
              const _FallbackBackground()
            else if (_controller != null && _controller!.value.isInitialized)
              CameraPreview(_controller!)
            else
              const Center(child: CircularProgressIndicator(color: Colors.white)),
            const IgnorePointer(child: CustomPaint(painter: _FaceGuidePainter())),
            Positioned(
              top: 12,
              left: 12,
              child: _IconButton(
                icon: Icons.close,
                onPressed: () => context.pop(),
              ),
            ),
            Positioned(
              bottom: 28,
              left: 0,
              right: 0,
              child: _cameraFailed
                  ? _FallbackButton(onPressed: _useFallback)
                  : _ShutterButton(onPressed: _controller != null && _controller!.value.isInitialized ? _capture : null),
            ),
          ],
        ),
      ),
    );
  }
}

class _FallbackBackground extends StatelessWidget {
  const _FallbackBackground();

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Image.asset('assets/test-face.png', width: 220, height: 220, fit: BoxFit.cover),
        const SizedBox(height: 16),
        const Text(
          'Camera unavailable — using a sample photo',
          style: TextStyle(color: Colors.white70, fontSize: 14),
        ),
      ],
    );
  }
}

class _FallbackButton extends StatelessWidget {
  const _FallbackButton({required this.onPressed});
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: FilledButton.icon(
        onPressed: onPressed,
        icon: const Icon(Icons.face_retouching_natural),
        label: const Text('Use sample photo'),
        style: FilledButton.styleFrom(
          backgroundColor: Colors.white,
          foregroundColor: Colors.black,
          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
          shape: const StadiumBorder(),
        ),
      ),
    );
  }
}

class _ShutterButton extends StatelessWidget {
  const _ShutterButton({required this.onPressed});
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: GestureDetector(
        onTap: onPressed,
        child: Container(
          width: 72,
          height: 72,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 4),
          ),
          padding: const EdgeInsets.all(6),
          child: const DecoratedBox(
            decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white),
          ),
        ),
      ),
    );
  }
}

class _IconButton extends StatelessWidget {
  const _IconButton({required this.icon, required this.onPressed});
  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black54,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onPressed,
        child: Padding(padding: const EdgeInsets.all(10), child: Icon(icon, color: Colors.white, size: 22)),
      ),
    );
  }
}

/// Corner brackets framing the face + a head-and-shoulders silhouette guide.
class _FaceGuidePainter extends CustomPainter {
  const _FaceGuidePainter();

  @override
  void paint(Canvas canvas, Size size) {
    final guide = Paint()
      ..color = Colors.white.withValues(alpha: 0.85)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3;

    const inset = 48.0;
    const bracket = 34.0;
    final rect = Rect.fromLTWH(inset, inset, size.width - inset * 2, size.height * 0.55 - inset);
    final p = rect.width / 2;
    final top = rect.top + rect.height * 0.18;
    final headR = rect.width * 0.15;
    canvas.drawCircle(Offset(p, top), headR, guide);
    canvas.drawArc(
      Rect.fromCenter(center: Offset(p, rect.bottom), width: rect.width * 0.85, height: rect.height * 0.5),
      math.pi,
      math.pi,
      false,
      guide,
    );

    final corner = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;
    final path = Path()
      ..moveTo(rect.left, rect.top + bracket)
      ..lineTo(rect.left, rect.top)
      ..lineTo(rect.left + bracket, rect.top)
      ..moveTo(rect.right - bracket, rect.top)
      ..lineTo(rect.right, rect.top)
      ..lineTo(rect.right, rect.top + bracket)
      ..moveTo(rect.right, rect.bottom - bracket)
      ..lineTo(rect.right, rect.bottom)
      ..lineTo(rect.right - bracket, rect.bottom)
      ..moveTo(rect.left + bracket, rect.bottom)
      ..lineTo(rect.left, rect.bottom)
      ..lineTo(rect.left, rect.bottom - bracket);
    canvas.drawPath(path, corner);
  }

  @override
  bool shouldRepaint(covariant _FaceGuidePainter oldDelegate) => false;
}