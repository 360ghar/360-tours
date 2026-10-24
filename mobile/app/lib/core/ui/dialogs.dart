import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Cancel / confirm dialog. Resolves true only when the user confirms.
/// [destructive] colours the confirm label as a danger action; [dimBody]
/// sets the body in the muted ink colour.
Future<bool> confirmDialog(
  BuildContext context, {
  required String title,
  required String body,
  required String confirmLabel,
  bool destructive = false,
  bool dimBody = false,
}) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: AppColors.surfaceRaised,
      title: Text(title),
      content: Text(
        body,
        style: dimBody ? const TextStyle(color: AppColors.inkDim) : null,
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('Cancel'),
        ),
        TextButton(
          onPressed: () => Navigator.pop(ctx, true),
          child: Text(
            confirmLabel,
            style: destructive
                ? const TextStyle(color: AppColors.danger)
                : null,
          ),
        ),
      ],
    ),
  );
  return confirmed == true;
}
