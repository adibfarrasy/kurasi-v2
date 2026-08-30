import 'package:flutter_riverpod/flutter_riverpod.dart';

enum WardrobeMode { grid, list }

class WardrobeUiState {
  const WardrobeUiState({
    this.mode = WardrobeMode.grid,
    this.query = '',
    this.selectedCategories = const {},
  });

  final WardrobeMode mode;
  final String query;
  final Set<String> selectedCategories;

  WardrobeUiState copyWith({
    WardrobeMode? mode,
    String? query,
    Set<String>? selectedCategories,
  }) {
    return WardrobeUiState(
      mode: mode ?? this.mode,
      query: query ?? this.query,
      selectedCategories: selectedCategories ?? this.selectedCategories,
    );
  }
}

class WardrobeUiNotifier extends Notifier<WardrobeUiState> {
  @override
  WardrobeUiState build() => const WardrobeUiState();

  void toggleMode() {
    state = state.copyWith(
      mode: state.mode == WardrobeMode.grid ? WardrobeMode.list : WardrobeMode.grid,
    );
  }

  void setQuery(String query) => state = state.copyWith(query: query);

  void toggleCategory(String category) {
    final next = Set<String>.from(state.selectedCategories);
    if (!next.add(category)) next.remove(category);
    state = state.copyWith(selectedCategories: next);
  }

  void clearCategories() {
    state = state.copyWith(selectedCategories: const {});
  }
}

final wardrobeUiProvider =
    NotifierProvider<WardrobeUiNotifier, WardrobeUiState>(WardrobeUiNotifier.new);

const List<String> wardrobeCategories = ['headwear', 'shirt', 'jacket', 'pants', 'footwear'];

const Map<String, String> wardrobeCategoryLabels = {
  'headwear': 'Headwear',
  'shirt': 'Shirt',
  'jacket': 'Jacket',
  'pants': 'Pants',
  'footwear': 'Footwear',
};