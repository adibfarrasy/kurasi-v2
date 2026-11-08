import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'avatar_job_state.dart';
import 'profile_state.dart';

/// Front-facing face capture for the avatar: camera preview framed by corner
/// brackets + a silhouette guide, a white shutter that stores the captured
/// photo in [facePhotoProvider] and pops.
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
    final insets = MediaQuery.paddingOf(context);
    final controller = _controller;
    Widget preview;
    if (_cameraFailed) {
      preview = const _FallbackBackground();
    } else if (controller != null && controller.value.isInitialized) {
      final size = controller.value.previewSize!;
      // Fill the frame like a cover-fit image; the sensor reports landscape.
      preview = ClipRect(
        child: FittedBox(
          fit: BoxFit.cover,
          child: SizedBox(width: size.height, height: size.width, child: CameraPreview(controller)),
        ),
      );
    } else {
      preview = const Center(child: CircularProgressIndicator(color: Colors.white));
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: Column(
        children: [
          Expanded(
            child: Padding(
              padding: EdgeInsets.fromLTRB(24, insets.top + 20, 24, 0),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  preview,
                  const _Corner(top: true, left: true),
                  const _Corner(top: true, left: false),
                  const _Corner(top: false, left: true),
                  const _Corner(top: false, left: false),
                  IgnorePointer(
                    child: FractionallySizedBox(
                      widthFactor: 0.78,
                      heightFactor: 0.78,
                      child: SvgPicture.asset('assets/silhouette.svg'),
                    ),
                  ),
                  Positioned(
                    top: 12,
                    left: 12,
                    child: _IconButton(icon: Icons.close, onPressed: () => context.pop()),
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: EdgeInsets.fromLTRB(24, 24, 24, insets.bottom + 24),
            child: Column(
              children: [
                const Text(
                  'Follow the guideline and take a picture',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 8),
                Text(
                  'Make sure your face is clearly visible. Please remove hats and glasses.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 14, height: 20 / 14),
                ),
                const SizedBox(height: 24),
                _cameraFailed
                    ? _FallbackButton(onPressed: _useFallback)
                    : _ShutterButton(onPressed: controller != null && controller.value.isInitialized ? _capture : null),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Corner extends StatelessWidget {
  const _Corner({required this.top, required this.left});

  final bool top;
  final bool left;

  @override
  Widget build(BuildContext context) {
    const side = BorderSide(color: Colors.white, width: 3);
    return Positioned(
      top: top ? 0 : null,
      bottom: top ? null : 0,
      left: left ? 0 : null,
      right: left ? null : 0,
      child: IgnorePointer(
        child: Container(
          width: 26,
          height: 26,
          decoration: BoxDecoration(
            border: Border(top: top ? side : BorderSide.none, bottom: top ? BorderSide.none : side, left: left ? side : BorderSide.none, right: left ? BorderSide.none : side),
          ),
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
          alignment: Alignment.center,
          decoration: const BoxDecoration(shape: BoxShape.circle, color: Colors.white),
          child: Container(
            width: 60,
            height: 60,
            decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white, border: Border.all(color: Colors.black.withValues(alpha: 0.1), width: 2)),
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

