import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/theme/app_theme.dart';
import 'router.dart';

class KurasiApp extends ConsumerWidget {
  const KurasiApp({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'Kurasi',
      theme: AppTheme.light,
      routerConfig: router,
    );
  }
}

final routerProvider = Provider<GoRouter>((ref) => buildRouter(ref));