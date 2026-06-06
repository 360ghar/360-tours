import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Eye,
  Heart,
  Clock,
  Monitor,
  ArrowRight,
  Download,
  TrendingUp,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Skeleton,
} from '@/components/ui';
import { toursApi } from '@/api';
import { ROUTES, QUERY_KEYS } from '@/constants';
import { formatCompactNumber } from '@/utils/format';
import { downloadAnalyticsCSV } from '@/utils/analytics';
import type { Tour, TourAnalytics } from '@/types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';

const DEVICE_COLORS = ['var(--color-primary-500)', 'var(--color-success-500)', 'var(--color-warning-500)', 'var(--color-info-500)'];

export function AnalyticsPage() {
  const [selectedTourId, setSelectedTourId] = useState<string | null>(null);

  // Fetch all tours to list them
  const { data: toursData, isLoading: isLoadingTours } = useQuery({
    queryKey: [QUERY_KEYS.TOURS, { page: 1, page_size: 50, status: 'published' }],
    queryFn: () => toursApi.getTours({ page: 1, page_size: 50, status: 'published' }),
  });

  // Fetch dashboard stats for overview
  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: [QUERY_KEYS.DASHBOARD_STATS],
    queryFn: () => toursApi.getDashboardStats(),
  });

  const tours = toursData?.items || [];

  // Fetch analytics for the selected tour
  const { data: selectedAnalytics, isLoading: isLoadingAnalytics } = useQuery({
    queryKey: [QUERY_KEYS.ANALYTICS, selectedTourId],
    queryFn: () => toursApi.getTourAnalytics(selectedTourId!),
    enabled: !!selectedTourId,
  });

  const selectedTour = tours.find((t) => t.id === selectedTourId);

  // Auto-select first tour if none selected
  useEffect(() => {
    if (!selectedTourId && tours.length > 0 && !isLoadingTours) {
      setSelectedTourId(tours[0].id);
    }
  }, [selectedTourId, tours, isLoadingTours, setSelectedTourId]);

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Analytics</h1>
        <p className="mt-1 text-[var(--color-text-muted)]">
          Track performance across all your published tours
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <OverviewCard
          title="Published Tours"
          value={stats?.published_tours ?? 0}
          icon={TrendingUp}
          isLoading={isLoadingStats}
        />
        <OverviewCard
          title="Total Views"
          value={formatCompactNumber(stats?.total_views ?? 0)}
          icon={Eye}
          isLoading={isLoadingStats}
        />
        <OverviewCard
          title="Total Scenes"
          value={stats?.total_scenes ?? 0}
          icon={BarChart3}
          isLoading={isLoadingStats}
        />
        <OverviewCard
          title="Total Tours"
          value={stats?.total_tours ?? 0}
          icon={Monitor}
          isLoading={isLoadingStats}
        />
      </div>

      {/* Tour Selector + Analytics */}
      {isLoadingTours ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[300px] w-full" />
        </div>
      ) : tours.length === 0 ? (
        <Card className="py-16">
          <CardContent className="text-center">
            <BarChart3 className="mx-auto h-16 w-16 text-[var(--color-text-muted)]" />
            <h3 className="mt-4 text-lg font-semibold text-[var(--color-text-primary)]">
              No published tours yet
            </h3>
            <p className="mt-2 text-[var(--color-text-muted)]">
              Publish a tour to start tracking analytics.
            </p>
            <Link to={ROUTES.TOURS}>
              <Button className="mt-6">
                Go to Tours
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Tour Selector */}
          <div className="flex items-center gap-4">
            <select
              value={selectedTourId || ''}
              onChange={(e) => setSelectedTourId(e.target.value)}
              className="h-10 min-w-[250px] rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)]"
            >
              {tours.map((tour) => (
                <option key={tour.id} value={tour.id}>
                  {tour.title} ({formatCompactNumber(tour.view_count)} views)
                </option>
              ))}
            </select>
            {selectedTourId && (
              <Link
                to={`/tours/${selectedTourId}/analytics`}
                className="text-sm font-medium text-[var(--color-primary-600)] hover:underline"
              >
                Detailed View <ArrowRight className="ml-1 inline h-3 w-3" />
              </Link>
            )}
            {selectedAnalytics && selectedTour && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadAnalyticsCSV(selectedAnalytics, selectedTour.title)}
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            )}
          </div>

          {/* Tour Analytics Detail */}
          {isLoadingAnalytics ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <Skeleton className="h-[300px]" />
              <Skeleton className="h-[300px]" />
            </div>
          ) : selectedAnalytics ? (
            <TourAnalyticsDetail analytics={selectedAnalytics} tour={selectedTour!} />
          ) : null}

          {/* Tour Comparison Table */}
          <Card>
            <CardHeader>
              <CardTitle>Tour Performance Comparison</CardTitle>
              <CardDescription>
                Compare metrics across all your published tours
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      <th className="pb-3 text-left font-medium text-[var(--color-text-muted)]">Tour</th>
                      <th className="pb-3 text-right font-medium text-[var(--color-text-muted)]">Views</th>
                      <th className="pb-3 text-right font-medium text-[var(--color-text-muted)]">Likes</th>
                      <th className="pb-3 text-right font-medium text-[var(--color-text-muted)]">Shares</th>
                      <th className="pb-3 text-right font-medium text-[var(--color-text-muted)]">Scenes</th>
                      <th className="pb-3 text-right font-medium text-[var(--color-text-muted)]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tours.map((tour) => (
                      <TourRow key={tour.id} tour={tour} isSelected={tour.id === selectedTourId} onSelect={() => setSelectedTourId(tour.id)} />
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function TourAnalyticsDetail({ analytics, tour }: { analytics: TourAnalytics; tour: Tour }) {
  const deviceData = analytics.device_breakdown
    ? [
        { name: 'Desktop', value: analytics.device_breakdown.desktop || 0 },
        { name: 'Mobile', value: analytics.device_breakdown.mobile || 0 },
        { name: 'Tablet', value: analytics.device_breakdown.tablet || 0 },
        { name: 'VR', value: analytics.device_breakdown.vr || 0 },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={Eye} label="Total Views" value={formatCompactNumber(analytics.total_views)} />
        <MetricCard icon={Eye} label="Unique Views" value={formatCompactNumber(analytics.unique_views)} />
        <MetricCard icon={Heart} label="Likes" value={formatCompactNumber(analytics.total_likes)} />
        <MetricCard icon={Clock} label="Avg Duration" value={`${Math.round(analytics.avg_session_duration)}s`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Daily Views Chart */}
        {analytics.daily_views && analytics.daily_views.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daily Views — {tour.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics.daily_views}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="date" stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--color-surface-elevated)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Line type="monotone" dataKey="views" stroke="var(--color-primary-600)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Device Breakdown */}
        {deviceData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Device Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px] flex items-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={deviceData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={4}
                      dataKey="value"
                      label={({ name, percent }) => `${name ?? 'Unknown'} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    >
                      {deviceData.map((_, index) => (
                        <Cell key={index} fill={DEVICE_COLORS[index % DEVICE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top Scenes */}
        {analytics.scene_views && Object.keys(analytics.scene_views).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Scene Views</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={Object.entries(analytics.scene_views).map(([id, views]) => ({ scene: id.slice(0, 8), views }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="scene" stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--color-surface-elevated)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="views" fill="var(--color-primary-500)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Country Breakdown */}
        {analytics.country_breakdown && Object.keys(analytics.country_breakdown).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Countries</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(analytics.country_breakdown)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 8)
                  .map(([country, views]) => {
                    const maxViews = Math.max(...Object.values(analytics.country_breakdown));
                    return (
                      <div key={country} className="flex items-center gap-3">
                        <span className="w-24 truncate text-sm text-[var(--color-text-primary)]">{country}</span>
                        <div className="flex-1">
                          <div className="h-2 rounded-full bg-[var(--color-surface)]">
                            <div
                              className="h-2 rounded-full bg-[var(--color-primary-500)]"
                              style={{ width: `${(views / maxViews) * 100}%` }}
                            />
                          </div>
                        </div>
                        <span className="w-12 text-right text-sm text-[var(--color-text-muted)]">{formatCompactNumber(views)}</span>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function OverviewCard({ title, value, icon: Icon, isLoading }: { title: string; value: string | number; icon: React.ComponentType<{ className?: string }>; isLoading?: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-50)]">
          <Icon className="h-6 w-6 text-[var(--color-primary-600)]" />
        </div>
        <div>
          <p className="text-sm text-[var(--color-text-muted)]">{title}</p>
          {isLoading ? <Skeleton className="mt-1 h-7 w-16" /> : <p className="text-2xl font-bold text-[var(--color-text-primary)]">{value}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4">
      <Icon className="h-5 w-5 text-[var(--color-primary-600)]" />
      <div>
        <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
        <p className="text-lg font-semibold text-[var(--color-text-primary)]">{value}</p>
      </div>
    </div>
  );
}

function TourRow({ tour, isSelected, onSelect }: { tour: Tour; isSelected: boolean; onSelect: () => void }) {
  return (
    <tr
      className={`cursor-pointer border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-surface)] ${isSelected ? 'bg-[var(--color-primary-50)]' : ''}`}
      onClick={onSelect}
    >
      <td className="py-3 pr-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-12 flex-shrink-0 overflow-hidden rounded bg-[var(--color-surface)]">
            {tour.thumbnail_url ? (
              <img src={tour.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[var(--color-surface-elevated)]">
                <BarChart3 className="h-4 w-4 text-[var(--color-text-muted)]" />
              </div>
            )}
          </div>
          <span className="truncate font-medium text-[var(--color-text-primary)]">{tour.title}</span>
        </div>
      </td>
      <td className="py-3 text-right text-[var(--color-text-secondary)]">{formatCompactNumber(tour.view_count)}</td>
      <td className="py-3 text-right text-[var(--color-text-secondary)]">{formatCompactNumber(tour.like_count)}</td>
      <td className="py-3 text-right text-[var(--color-text-secondary)]">{formatCompactNumber(tour.share_count)}</td>
      <td className="py-3 text-right text-[var(--color-text-secondary)]">{tour.scene_count || 0}</td>
      <td className="py-3 text-right">
        <Link
          to={`/tours/${tour.id}/analytics`}
          className="text-xs font-medium text-[var(--color-primary-600)] hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Details
        </Link>
      </td>
    </tr>
  );
}
