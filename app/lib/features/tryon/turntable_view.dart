import 'dart:typed_data';
import 'dart:ui' show FragmentProgram, FragmentShader, ImageFilter;

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:video_player/video_player.dart';

/// Looping 360° orbit of the figure. The backend renders it on pure green,
/// which the chroma-key shader removes so the figure sits on the page's tone
/// gradient like the still does. Long-press pauses; a horizontal drag turns
/// the figure by hand through [framesUrl]'s stills, since a seeking video
/// does not repaint under the finger on Android.
/// Shows [poster] until the video plays, and for good when the app
/// runs without Impeller (no shader filters) or the video fails.
class TurntableView extends StatefulWidget {
  const TurntableView({super.key, required this.url, this.framesUrl, required this.poster});

  final String url;

  /// The loop as evenly spaced JPEG stills, packed by the backend
  /// (`turntable::pack_frames`). Without it the figure cannot be dragged.
  final String? framesUrl;
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

  List<Uint8List>? _frames;

  /// Still shown while dragging; null while the video plays.
  int? _scrubIndex;
  int _scrubStart = 0;
  double _scrubDx = 0;

  VideoPlayerController _controller() => VideoPlayerController.networkUrl(
        Uri.parse(widget.url),
        videoPlayerOptions: VideoPlayerOptions(mixWithOthers: true),
      );

  @override
  void initState() {
    super.initState();
    if (!ImageFilter.isShaderFilterSupported) return;
    _start();
    _loadFrames();
  }

  Future<void> _loadFrames() async {
    final url = widget.framesUrl;
    if (url == null) return;
    try {
      final res = await http.get(Uri.parse(url));
      if (res.statusCode != 200) throw StateError('HTTP ${res.statusCode}');
      final frames = unpackFrames(res.bodyBytes);
      if (mounted) setState(() => _frames = frames);
    } catch (err) {
      debugPrint('[turntable] no drag-to-turn: $err');
    }
  }

  void _scrubBegin() {
    final frames = _frames;
    final total = _video.value.duration.inMilliseconds;
    if (frames == null || total == 0) return;
    _video.pause();
    _scrubStart = (_video.value.position.inMilliseconds / total * frames.length).round() % frames.length;
    _scrubDx = 0;
    setState(() => _scrubIndex = _scrubStart);
  }

  void _scrubMove(double dx, double width) {
    final frames = _frames;
    if (frames == null || _scrubIndex == null || width == 0) return;
    _scrubDx += dx;
    // One drag across the figure turns it once around; dragging left plays
    // the turn forward.
    final step = (-_scrubDx / width * frames.length).round();
    final index = (_scrubStart + step) % frames.length;
    if (index != _scrubIndex) setState(() => _scrubIndex = index);
  }

  Future<void> _scrubEnd() async {
    final frames = _frames;
    final index = _scrubIndex;
    if (frames == null || index == null) return;
    final total = _video.value.duration.inMilliseconds;
    await _video.seekTo(Duration(milliseconds: (index / frames.length * total).round()));
    await _video.play();
    // The still stays up until the resumed video has had time to paint.
    await Future<void>.delayed(const Duration(milliseconds: 150));
    if (mounted && _scrubIndex == index) setState(() => _scrubIndex = null);
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
    final frames = _frames;
    final index = _scrubIndex;
    return LayoutBuilder(
      builder: (context, c) => GestureDetector(
        behavior: HitTestBehavior.opaque,
        onLongPressStart: (_) => _video.pause(),
        onLongPressEnd: (_) => _video.play(),
        onHorizontalDragStart: (_) => _scrubBegin(),
        onHorizontalDragUpdate: (d) => _scrubMove(d.delta.dx, c.maxWidth),
        onHorizontalDragEnd: (_) => _scrubEnd(),
        onHorizontalDragCancel: _scrubEnd,
        // The backend frames the video and the stills on the still's canvas,
        // so they fill the same box with the figure in the same place.
        child: ImageFiltered(
          imageFilter: ImageFilter.shader(shader),
          child: frames != null && index != null
              ? Image.memory(frames[index], fit: BoxFit.fill, gaplessPlayback: true)
              : VideoPlayer(_video),
        ),
      ),
    );
  }
}

/// Splits the backend's `KTF1` pack: magic, u32 count, u32 length per frame,
/// then the frames back to back (all little-endian).
List<Uint8List> unpackFrames(Uint8List bytes) {
  final data = ByteData.sublistView(bytes);
  if (bytes.length < 8 || String.fromCharCodes(bytes.sublist(0, 4)) != 'KTF1') {
    throw const FormatException('not a turntable frame pack');
  }
  final count = data.getUint32(4, Endian.little);
  var offset = 8 + 4 * count;
  final frames = <Uint8List>[];
  for (var i = 0; i < count; i++) {
    final len = data.getUint32(8 + 4 * i, Endian.little);
    if (offset + len > bytes.length) throw const FormatException('truncated turntable frame pack');
    frames.add(Uint8List.sublistView(bytes, offset, offset + len));
    offset += len;
  }
  return frames;
}
