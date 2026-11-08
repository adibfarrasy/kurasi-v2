import 'dart:io' show Platform;

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

/// Camera-or-library chooser using each platform's native pattern: an action
/// sheet on iOS, a three-button alert on Android. Null when cancelled.
Future<ImageSource?> pickPhotoSource(BuildContext context, {String title = 'Upload a picture'}) {
  if (Platform.isIOS) {
    return showCupertinoModalPopup<ImageSource>(
      context: context,
      builder: (ctx) => CupertinoActionSheet(
        actions: [
          CupertinoActionSheetAction(
            key: const ValueKey('source_camera'),
            onPressed: () => Navigator.of(ctx).pop(ImageSource.camera),
            child: const Text('Take Photo'),
          ),
          CupertinoActionSheetAction(
            key: const ValueKey('source_library'),
            onPressed: () => Navigator.of(ctx).pop(ImageSource.gallery),
            child: const Text('Choose from Library'),
          ),
        ],
        cancelButton: CupertinoActionSheetAction(
          isDefaultAction: true,
          onPressed: () => Navigator.of(ctx).pop(),
          child: const Text('Cancel'),
        ),
      ),
    );
  }
  return showDialog<ImageSource>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      // Native alerts stack the buttons, right-aligned, when they don't fit one row.
      actionsOverflowAlignment: OverflowBarAlignment.end,
      actions: [
        TextButton(
          key: const ValueKey('source_camera'),
          onPressed: () => Navigator.of(ctx).pop(ImageSource.camera),
          child: const Text('Take Photo'),
        ),
        TextButton(
          key: const ValueKey('source_library'),
          onPressed: () => Navigator.of(ctx).pop(ImageSource.gallery),
          child: const Text('Choose from Library'),
        ),
        TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancel')),
      ],
    ),
  );
}
