import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The analyzed "steal the look" draft. The analyzing screen (Task 6) sets it;
/// TryOn reads it for the hero + color tone and clears it on save.
final stealTheLookDraftProvider =
    StateProvider<Map<String, dynamic>?>((ref) => null);

class StealTheLookDraft {
  StealTheLookDraft._();

  static const prefsKey = 'steal_the_look_draft';

  /// Reads the persisted draft. Returns null when nothing is stored or the
  /// stored value is not a JSON object.
  static Future<Map<String, dynamic>?> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(prefsKey);
    if (raw == null) return null;
    try {
      final decoded = jsonDecode(raw);
      return decoded is Map ? Map<String, dynamic>.from(decoded) : null;
    } catch (_) {
      return null;
    }
  }

  static Future<void> save(Map<String, dynamic>? draft) async {
    final prefs = await SharedPreferences.getInstance();
    if (draft == null) {
      await prefs.remove(prefsKey);
    } else {
      await prefs.setString(prefsKey, jsonEncode(draft));
    }
  }
}

/// Hydrates the draft provider from shared preferences (getOnInit). No-ops
/// when nothing has been persisted yet.
Future<void> hydrateStealTheLookDraft(WidgetRef ref) async {
  final draft = await StealTheLookDraft.load();
  if (draft != null) {
    ref.read(stealTheLookDraftProvider.notifier).state = draft;
  }
}

/// Updates the draft provider and its persisted value in one call.
Future<void> persistStealTheLookDraft(
  WidgetRef ref,
  Map<String, dynamic>? draft,
) async {
  ref.read(stealTheLookDraftProvider.notifier).state = draft;
  await StealTheLookDraft.save(draft);
}