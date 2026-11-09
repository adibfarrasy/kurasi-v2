import 'dart:ui' show FragmentProgram, FragmentShader, ImageFilter;

import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

/// Looping 360° orbit of the figure. The backend renders it on pure green,
/// which the chroma-key shader removes so the figure sits on the page's tone
/// gradient like the still does. Long-press pauses.
/// Shows [poster] until the video plays, and for good when the app
/// runs without Impeller (no shader filters) or the video fails.
class TurntableView extends StatefulWidget {
  const TurntableView({super.key, required this.url, required this.poster});

  final String url;
  final Widget poster;

  @override
  State<TurntableView> createState() => _TurntableViewState();
}

class _TurntableViewState extends State<TurntableView> {
  static final Future<FragmentProgram> _program = FragmentProgram.fromAsset('shaders/chroma_key.frag');

  /// A hardware decoder can die mid-loop and leave the last frame frozen;
  /// the player is rebuilt then, unless the previous failure was this recent,
  /// which means the video itself is bad and the still stays up.
  static const _retryWindow = Duration(minutes: 1);

  late VideoPlayerController _video = _controller();
  FragmentShader? _shader;
  DateTime? _lastFailure;

  VideoPlayerController _controller() => VideoPlayerController.networkUrl(
        Uri.parse(widget.url),
        videoPlayerOptions: VideoPlayerOptions(mixWithOthers: true),
      );

  @override
  void initState() {
    super.initState();
    if (!ImageFilter.isShaderFilterSupported) return;
    _start();
  }

  Future<void> _start() async {
    try {
      final program = await _program;
      await _video.initialize();
      await _video.setLooping(true);
      await _video.setVolume(0);
      await _video.play();
      _video.addListener(_onVideo);
      if (!mounted) return;
      setState(() => _shader = program.fragmentShader());
    } catch (err) {
      _fail(err);
    }
  }

  void _onVideo() {
    if (_video.value.hasError) _fail(_video.value.errorDescription);
  }

  void _fail(Object? err) {
    _video.removeListener(_onVideo);
    final now = DateTime.now();
    final retry = _lastFailure == null || now.difference(_lastFailure!) > _retryWindow;
    _lastFailure = now;
    debugPrint('[turntable] ${retry ? 'restarting' : 'falling back to the still'}: $err');
    if (!mounted) return;
    final old = _video;
    setState(() {
      _shader?.dispose();
      _shader = null;
      if (retry) _video = _controller();
    });
    old.dispose();
    if (retry) _start();
  }

  @override
  void dispose() {
    _video.removeListener(_onVideo);
    _video.dispose();
    _shader?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final shader = _shader;
    if (shader == null) return widget.poster;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onLongPressStart: (_) => _video.pause(),
      onLongPressEnd: (_) => _video.play(),
      // The backend frames the video on the still's canvas, so it fills
      // the same box with the figure in the same place.
      child: ImageFiltered(
        imageFilter: ImageFilter.shader(shader),
        child: VideoPlayer(_video),
      ),
    );
  }
}
