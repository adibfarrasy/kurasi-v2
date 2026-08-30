import 'package:flutter/material.dart';

void main() {
  runApp(const KurasiApp());
}

class KurasiApp extends StatelessWidget {
  const KurasiApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Kurasi',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
      ),
      home: const HomePage(),
    );
  }
}

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Kurasi'),
      ),
      body: const Center(
        child: Text('Kurasi'),
      ),
    );
  }
}