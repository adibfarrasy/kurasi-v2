import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/design/tab_bar.dart';
import 'plus_modal.dart';

/// Branch index (in the router's StatefulShellRoute) for each tab position.
const List<int> _branchIndexForTab = [1, 0, 2];

class TabShell extends ConsumerStatefulWidget {
  const TabShell({super.key, required this.child});

  /// The [StatefulNavigationShell] passed by the router's shell builder.
  final Widget child;

  @override
  ConsumerState<TabShell> createState() => _TabShellState();
}

class _TabShellState extends ConsumerState<TabShell> {
  StatefulNavigationShell get _shell => widget.child as StatefulNavigationShell;

  int get _tabIndex {
    final branch = _shell.currentIndex;
    return _branchIndexForTab.indexOf(branch);
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.paddingOf(context).bottom;
    return Scaffold(
      body: Stack(
        children: [
          _shell,
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: CustomTabBar(
              index: _tabIndex,
              onIndexChanged: (tabIndex) =>
                  _shell.goBranch(_branchIndexForTab[tabIndex]),
              onPlus: () => PlusModal.show(context),
              bottomInset: bottomInset,
            ),
          ),
        ],
      ),
    );
  }
}