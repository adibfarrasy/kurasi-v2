import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Name typed on the membership card, live-bound to the card preview.
final cardNameProvider = StateProvider<String>((ref) => '');