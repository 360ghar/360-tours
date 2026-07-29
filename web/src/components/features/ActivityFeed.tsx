import { useState } from 'react';
import {
  Activity,
  Plus,
  Edit3,
  Trash2,
  MessageSquare,
  Globe,
  UserPlus,
  LogOut,
  Image,
  MapPin,
  Clock,
  Filter,
  RefreshCw,
} from 'lucide-react';
import {
  Button,
  ScrollArea,
  Badge,
  Avatar,
  AvatarImage,
  AvatarFallback,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { cn } from '@/utils';
import { useCollaborationStore, type ActivityItem } from '@/stores';
import { formatDate, getLocalDateKey, parseServerTimestamp } from '@/utils/format';

interface ActivityFeedProps {
  tourId: string;
  onRefresh?: () => Promise<void>;
  className?: string;
}

const ACTION_CONFIG: Record<
  ActivityItem['action'],
  { icon: React.ReactNode; label: string; color: string }
> = {
  created: {
    icon: <Plus className="h-4 w-4" />,
    label: 'Created',
    color: 'text-[var(--color-success-600)]',
  },
  updated: {
    icon: <Edit3 className="h-4 w-4" />,
    label: 'Updated',
    color: 'text-[var(--color-primary-600)]',
  },
  deleted: {
    icon: <Trash2 className="h-4 w-4" />,
    label: 'Deleted',
    color: 'text-[var(--color-error-600)]',
  },
  commented: {
    icon: <MessageSquare className="h-4 w-4" />,
    label: 'Commented',
    color: 'text-[var(--color-text-secondary)]',
  },
  published: {
    icon: <Globe className="h-4 w-4" />,
    label: 'Published',
    color: 'text-[var(--color-success-600)]',
  },
  invited: {
    icon: <UserPlus className="h-4 w-4" />,
    label: 'Invited',
    color: 'text-[var(--color-warning-600)]',
  },
  left: {
    icon: <LogOut className="h-4 w-4" />,
    label: 'Left',
    color: 'text-[var(--color-text-secondary)]',
  },
};

const TARGET_CONFIG: Record<ActivityItem['target_type'], { icon: React.ReactNode; label: string }> =
  {
    tour: {
      icon: <Globe className="h-3 w-3" />,
      label: 'Tour',
    },
    scene: {
      icon: <Image className="h-3 w-3" />,
      label: 'Scene',
    },
    hotspot: {
      icon: <MapPin className="h-3 w-3" />,
      label: 'Hotspot',
    },
    comment: {
      icon: <MessageSquare className="h-3 w-3" />,
      label: 'Comment',
    },
    collaborator: {
      icon: <UserPlus className="h-3 w-3" />,
      label: 'Collaborator',
    },
  };

export function ActivityFeed({ tourId, onRefresh, className }: ActivityFeedProps) {
  const { activities, isLoadingActivities, activitiesError } = useCollaborationStore();
  const [filter, setFilter] = useState<'all' | ActivityItem['action']>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filter activities for this tour
  const tourActivities = activities.filter(a => a.tour_id === tourId);

  // Apply action filter
  const filteredActivities =
    filter === 'all' ? tourActivities : tourActivities.filter(a => a.action === filter);

  // Group activities by date
  const groupedActivities = filteredActivities.reduce(
    (groups, activity) => {
      const dateKey = getLocalDateKey(activity.created_at);
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(activity);
      return groups;
    },
    {} as Record<string, ActivityItem[]>
  );

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatTime = (dateString: string) => {
    const date = parseServerTimestamp(dateString);
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateHeader = (dateString: string) => {
    const date = parseServerTimestamp(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return formatDate(date, 'EEEE, MMM d');
  };

  const getActivityDescription = (activity: ActivityItem): string => {
    const targetLabel = TARGET_CONFIG[activity.target_type]?.label.toLowerCase() || 'item';
    const targetTitle = activity.target_title ? `"${activity.target_title}"` : '';

    switch (activity.action) {
      case 'created':
        return `created a new ${targetLabel} ${targetTitle}`.trim();
      case 'updated':
        return `updated ${targetLabel} ${targetTitle}`.trim();
      case 'deleted':
        return `deleted ${targetLabel} ${targetTitle}`.trim();
      case 'commented':
        return `commented on ${targetLabel} ${targetTitle}`.trim();
      case 'published':
        return `published the tour`;
      case 'invited':
        return `invited ${activity.details?.email || 'a new member'}`;
      case 'left':
        return `left the tour`;
      default:
        return `performed an action on ${targetLabel}`;
    }
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          <h3 className="font-semibold">Activity</h3>
          <Badge variant="secondary">{filteredActivities.length}</Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter */}
          <Select value={filter} onValueChange={value => setFilter(value as typeof filter)}>
            <SelectTrigger className="w-32 h-8">
              <span className="sr-only">Filter activity</span>
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Activity</SelectItem>
              <SelectItem value="created">Created</SelectItem>
              <SelectItem value="updated">Updated</SelectItem>
              <SelectItem value="deleted">Deleted</SelectItem>
              <SelectItem value="commented">Comments</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="invited">Invites</SelectItem>
            </SelectContent>
          </Select>

          {/* Refresh */}
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label="Refresh activity"
            >
              <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            </Button>
          )}
        </div>
      </div>

      {/* Activity list */}
      <ScrollArea className="flex-1">
        {isLoadingActivities ? (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-8">
            Loading activity...
          </p>
        ) : activitiesError ? (
          <div className="px-4 py-8 text-center">
            <p role="alert" className="text-sm text-[var(--color-error-600)]">
              {activitiesError}
            </p>
            {onRefresh && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={handleRefresh}
                isLoading={isRefreshing}
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            )}
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="text-center py-8">
            <Activity className="h-8 w-8 mx-auto mb-2 text-[var(--color-text-muted)]" />
            <p className="text-sm text-[var(--color-text-muted)]">
              {filter === 'all'
                ? 'No activity yet. Changes and collaboration updates will appear here.'
                : `No ${filter} activity`}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {Object.entries(groupedActivities).map(([date, dayActivities]) => (
              <div key={date} className="py-3">
                {/* Date header */}
                <div className="px-4 mb-3">
                  <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                    {formatDateHeader(date)}
                  </p>
                </div>

                {/* Activities for this date */}
                <div className="space-y-1">
                  {dayActivities.map(activity => (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 px-4 py-2 hover:bg-[var(--color-surface-elevated)] transition-colors"
                    >
                      {/* User avatar */}
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={activity.user?.profile_image_url || undefined} />
                        <AvatarFallback className="text-xs">
                          {getInitials(activity.user?.full_name)}
                        </AvatarFallback>
                      </Avatar>

                      {/* Activity content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="font-medium">
                            {activity.user?.full_name || 'Unknown User'}
                          </span>{' '}
                          {getActivityDescription(activity)}
                        </p>

                        <div className="flex items-center gap-2 mt-1">
                          {/* Action badge */}
                          <Badge
                            variant="outline"
                            className={cn('gap-1 text-xs', ACTION_CONFIG[activity.action]?.color)}
                          >
                            {ACTION_CONFIG[activity.action]?.icon}
                            {ACTION_CONFIG[activity.action]?.label}
                          </Badge>

                          {/* Target type */}
                          {activity.target_type && (
                            <Badge variant="secondary" className="gap-1 text-xs">
                              {TARGET_CONFIG[activity.target_type]?.icon}
                              {TARGET_CONFIG[activity.target_type]?.label}
                            </Badge>
                          )}

                          {/* Time */}
                          <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTime(activity.created_at)}
                          </span>
                        </div>

                        {/* Additional details */}
                        {activity.details && Object.keys(activity.details).length > 0 && (
                          <div className="mt-2 text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] rounded p-2">
                            {Object.entries(activity.details).map(([key, value]) => (
                              <div key={key} className="flex gap-2">
                                <span className="font-medium capitalize">
                                  {key.replace(/_/g, ' ')}:
                                </span>
                                <span>{String(value)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Footer with summary */}
      <div className="px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface-elevated)]">
        <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
          <span>
            Showing {filteredActivities.length} of {tourActivities.length} activities
          </span>
          {tourActivities.length > 0 && (
            <span>
              Last activity: {parseServerTimestamp(tourActivities[0]?.created_at).toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
