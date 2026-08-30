import 'package:flutter/material.dart';

class _PlaceholderScreen extends StatelessWidget {
  const _PlaceholderScreen(this.title);
  final String title;
  @override
  Widget build(BuildContext context) => Scaffold(body: Center(child: Text(title)));
}

class SubscriptionScreen extends StatelessWidget {
  const SubscriptionScreen({super.key});
  @override
  Widget build(BuildContext context) => const _PlaceholderScreen('Subscription');
}

class AiBalanceScreen extends StatelessWidget {
  const AiBalanceScreen({super.key});
  @override
  Widget build(BuildContext context) => const _PlaceholderScreen('AI Balance');
}

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});
  @override
  Widget build(BuildContext context) => const _PlaceholderScreen('Profile');
}