import 'package:flutter_riverpod/flutter_riverpod.dart';

/// SVG path data per signature stroke (matching RN `signaturePathsAtom`),
/// produced by the signature pad and rendered on the membership card.
final signaturePathsProvider = StateProvider<List<String>>((ref) => []);