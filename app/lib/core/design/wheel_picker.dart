import 'package:flutter/material.dart';

/// Height of a single wheel row (38px).
const double wheelItemHeight = 38;

/// Number of rows visible in the wheel at once.
const int wheelVisibleCount = 5;

/// Vertical scroll-snap wheel picker (single column). Items are laid out on
/// a `ListWheelScrollView` with [wheelItemHeight] rows; [wheelVisibleCount]
/// rows are visible when the wheel is sized to
/// `wheelItemHeight * wheelVisibleCount`.
///
/// The highlight band for the selected row is the caller's responsibility —
/// draw a sibling widget positioned at
/// `top: wheelItemHeight * (wheelVisibleCount ~/ 2)`.
class WheelPicker<T> extends StatefulWidget {
  const WheelPicker({
    super.key,
    required this.items,
    required this.itemBuilder,
    this.initialValue,
    this.onChanged,
  });

  final List<T> items;

  /// Builds the label for a single wheel row. The row is centered by the
  /// wheel itself; callers should size their label to fit 38px.
  final Widget Function(T value) itemBuilder;

  /// The value selected when the wheel first mounts. Defaults to the first
  /// item when null or not present in [items].
  final T? initialValue;

  final ValueChanged<T>? onChanged;

  @override
  State<WheelPicker<T>> createState() => _WheelPickerState<T>();
}

class _WheelPickerState<T> extends State<WheelPicker<T>> {
  late final FixedExtentScrollController _controller;
  late final int _initialIndex;

  @override
  void initState() {
    super.initState();
    assert(widget.items.isNotEmpty, 'WheelPicker requires at least one item');
    final initial = widget.initialValue ?? widget.items.first;
    final idx = widget.items.indexOf(initial);
    _initialIndex = idx < 0 ? 0 : idx.clamp(0, widget.items.length - 1);
    _controller = FixedExtentScrollController(initialItem: _initialIndex);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListWheelScrollView.useDelegate(
      controller: _controller,
      itemExtent: wheelItemHeight,
      diameterRatio: 2.0,
      physics: const FixedExtentScrollPhysics(),
      onSelectedItemChanged: (i) => widget.onChanged?.call(widget.items[i]),
      childDelegate: ListWheelChildBuilderDelegate(
        childCount: widget.items.length,
        builder: (_, i) => SizedBox(
          height: wheelItemHeight,
          width: double.infinity,
          child: Center(child: widget.itemBuilder(widget.items[i])),
        ),
      ),
    );
  }
}