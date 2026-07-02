import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { DateRange } from 'react-day-picker';
import {
  ArrowLeft,
  Download,
  TrendingUp,
  TrendingDown,
  Eye,
  Users,
  Clock,
  Share2,
  ChevronDown,
  FileJson,
  FileSpreadsheet,
  AlertCircle,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  PageLoader,
  DateRangePicker,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  Badge,
} from '@/components/ui';
import { toursApi } from '@/api';
import { QUERY_KEYS, ROUTES } from '@/constants';
import { formatCompactNumber } from '@/utils/format';
import { downloadAnalyticsCSV, downloadAnalyticsJSON, formatDuration } from '@/utils/analytics';
import { useToast } from '@/hooks/useToast';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';

const COLORS = [
  'var(--color-primary-500, #3b82f6)',
  'var(--color-success-500, #22c55e)',
  'var(--color-warning-500, #eab308)',
  'var(--color-error-500, #ef4444)',
];

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  change?: number;
  changeLabel?: string;
}

function StatCard({ title, value, icon: Icon, change, changeLabel }: StatCardProps) {
  const isPositive = change !== undefined && change >= 0;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary-100)]">
            <Icon className="h-5 w-5 text-[var(--color-primary-600)]" />
          </div>
          {change !== undefined && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant={isPositive ? 'success' : 'destructive'} className="text-xs">
                    {isPositive ? (
                      <TrendingUp className="mr-1 h-3 w-3" />
                    ) : (
                      <TrendingDown className="mr-1 h-3 w-3" />
                    )}
                    {Math.abs(change)}%
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{changeLabel || 'vs previous period'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="mt-4">
          <p className="text-sm text-[var(--color-text-muted)]">{title}</p>
          <p className="mt-1 text-3xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function TourAnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  // Default to last 30 days
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });

  const {
    data: tour,
    isLoading: isLoadingTour,
    isError: isTourError,
    error: tourError,
    refetch: refetchTour,
    isFetching: isFetchingTour,
  } = useQuery({
    queryKey: [QUERY_KEYS.TOUR, id],
    queryFn: () => toursApi.getTour(id!),
    enabled: !!id,
  });

  const { data: scenes } = useQuery({
    queryKey: [QUERY_KEYS.SCENES, id],
    queryFn: () => toursApi.getScenes(id!),
    enabled: !!id,
  });

  const {
    data: analytics,
    isLoading: isLoadingAnalytics,
    isError: isAnalyticsError,
    error: analyticsError,
    refetch: refetchAnalytics,
    isFetching: isFetchingAnalytics,
  } = useQuery({
    queryKey: [QUERY_KEYS.ANALYTICS, id, dateRange?.from, dateRange?.to],
    queryFn: () =>
      toursApi.getTourAnalytics(id!, {
        start_date: dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
        end_date: dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined,
      }),
    enabled: !!id,
  });

  const [heatmapSceneId, setHeatmapSceneId] = useState<string | undefined>();

  const { data: heatmapData } = useQuery({
    queryKey: [QUERY_KEYS.ANALYTICS, id, 'heatmap', heatmapSceneId, dateRange?.from, dateRange?.to],
    queryFn: () =>
      toursApi.getTourHeatmap(id!, {
        scene_id: heatmapSceneId,
        start_date: dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
        end_date: dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined,
      }),
    enabled: !!id,
  });

  const sceneViews = analytics?.scene_views;
  const hotspotClicks = analytics?.hotspot_clicks;
  const deviceBreakdown = analytics?.device_breakdown;
  const dailyViews = analytics?.daily_views;
  const countryBreakdown = analytics?.country_breakdown;

  // Process scene performance data
  const scenePerformanceData = useMemo(() => {
    if (!sceneViews || !scenes) return [];

    return scenes
      .map(scene => ({
        name: scene.title || `Scene ${scene.order_index + 1}`,
        views: sceneViews[scene.id] ?? 0,
        id: scene.id,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10); // Top 10 scenes
  }, [sceneViews, scenes]);

  // Process hotspot click data
  const hotspotPerformanceData = useMemo(() => {
    if (!hotspotClicks || !scenes) return [];

    const hotspotMap = new Map<string, { title: string; clicks: number }>();
    scenes.forEach(scene => {
      scene.hotspots?.forEach(hotspot => {
        const clicks = hotspotClicks[hotspot.id] ?? 0;
        if (clicks > 0) {
          hotspotMap.set(hotspot.id, {
            title: hotspot.title || `${hotspot.type} hotspot`,
            clicks,
          });
        }
      });
    });

    return Array.from(hotspotMap.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10);
  }, [hotspotClicks, scenes]);

  // Process device data for pie chart
  const deviceData = useMemo(() => {
    if (!deviceBreakdown) {
      return [
        { name: 'Desktop', value: 0 },
        { name: 'Mobile', value: 0 },
        { name: 'Tablet', value: 0 },
        { name: 'VR', value: 0 },
      ];
    }

    return Object.entries(deviceBreakdown)
      .map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value: value as number,
      }))
      .filter(d => d.value > 0);
  }, [deviceBreakdown]);

  // Process daily views data
  const dailyViewsData = useMemo(() => {
    if (!dailyViews || dailyViews.length === 0) {
      // Generate empty data for the date range
      const data: { date: string; views: number }[] = [];
      if (dateRange?.from && dateRange?.to) {
        const current = new Date(dateRange.from);
        while (current <= dateRange.to) {
          data.push({
            date: format(current, 'yyyy-MM-dd'),
            views: 0,
          });
          current.setDate(current.getDate() + 1);
        }
      }
      return data;
    }
    return dailyViews;
  }, [dailyViews, dateRange]);

  // Country data for geographic distribution
  const countryData = useMemo(() => {
    if (!countryBreakdown) return [];

    return Object.entries(countryBreakdown)
      .map(([country, views]) => ({
        country,
        views: views as number,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);
  }, [countryBreakdown]);

  const hasAnalyticsData = Boolean(
    analytics &&
    (analytics.total_views > 0 ||
      analytics.unique_views > 0 ||
      analytics.total_likes > 0 ||
      analytics.total_shares > 0 ||
      analytics.avg_session_duration > 0 ||
      dailyViewsData.some(day => day.views > 0) ||
      scenePerformanceData.some(scene => scene.views > 0) ||
      hotspotPerformanceData.length > 0 ||
      deviceData.length > 0 ||
      countryData.length > 0)
  );

  const handleExportCSV = () => {
    if (!analytics || !tour) return;
    downloadAnalyticsCSV(analytics, tour.title);
    toast('success', 'Analytics exported as CSV.', { title: 'Export complete' });
  };

  const handleExportJSON = () => {
    if (!analytics || !tour) return;
    downloadAnalyticsJSON(analytics, tour.title);
    toast('success', 'Analytics exported as JSON.', { title: 'Export complete' });
  };

  if (isLoadingTour || isLoadingAnalytics) {
    return <PageLoader message="Loading analytics..." />;
  }

  if (isTourError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="mb-4 h-12 w-12 text-[var(--color-error-500)]" />
        <h2 className="text-xl font-semibold">Tour could not be loaded</h2>
        <p className="mt-2 max-w-md text-sm text-[var(--color-text-muted)]">
          {tourError instanceof Error
            ? tourError.message
            : 'Try again or return to your tour list.'}
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" onClick={() => void refetchTour()} disabled={isFetchingTour}>
            Retry
          </Button>
          <Link to={ROUTES.TOURS}>
            <Button variant="outline">Back to Tours</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!tour) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <h2 className="text-xl font-semibold">Tour not found</h2>
        <Link to={ROUTES.TOURS}>
          <Button variant="outline" className="mt-4">
            Back to Tours
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link to={`/tours/${id}`}>
            <Button variant="ghost" size="icon" aria-label="Back to tour">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
              Analytics: {tour.title}
            </h1>
            <p className="text-[var(--color-text-muted)]">
              Track performance and engagement metrics
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker value={dateRange} onChange={setDateRange} presets />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={!analytics || isAnalyticsError}>
                <Download className="h-4 w-4" />
                Export
                <ChevronDown className="ml-1 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Export Format</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleExportCSV}>
                <FileSpreadsheet className="h-4 w-4" />
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportJSON}>
                <FileJson className="h-4 w-4" />
                Export as JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isAnalyticsError && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-[var(--color-error-500)]" />
              <div>
                <p className="font-medium text-[var(--color-text-primary)]">
                  Analytics could not be loaded
                </p>
                <p className="text-sm text-[var(--color-text-muted)]">
                  {analyticsError instanceof Error
                    ? analyticsError.message
                    : 'Try again to refresh this date range.'}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetchAnalytics()}
              disabled={isFetchingAnalytics}
            >
              Retry analytics
            </Button>
          </CardContent>
        </Card>
      )}

      {!isAnalyticsError && !hasAnalyticsData && (
        <Card>
          <CardContent className="p-6 text-center">
            <Eye className="mx-auto h-10 w-10 text-[var(--color-text-muted)]" />
            <h3 className="mt-3 font-semibold text-[var(--color-text-primary)]">
              No analytics in this range
            </h3>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Choose a wider date range or share the published tour to start collecting engagement.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      {!isAnalyticsError && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Views"
            value={formatCompactNumber(analytics?.total_views ?? tour.view_count)}
            icon={Eye}
          />
          <StatCard
            title="Unique Visitors"
            value={formatCompactNumber(analytics?.unique_views ?? 0)}
            icon={Users}
          />
          <StatCard
            title="Avg. Session"
            value={formatDuration(analytics?.avg_session_duration ?? 0)}
            icon={Clock}
          />
          <StatCard
            title="Total Shares"
            value={formatCompactNumber(analytics?.total_shares ?? tour.share_count)}
            icon={Share2}
          />
        </div>
      )}

      {/* Views Over Time Chart */}
      {!isAnalyticsError && (
        <Card>
          <CardHeader>
            <CardTitle>Views Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyViewsData}>
                  <defs>
                    <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-primary-500)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-primary-500)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="date"
                    stroke="var(--color-text-muted)"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={value =>
                      new Date(value).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })
                    }
                  />
                  <YAxis
                    stroke="var(--color-text-muted)"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-surface-elevated)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                    }}
                    labelFormatter={value =>
                      new Date(value).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="views"
                    stroke="var(--color-primary-600)"
                    strokeWidth={2}
                    fill="url(#viewsGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Two Column Charts */}
      {!isAnalyticsError && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Device Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Device Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                {deviceData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={deviceData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }: { name?: string; percent?: number }) =>
                          `${name ?? 'Unknown'} ${((percent ?? 0) * 100).toFixed(0)}%`
                        }
                        labelLine={false}
                      >
                        {deviceData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: 'var(--color-surface-elevated)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '8px',
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]">
                    No device data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Geographic Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Top Countries</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                {countryData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={countryData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis type="number" stroke="var(--color-text-muted)" fontSize={12} />
                      <YAxis
                        dataKey="country"
                        type="category"
                        stroke="var(--color-text-muted)"
                        fontSize={12}
                        width={80}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: 'var(--color-surface-elevated)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar dataKey="views" fill="var(--color-primary-500)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]">
                    No geographic data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Scene Performance */}
      {!isAnalyticsError && (
        <Card>
          <CardHeader>
            <CardTitle>Scene Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {scenePerformanceData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scenePerformanceData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis type="number" stroke="var(--color-text-muted)" fontSize={12} />
                    <YAxis
                      dataKey="name"
                      type="category"
                      stroke="var(--color-text-muted)"
                      fontSize={12}
                      width={120}
                      tickFormatter={value =>
                        value.length > 15 ? `${value.slice(0, 15)}...` : value
                      }
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: 'var(--color-surface-elevated)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="views" fill="var(--color-primary-600)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]">
                  No scene data available yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hotspot Engagement */}
      {!isAnalyticsError && hotspotPerformanceData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Hotspot Engagement</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hotspotPerformanceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="title"
                    stroke="var(--color-text-muted)"
                    fontSize={12}
                    tickFormatter={value =>
                      value.length > 10 ? `${value.slice(0, 10)}...` : value
                    }
                  />
                  <YAxis stroke="var(--color-text-muted)" fontSize={12} />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-surface-elevated)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="clicks" fill="var(--color-secondary-500)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Interaction Heatmap */}
      {!isAnalyticsError && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Interaction Heatmap</CardTitle>
            {scenes && scenes.length > 0 && (
              <select
                value={heatmapSceneId || ''}
                onChange={e => setHeatmapSceneId(e.target.value || undefined)}
                aria-label="Select scene for heatmap"
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm"
              >
                <option value="">All Scenes</option>
                {scenes.map(scene => (
                  <option key={scene.id} value={scene.id}>
                    {scene.title || `Scene ${scene.order_index + 1}`}
                  </option>
                ))}
              </select>
            )}
          </CardHeader>
          <CardContent>
            <div className="h-[350px]">
              {heatmapData?.heatmap && heatmapData.heatmap.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis
                      type="number"
                      dataKey="yaw"
                      name="Yaw"
                      domain={[-180, 180]}
                      stroke="var(--color-text-muted)"
                      fontSize={12}
                      label={{
                        value: 'Yaw (degrees)',
                        position: 'bottom',
                        offset: 0,
                        style: { fill: 'var(--color-text-muted)', fontSize: 12 },
                      }}
                    />
                    <YAxis
                      type="number"
                      dataKey="pitch"
                      name="Pitch"
                      domain={[-90, 90]}
                      stroke="var(--color-text-muted)"
                      fontSize={12}
                      label={{
                        value: 'Pitch (degrees)',
                        angle: -90,
                        position: 'insideLeft',
                        style: { fill: 'var(--color-text-muted)', fontSize: 12 },
                      }}
                    />
                    <ZAxis
                      type="number"
                      dataKey="intensity"
                      range={[20, 400]}
                      name="Interactions"
                    />
                    <RechartsTooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      contentStyle={{
                        backgroundColor: 'var(--color-surface-elevated)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '8px',
                      }}
                      formatter={(value, name) => {
                        const numericValue = typeof value === 'number' ? value : 0;
                        if (name === 'Yaw') return [`${numericValue.toFixed(1)}°`, 'Yaw'];
                        if (name === 'Pitch') return [`${numericValue.toFixed(1)}°`, 'Pitch'];
                        return [numericValue, 'Interactions'];
                      }}
                    />
                    <Scatter
                      data={heatmapData.heatmap}
                      fill="var(--color-primary-500)"
                      fillOpacity={0.6}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]">
                  No heatmap data available yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Stats Table */}
      {!isAnalyticsError && (
        <Card>
          <CardHeader>
            <CardTitle>Detailed Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="pb-3 text-left font-medium text-[var(--color-text-muted)]">
                      Metric
                    </th>
                    <th className="pb-3 text-right font-medium text-[var(--color-text-muted)]">
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  <tr>
                    <td className="py-3">Total Views</td>
                    <td className="py-3 text-right font-medium">
                      {analytics?.total_views?.toLocaleString() ?? 0}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3">Unique Visitors</td>
                    <td className="py-3 text-right font-medium">
                      {analytics?.unique_views?.toLocaleString() ?? 0}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3">Total Likes</td>
                    <td className="py-3 text-right font-medium">
                      {analytics?.total_likes?.toLocaleString() ?? 0}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3">Total Shares</td>
                    <td className="py-3 text-right font-medium">
                      {analytics?.total_shares?.toLocaleString() ?? 0}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3">Avg. Session Duration</td>
                    <td className="py-3 text-right font-medium">
                      {formatDuration(analytics?.avg_session_duration ?? 0)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3">Desktop Views</td>
                    <td className="py-3 text-right font-medium">
                      {analytics?.device_breakdown?.desktop?.toLocaleString() ?? 0}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3">Mobile Views</td>
                    <td className="py-3 text-right font-medium">
                      {analytics?.device_breakdown?.mobile?.toLocaleString() ?? 0}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3">VR Views</td>
                    <td className="py-3 text-right font-medium">
                      {analytics?.device_breakdown?.vr?.toLocaleString() ?? 0}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
