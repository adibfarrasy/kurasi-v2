import 'package:flutter/material.dart';

class _PlaceholderScreen extends StatelessWidget {
  const _PlaceholderScreen(this.title);
  final String title;
  @override
  Widget build(BuildContext context) => Scaffold(body: Center(child: Text(title)));
}

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});
  @override
  Widget build(BuildContext context) => const _PlaceholderScreen('Profile');
}