// Mechanical architecture checks for app/lib (harness engineering).
// Run from repo root: dart run scripts/check_architecture.dart
//
// Rules:
// 1. No cross-feature imports of *_screen.dart
// 2. domain/ must not import presentation/
// 3. domain/ must not import package:dio or package:supabase_flutter
// 4. File size hard fail > 600 lines (warn > 400)

import 'dart:io';

final _importRe = RegExp(r'''^import\s+['"]([^'"]+)['"]''');
const _libRoot = 'app/lib';
const _warnLines = 400;
const _failLines = 600;

void main(List<String> args) {
  final lib = Directory(_libRoot);
  if (!lib.existsSync()) {
    stderr.writeln('FAIL: $_libRoot not found (run from repo root)');
    exit(1);
  }

  final errors = <String>[];
  final warnings = <String>[];
  final dartFiles = lib
      .listSync(recursive: true)
      .whereType<File>()
      .where((f) => f.path.endsWith('.dart'))
      .toList();

  for (final file in dartFiles) {
    final rel = file.path.replaceAll('\\', '/');
    final lines = file.readAsLinesSync();
    final lineCount = lines.length;

    if (lineCount > _failLines) {
      errors.add(
        '$rel: $lineCount lines exceeds hard limit $_failLines. '
        'Split the file or extract helpers (ARCHITECTURE.md soft/hard size rules).',
      );
    } else if (lineCount > _warnLines) {
      warnings.add('$rel: $lineCount lines (soft limit $_warnLines)');
    }

    final isDomain = rel.contains('/domain/');
    final featureOfFile = _featureName(rel);

    for (var i = 0; i < lines.length; i++) {
      final m = _importRe.firstMatch(lines[i].trim());
      if (m == null) continue;
      final uri = m.group(1)!;

      if (isDomain) {
        if (uri.contains('/presentation/') || uri.endsWith('/presentation')) {
          errors.add(
            '$rel:${i + 1}: domain must not import presentation ($uri). '
            'Keep domain pure — move UI deps out (ARCHITECTURE.md).',
          );
        }
        if (uri == 'package:dio/dio.dart' ||
            uri.startsWith('package:dio/') ||
            uri == 'package:supabase_flutter/supabase_flutter.dart' ||
            uri.startsWith('package:supabase_flutter/')) {
          errors.add(
            '$rel:${i + 1}: domain must not import $uri. '
            'Use core/data layers for HTTP and auth clients.',
          );
        }
      }

      // Cross-feature screen imports (relative or package:…/features/…/*_screen.dart).
      if (uri.endsWith('_screen.dart') &&
          featureOfFile != null &&
          rel.contains('/features/')) {
        final importedFeature = uri.startsWith('package:')
            ? _featureFromPackageImport(uri)
            : _featureFromImport(uri, rel);
        if (importedFeature != null && importedFeature != featureOfFile) {
          errors.add(
            '$rel:${i + 1}: cross-feature screen import of $uri '
            '(from feature "$featureOfFile" → "$importedFeature"). '
            'Extract shared providers/widgets; do not import other features\' '
            '*_screen.dart (ARCHITECTURE.md).',
          );
        }
      }
    }
  }

  for (final w in warnings) {
    stdout.writeln('WARN: $w');
  }
  if (errors.isNotEmpty) {
    for (final e in errors) {
      stderr.writeln('FAIL: $e');
    }
    stderr.writeln(
      '\nArchitecture check failed (${errors.length} error(s)). '
      'See ARCHITECTURE.md.',
    );
    exit(1);
  }

  stdout.writeln(
    'Architecture checks passed '
    '(${dartFiles.length} files, ${warnings.length} warning(s)).',
  );
}

String? _featureName(String relPath) {
  // app/lib/features/<name>/...
  final parts = relPath.split('/');
  final idx = parts.indexOf('features');
  if (idx < 0 || idx + 1 >= parts.length) return null;
  return parts[idx + 1];
}

String? _featureFromImport(String uri, String fromFile) {
  if (uri.startsWith('package:')) return _featureFromPackageImport(uri);

  // Resolve relative URI against fromFile directory.
  final fromDir = fromFile.contains('/')
      ? fromFile.substring(0, fromFile.lastIndexOf('/'))
      : '.';
  final segments = <String>[...fromDir.split('/'), ...uri.split('/')];
  final resolved = <String>[];
  for (final s in segments) {
    if (s == '.' || s.isEmpty) continue;
    if (s == '..') {
      if (resolved.isNotEmpty) resolved.removeLast();
      continue;
    }
    resolved.add(s);
  }
  final path = resolved.join('/');
  return _featureName(path);
}

/// package:tours360/features/<name>/... or any package path containing /features/.
String? _featureFromPackageImport(String uri) {
  if (!uri.startsWith('package:')) return null;
  final path = uri.substring('package:'.length); // tours360/features/foo/...
  final slash = path.indexOf('/');
  if (slash < 0) return null;
  final rest = path.substring(slash + 1); // features/foo/...
  return _featureName('app/lib/$rest');
}
