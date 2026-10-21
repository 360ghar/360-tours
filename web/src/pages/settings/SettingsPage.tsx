import { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Eye, EyeOff, Bell, Shield, Palette, Trash2, Globe } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Input,
} from '@/components/ui';
import { CustomDomainSetup } from '@/components/features';
import { authApi, usersApi, toursApi, customDomainsApi } from '@/api';
import { useAuthStore, useUIStore } from '@/stores';
import { useToast } from '@/hooks/useToast';
import { QUERY_KEYS } from '@/constants';
import { cn } from '@/utils';
import type { NotificationSettingsWrite } from '@/types';

export function SettingsPage() {
  const { user } = useAuthStore();
  const { theme, setTheme } = useUIStore();
  const { toast } = useToast();
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [domainSetupOpen, setDomainSetupOpen] = useState(false);

  // Published tours that a custom domain would serve (empty/loading states).
  const {
    data: publishedTours,
    isLoading: isLoadingTours,
    isError: isToursError,
    refetch: refetchTours,
  } = useQuery({
    queryKey: [QUERY_KEYS.TOURS, { status: 'published', scope: 'custom-domains' }],
    // `total` is null unless include_total is set.
    queryFn: () => toursApi.getTours({ status: 'published', limit: 1, include_total: true }),
  });
  const publishedTourCount = publishedTours?.total ?? publishedTours?.items.length ?? 0;

  // The account's existing domain, so reopening the dialog manages it instead of
  // showing a blank Add Domain form.
  const {
    data: domains,
    isError: isDomainsError,
    refetch: refetchDomains,
  } = useQuery({
    queryKey: [QUERY_KEYS.USER, 'custom-domains'],
    queryFn: () => customDomainsApi.listDomains(),
  });
  // The domain the dialog manages; null opens it to add a new one.
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const currentDomain = domains?.find(d => d.id === selectedDomainId);
  const openDomainDialog = (domainId: string | null) => {
    setSelectedDomainId(domainId);
    setDomainSetupOpen(true);
  };

  // Notification settings state. The backend knows four keys (push_notifications,
  // email_notifications, sms_notifications, promotional_emails); marketing consent
  // is promotional_emails and a missing value means opt-out.
  const [notifications, setNotifications] = useState({
    email_notifications: user?.notification_settings?.email_notifications ?? true,
    promotional_emails: user?.notification_settings?.promotional_emails ?? false,
  });

  // Notification settings mutation: the server merges the keys it gets into the
  // stored settings, so only the key that changed is sent.
  const notificationMutation = useMutation({
    mutationFn: (settings: NotificationSettingsWrite) =>
      usersApi.updateProfile({ notification_settings: settings }),
    onSuccess: () => {
      toast('success', 'Notification preferences saved.', { title: 'Settings updated' });
    },
  });

  const handleNotificationChange = useCallback(
    (key: keyof typeof notifications, value: boolean) => {
      const previous = notifications;
      const updated = { ...notifications, [key]: value };
      setNotifications(updated);
      notificationMutation.mutate({ [key]: value }, {
        onError: (error: Error) => {
          setNotifications(previous);
          toast('error', error.message || 'Failed to update notifications.', { title: 'Error' });
        },
      });
    },
    [notifications, notificationMutation, toast]
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      current_password: '',
      new_password: '',
      confirm_password: '',
    },
  });

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: async (data: { current_password: string; new_password: string }) => {
      if (!user?.phone && !user?.email) {
        throw new Error('Missing phone or email on your profile');
      }
      await authApi.changePassword({
        phone: user.phone ?? undefined,
        email: user.email ?? undefined,
        current_password: data.current_password,
        new_password: data.new_password,
      });
    },
    onSuccess: () => {
      reset();
      toast('success', 'Your password has been updated.', { title: 'Password changed' });
    },
    onError: (error: Error) => {
      toast('error', error.message || 'Failed to change password. Please try again.', {
        title: 'Error',
      });
    },
  });

  const onChangePassword = async (data: {
    current_password: string;
    new_password: string;
    confirm_password: string;
  }) => {
    if (data.new_password !== data.confirm_password) {
      toast('error', 'New password and confirmation do not match.', {
        title: 'Passwords do not match',
      });
      return;
    }
    await changePasswordMutation.mutateAsync({
      current_password: data.current_password,
      new_password: data.new_password,
    });
  };

  return (
    <div className="animate-fade-in mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Settings</h1>
        <p className="mt-1 text-[var(--color-text-muted)]">
          Manage your account settings and preferences
        </p>
      </div>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-[var(--color-text-muted)]" />
            <CardTitle>Appearance</CardTitle>
          </div>
          <CardDescription>Customize how the app looks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium">Theme</label>
              <div className="flex gap-3">
                {(['light', 'dark', 'system'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTheme(t)}
                    aria-pressed={theme === t}
                    className={cn(
                      'flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors',
                      theme === t
                        ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)] text-[var(--color-primary-700)]'
                        : 'border-[var(--color-border)] hover:bg-[var(--color-surface)]'
                    )}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Custom Domains */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-[var(--color-text-muted)]" />
            <CardTitle>Custom Domains</CardTitle>
          </div>
          <CardDescription>Serve your tours from your own branded URL</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {isLoadingTours ? (
              <p className="text-sm text-[var(--color-text-muted)]" role="status">
                Loading your published tours...
              </p>
            ) : isToursError ? (
              <p className="text-sm text-[var(--color-error-600)]" role="alert">
                Could not load your published tours.{' '}
                <button type="button" className="underline" onClick={() => void refetchTours()}>
                  Try again
                </button>
              </p>
            ) : publishedTourCount > 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                Your custom domain applies to{' '}
                <span className="font-medium text-[var(--color-text-primary)]">
                  {publishedTourCount} published tour{publishedTourCount === 1 ? '' : 's'}
                </span>
                .
              </p>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">
                You have no published tours yet. Publish a tour first, then connect a custom
                domain.
              </p>
            )}
            {isDomainsError && (
              <p className="text-sm text-[var(--color-error-600)]" role="alert">
                Could not load your domains.{' '}
                <button type="button" className="underline" onClick={() => void refetchDomains()}>
                  Try again
                </button>
              </p>
            )}
            {domains && domains.length > 0 && (
              <ul className="space-y-2">
                {domains.map(d => (
                  <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      <span className="font-medium text-[var(--color-text-primary)]">{d.domain}</span>{' '}
                      <span className="text-[var(--color-text-muted)]">{d.verification_status}</span>
                    </span>
                    <Button variant="outline" size="sm" onClick={() => openDomainDialog(d.id)}>
                      Manage
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Button onClick={() => openDomainDialog(null)}>Set up custom domain</Button>
            <CustomDomainSetup
              open={domainSetupOpen}
              onOpenChange={next => {
                setDomainSetupOpen(next);
                if (!next) void refetchDomains();
              }}
              currentDomainId={currentDomain?.id}
              currentDomain={currentDomain?.domain}
              verificationStatus={currentDomain?.verification_status}
              sslStatus={currentDomain?.ssl_status}
              verificationToken={currentDomain?.verification_token}
              onAddDomain={async domain => {
                const created = await customDomainsApi.createDomain(domain);
                await refetchDomains();
                return created;
              }}
              onRemoveDomain={async () => {
                if (!currentDomain) return;
                await customDomainsApi.deleteDomain(currentDomain.id);
                setSelectedDomainId(null);
                await refetchDomains();
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-[var(--color-text-muted)]" />
            <CardTitle>Notifications</CardTitle>
          </div>
          <CardDescription>Configure notification preferences</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <label className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">Email Notifications</p>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Receive updates about your tours via email
                </p>
              </div>
              <input
                type="checkbox"
                checked={notifications.email_notifications}
                onChange={e => handleNotificationChange('email_notifications', e.target.checked)}
                disabled={notificationMutation.isPending}
                className="h-5 w-5 rounded border-[var(--color-border)] text-[var(--color-primary-600)]"
              />
            </label>
            <label className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">Marketing Emails</p>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Receive tips and promotional content
                </p>
              </div>
              <input
                type="checkbox"
                checked={notifications.promotional_emails}
                onChange={e => handleNotificationChange('promotional_emails', e.target.checked)}
                disabled={notificationMutation.isPending}
                className="h-5 w-5 rounded border-[var(--color-border)] text-[var(--color-primary-600)]"
              />
            </label>
            {notificationMutation.isPending && (
              <p className="text-sm text-[var(--color-text-muted)]" role="status">
                Saving notification preferences...
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-[var(--color-text-muted)]" />
            <CardTitle>Security</CardTitle>
          </div>
          <CardDescription>Manage your password and security settings</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onChangePassword)} className="space-y-4">
            <div className="relative">
              <Input
                label="Current Password"
                type={showCurrentPassword ? 'text' : 'password'}
                {...register('current_password', { required: 'Enter your current password.' })}
                error={errors.current_password?.message}
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                className="absolute right-1 top-7 flex h-10 w-10 items-center justify-center text-[var(--color-text-muted)]"
              >
                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="relative">
              <Input
                label="New Password"
                type={showNewPassword ? 'text' : 'password'}
                {...register('new_password', {
                  required: 'Enter a new password.',
                  minLength: {
                    value: 8,
                    message: 'Use at least 8 characters.',
                  },
                })}
                error={errors.new_password?.message}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                className="absolute right-1 top-7 flex h-10 w-10 items-center justify-center text-[var(--color-text-muted)]"
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Input
              label="Confirm New Password"
              type="password"
              {...register('confirm_password', { required: 'Confirm your new password.' })}
              error={errors.confirm_password?.message}
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={changePasswordMutation.isPending}
                isLoading={changePasswordMutation.isPending}
              >
                Update Password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Account Deletion */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-[var(--color-text-muted)]" />
            <CardTitle>Delete Account</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--color-text-muted)]">
            To delete your account, contact support.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
