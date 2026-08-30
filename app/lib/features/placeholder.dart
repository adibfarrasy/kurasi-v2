import 'package:flutter/material.dart';

class _PlaceholderScreen extends StatelessWidget {
  const _PlaceholderScreen(this.title);
  final String title;
  @override
  Widget build(BuildContext context) => Scaffold(body: Center(child: Text(title)));
}

class StealTheLookScreen extends StatelessWidget {
  const StealTheLookScreen({super.key});
  @override
  Widget build(BuildContext context) => const _PlaceholderScreen('Steal the Look');
}

class StealTheLookAnalyzingScreen extends StatelessWidget {
  const StealTheLookAnalyzingScreen({super.key});
  @override
  Widget build(BuildContext context) => const _PlaceholderScreen('Analyzing');
}

class StealTheLookFailedScreen extends StatelessWidget {
  const StealTheLookFailedScreen({super.key});
  @override
  Widget build(BuildContext context) => const _PlaceholderScreen('Steal the Look Failed');
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