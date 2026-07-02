import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Images, Eye, TrendingUp, HardDrive, Plus, ArrowRight, Clock } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Skeleton,
  Progress,
} from '@/components/ui';
import { toursApi } from '@/api';
import { useAuthStore } from '@/stores';
import { ROUTES, QUERY_KEYS } from '@/constants';
import { formatBytes, formatCompactNumber, formatRelativeTime } from '@/utils/format';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export function DashboardPage() {
  const { user } = useAuthStore();

  // Fetch dashboard stats
  const {
    data: stats,
    isLoading: isLoadingStats,
    isError: isStatsError,
    refetch: refetchStats,
  } = useQuery({
    queryKey: [QUERY_KEYS.DASHBOARD_STATS],
    queryFn: () => toursApi.getDashboardStats(),
  });

  // Fetch recent tours
  const {
    data: toursData,
    isLoading: isLoadingTours,
    isError: isToursError,
    refetch: refetchTours,
  } = useQuery({
    queryKey: [QUERY_KEYS.TOURS, 'recent', { limit: 5 }],
    queryFn: () => toursApi.getTours({ limit: 5 }),
  });

  // Fetch realtime stats (includes recent daily views)
  const {
    data: realtimeStats,
    isLoading: isLoadingRealtime,
    isError: realtimeError,
    refetch: refetchRealtime,
  } = useQuery({
    queryKey: [QUERY_KEYS.DASHBOARD_REALTIME],
    queryFn: () => toursApi.getDashboardRealtime(),
  });

  const recentTours = toursData?.items || [];
  const viewsData = realtimeStats?.recent_views || [];

  if (isStatsError) {
    return (
      <div className="animate-fade-in">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <TrendingUp className="h-10 w-10 text-[var(--color-text-muted)]" />
            <div>
              <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
                Dashboard could not load
              </h1>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Refresh the dashboard stats or create a tour from the tours page.
              </p>
            </div>
            <Button type="button" onClick={() => void refetchStats()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Welcome Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            Welcome back, {user?.full_name?.split(' ')[0] || 'there'}!
          </h1>
          <p className="mt-1 text-[var(--color-text-muted)]">
            Here's what's happening with your tours today.
          </p>
        </div>
        <Link to={ROUTES.TOUR_CREATE}>
          <Button>
            <Plus className="h-4 w-4" />
            Create Tour
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Tours"
          value={stats?.total_tours ?? 0}
          icon={Images}
          isLoading={isLoadingStats}
        />
        <StatsCard
          title="Published Tours"
          value={stats?.published_tours ?? 0}
          icon={TrendingUp}
          isLoading={isLoadingStats}
        />
        <StatsCard
          title="Total Views"
          value={formatCompactNumber(stats?.total_views ?? 0)}
          icon={Eye}
          isLoading={isLoadingStats}
        />
        <StatsCard
          title="Storage Used"
          value={formatBytes(stats?.storage_used ?? 0)}
          subtitle={`of ${formatBytes(stats?.storage_limit ?? 0)}`}
          icon={HardDrive}
          isLoading={isLoadingStats}
        />
      </div>

      {/* Storage Progress */}
      {stats && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Storage Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress
              value={
                stats.storage_limit > 0
                  ? Math.min(100, (stats.storage_used / stats.storage_limit) * 100)
                  : 0
              }
              className="h-2"
            />
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              {formatBytes(stats.storage_used)} of{' '}
              {stats.storage_limit > 0 ? formatBytes(stats.storage_limit) : 'Unlimited'} used
            </p>
          </CardContent>
        </Card>
      )}

      {/* Chart and Recent Tours */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Views Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Views This Week</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              {isLoadingRealtime ? (
                <Skeleton className="h-full w-full" />
              ) : realtimeError ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Views data could not load.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void refetchRealtime()}
                  >
                    Try again
                  </Button>
                </div>
              ) : viewsData.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <Eye className="h-8 w-8 text-[var(--color-text-muted)]" />
                  <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                    No views recorded yet
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={viewsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis
                      dataKey="date"
                      stroke="var(--color-text-muted)"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="var(--color-text-muted)"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--color-surface-elevated)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '8px',
                      }}
                      labelFormatter={value =>
                        new Date(value).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="views"
                      stroke="var(--color-primary-600)"
                      strokeWidth={2}
                      dot={{ fill: 'var(--color-primary-600)', strokeWidth: 0, r: 4 }}
                      activeDot={{ r: 6, fill: 'var(--color-primary-600)' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Tours */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Tours</CardTitle>
            <Link
              to={ROUTES.TOURS}
              className="text-sm font-medium text-[var(--color-primary-600)] hover:underline"
            >
              View all
              <ArrowRight className="ml-1 inline h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent>
            {isLoadingTours ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : isToursError ? (
              <div className="py-8 text-center">
                <Images className="mx-auto h-12 w-12 text-[var(--color-text-muted)]" />
                <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                  Recent tours could not load.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => void refetchTours()}
                >
                  Try again
                </Button>
              </div>
            ) : recentTours.length === 0 ? (
              <div className="py-8 text-center">
                <Images className="mx-auto h-12 w-12 text-[var(--color-text-muted)]" />
                <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                  Create your first tour to start uploading panoramas.
                </p>
                <Link to={ROUTES.TOUR_CREATE}>
                  <Button variant="outline" size="sm" className="mt-4">
                    Create your first tour
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {recentTours.map(tour => (
                  <Link
                    key={tour.id}
                    to={`/tours/${tour.id}`}
                    className="flex items-center gap-4 rounded-lg p-3 transition-colors hover:bg-[var(--color-surface)]"
                  >
                    <div className="h-12 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-[var(--color-surface)]">
                      {tour.thumbnail_url ? (
                        <img
                          src={tour.thumbnail_url}
                          alt={tour.title}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Images className="h-6 w-6 text-[var(--color-text-muted)]" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate font-medium text-[var(--color-text-primary)]">
                        {tour.title}
                      </h4>
                      <div className="mt-1 flex items-center gap-3 text-sm text-[var(--color-text-muted)]">
                        <span className="flex items-center gap-1">
                          <Eye className="h-3.5 w-3.5" />
                          {formatCompactNumber(tour.view_count)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatRelativeTime(tour.updated_at)}
                        </span>
                      </div>
                    </div>
                    <Badge variant={tour.status === 'published' ? 'success' : 'secondary'}>
                      {tour.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Stats Card Component
interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  isLoading?: boolean;
}

function StatsCard({ title, value, subtitle, icon: Icon, isLoading }: StatsCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-50)]">
          <Icon className="h-6 w-6 text-[var(--color-primary-600)]" />
        </div>
        <div>
          <p className="text-sm text-[var(--color-text-muted)]">{title}</p>
          {isLoading ? (
            <Skeleton className="mt-1 h-7 w-16" />
          ) : (
            <p className="text-2xl font-bold text-[var(--color-text-primary)]">{value}</p>
          )}
          {subtitle && <p className="text-xs text-[var(--color-text-muted)]">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
