import 'package:flutter/material.dart';

class _PlaceholderScreen extends StatelessWidget {
  const _PlaceholderScreen(this.title);
  final String title;
  @override
  Widget build(BuildContext context) => Scaffold(body: Center(child: Text(title)));
}

class UploadWardrobeGuideScreen extends StatelessWidget {
  const UploadWardrobeGuideScreen({super.key});
  @override
  Widget build(BuildContext context) => const _PlaceholderScreen('Upload Wardrobe Guide');
}

class UploadWardrobeScreen extends StatelessWidget {
  const UploadWardrobeScreen({super.key});
  @override
  Widget build(BuildContext context) => const _PlaceholderScreen('Upload Wardrobe');
}

class UploadWardrobeReviewScreen extends StatelessWidget {
  const UploadWardrobeReviewScreen({super.key});
  @override
  Widget build(BuildContext context) => const _PlaceholderScreen('Upload Wardrobe Review');
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