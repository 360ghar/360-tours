/**
 * Analytics Export Utilities
 * Functions for exporting analytics data to various formats
 */

import { format } from 'date-fns';
import type { TourAnalytics } from '@/types';

interface ExportOptions {
  filename?: string;
  dateRange?: { from: Date; to: Date };
}

/**
 * Escape a value for CSV output.
 * Wraps in quotes if the value contains commas, quotes, or newlines.
 */
function escapeCsvValue(value: string | number): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert analytics data to CSV format
 */
export function analyticsToCSV(analytics: TourAnalytics, tourTitle: string): string {
  const lines: string[] = [];

  // Summary section
  lines.push('360 Tour Analytics Report');
  lines.push(`Tour: ${tourTitle}`);
  lines.push(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`);
  lines.push('');

  // Overview metrics
  lines.push('=== Overview ===');
  lines.push('Metric,Value');
  lines.push(`Total Views,${analytics.total_views}`);
  lines.push(`Unique Views,${analytics.unique_views}`);
  lines.push(`Total Likes,${analytics.total_likes}`);
  lines.push(`Total Shares,${analytics.total_shares}`);
  lines.push(`Avg Session Duration (seconds),${Math.round(analytics.avg_session_duration)}`);
  lines.push('');

  // Device breakdown
  lines.push('=== Device Breakdown ===');
  lines.push('Device,Count');
  if (analytics.device_breakdown) {
    lines.push(`Desktop,${analytics.device_breakdown.desktop || 0}`);
    lines.push(`Mobile,${analytics.device_breakdown.mobile || 0}`);
    lines.push(`Tablet,${analytics.device_breakdown.tablet || 0}`);
    lines.push(`VR,${analytics.device_breakdown.vr || 0}`);
  }
  lines.push('');

  // Daily views
  if (analytics.daily_views && analytics.daily_views.length > 0) {
    lines.push('=== Daily Views ===');
    lines.push('Date,Views');
    analytics.daily_views.forEach((day) => {
      lines.push(`${escapeCsvValue(day.date)},${day.views}`);
    });
    lines.push('');
  }

  // Scene views
  if (analytics.scene_views && Object.keys(analytics.scene_views).length > 0) {
    lines.push('=== Scene Views ===');
    lines.push('Scene ID,Views');
    Object.entries(analytics.scene_views).forEach(([sceneId, views]) => {
      lines.push(`${escapeCsvValue(sceneId)},${views}`);
    });
    lines.push('');
  }

  // Hotspot clicks
  if (analytics.hotspot_clicks && Object.keys(analytics.hotspot_clicks).length > 0) {
    lines.push('=== Hotspot Clicks ===');
    lines.push('Hotspot ID,Clicks');
    Object.entries(analytics.hotspot_clicks).forEach(([hotspotId, clicks]) => {
      lines.push(`${escapeCsvValue(hotspotId)},${clicks}`);
    });
    lines.push('');
  }

  // Country breakdown
  if (analytics.country_breakdown && Object.keys(analytics.country_breakdown).length > 0) {
    lines.push('=== Geographic Distribution ===');
    lines.push('Country,Views');
    Object.entries(analytics.country_breakdown)
      .sort(([, a], [, b]) => b - a)
      .forEach(([country, views]) => {
        lines.push(`${escapeCsvValue(country)},${views}`);
      });
  }

  return lines.join('\n');
}

/**
 * Download analytics as CSV file
 */
export function downloadAnalyticsCSV(
  analytics: TourAnalytics,
  tourTitle: string,
  options: ExportOptions = {}
): void {
  const csv = analyticsToCSV(analytics, tourTitle);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const filename = options.filename || `${tourTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_analytics_${format(new Date(), 'yyyy-MM-dd')}.csv`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Convert analytics data to JSON format for export
 */
export function analyticsToJSON(analytics: TourAnalytics, tourTitle: string): string {
  const exportData = {
    report: {
      tour_title: tourTitle,
      generated_at: new Date().toISOString(),
    },
    analytics: {
      overview: {
        total_views: analytics.total_views,
        unique_views: analytics.unique_views,
        total_likes: analytics.total_likes,
        total_shares: analytics.total_shares,
        avg_session_duration: analytics.avg_session_duration,
      },
      device_breakdown: analytics.device_breakdown,
      daily_views: analytics.daily_views,
      scene_views: analytics.scene_views,
      hotspot_clicks: analytics.hotspot_clicks,
      country_breakdown: analytics.country_breakdown,
    },
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Download analytics as JSON file
 */
export function downloadAnalyticsJSON(
  analytics: TourAnalytics,
  tourTitle: string,
  options: ExportOptions = {}
): void {
  const json = analyticsToJSON(analytics, tourTitle);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const filename = options.filename || `${tourTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_analytics_${format(new Date(), 'yyyy-MM-dd')}.json`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format date range for display
 */
export function formatDateRange(from: Date, to: Date): string {
  if (format(from, 'yyyy') === format(to, 'yyyy')) {
    return `${format(from, 'MMM d')} - ${format(to, 'MMM d, yyyy')}`;
  }
  return `${format(from, 'MMM d, yyyy')} - ${format(to, 'MMM d, yyyy')}`;
}

/**
 * Calculate percentage change between two values
 */
export function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// Re-export formatDuration from format utils for backwards compatibility
export { formatDuration } from './format';
