import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';

/// Geometry shared between the tab bar and the plus sheet so the visible
/// 16pt gap above the home indicator (or screen edge) stays constant.
const double kTabBarBottomGap = 16;
const double kTabBarPaddingTop = 11;
const double kTabBarItemBand = 49;

/// Bar height on top of `bottomInset`: padding top + item band + bottom gap.
double tabBarHeight(double bottomInset) =>
    bottomInset + kTabBarBottomGap + kTabBarPaddingTop + kTabBarItemBand;

class CustomTabBar extends StatelessWidget {
  const CustomTabBar({
    super.key,
    required this.index,
    required this.onIndexChanged,
    required this.onPlus,
    required this.bottomInset,
  });

  /// Active tab position: 0 = Try On, 1 = My Fit, 2 = Wardrobe.
  final int index;
  final ValueChanged<int> onIndexChanged;
  final VoidCallback onPlus;
  final double bottomInset;

  static const ValueKey<String> plusButtonKey = ValueKey('tab_plus_button');

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: tabBarHeight(bottomInset),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            left: 20,
            right: 20,
            top: kTabBarPaddingTop,
            height: kTabBarItemBand,
            child: Row(
              children: [
                Expanded(
                  child: _TabItem(
                    label: 'Try On',
                    iconAsset: 'assets/sparkle.png',
                    selected: index == 0,
                    onTap: () => onIndexChanged(0),
                  ),
                ),
                Expanded(
                  child: _TabItem(
                    label: 'My Fit',
                    iconAsset: 'assets/bookmark-simple.png',
                    selected: index == 1,
                    onTap: () => onIndexChanged(1),
                  ),
                ),
                Expanded(
                  child: _TabItem(
                    label: 'Wardrobe',
                    iconAsset: 'assets/dresser.png',
                    selected: index == 2,
                    onTap: () => onIndexChanged(2),
                  ),
                ),
              ],
            ),
          ),
          Positioned(
            right: 20,
            top: kTabBarPaddingTop - 7,
            child: _PlusButton(onPressed: onPlus),
          ),
        ],
      ),
    );
  }
}

class _TabItem extends StatelessWidget {
  const _TabItem({
    required this.label,
    required this.iconAsset,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final String iconAsset;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final labelStyle = AppTypography.slotLabel.copyWith(
      color: selected ? AppColors.accent : AppColors.tabInactiveText,
    );
    final textPainter = TextPainter(
      text: TextSpan(text: label, style: labelStyle),
      maxLines: 1,
      textDirection: TextDirection.ltr,
    )..layout();

    return InkWell(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ImageIcon(
            AssetImage(iconAsset),
            size: 26,
            color: selected ? AppColors.accent : AppColors.tabInactiveIcon,
          ),
          const SizedBox(height: 4),
          Text(label, style: labelStyle),
          if (selected)
            Container(
              margin: const EdgeInsets.only(top: 2),
              width: textPainter.width,
              height: 4,
              child: Image.asset('assets/underline.png', fit: BoxFit.fill),
            ),
        ],
      ),
    );
  }
}

class _PlusButton extends StatelessWidget {
  const _PlusButton({required this.onPressed});

  final VoidCallback onPressed;

  static const double _size = 56;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: CustomTabBar.plusButtonKey,
      onTap: onPressed,
      child: Container(
        width: _size,
        height: _size,
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: Color(0x66000000),
              offset: Offset(0.5, 1),
              blurRadius: 1,
            ),
          ],
        ),
        child: Container(
          padding: const EdgeInsets.all(1),
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Color(0x80FFFFFF),
                Color(0x1AFFFFFF),
                Color(0x40FFFFFF),
              ],
              stops: [0, 0.5, 1],
            ),
          ),
          child: ClipOval(
            child: Image.asset(
              'assets/plus-button.png',
              width: _size - 2,
              height: _size - 2,
              fit: BoxFit.cover,
            ),
          ),
        ),
      ),
    );
  }
}