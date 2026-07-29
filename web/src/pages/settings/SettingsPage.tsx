import { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff, Bell, Shield, Palette, Trash2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Input,
} from '@/components/ui';
import { authApi, usersApi } from '@/api';
import { useAuthStore, useUIStore } from '@/stores';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/utils';

export function SettingsPage() {
  const { user } = useAuthStore();
  const { theme, setTheme } = useUIStore();
  const { toast } = useToast();
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Notification settings state
  const [notifications, setNotifications] = useState({
    email_notifications: (user?.notification_settings?.email_notifications as boolean) ?? true,
    marketing_emails: (user?.notification_settings?.marketing_emails as boolean) ?? false,
  });

  // Notification settings mutation
  const notificationMutation = useMutation({
    mutationFn: (settings: Record<string, boolean>) =>
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
      notificationMutation.mutate(updated, {
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
                checked={notifications.marketing_emails}
                onChange={e => handleNotificationChange('marketing_emails', e.target.checked)}
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
