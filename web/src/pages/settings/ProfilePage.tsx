import { useForm, Controller } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Loader2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Input,
  Avatar,
  PhoneInput,
} from '@/components/ui';
import { usersApi } from '@/api';
import { useAuthStore } from '@/stores';
import { useToast } from '@/hooks/useToast';
import { QUERY_KEYS } from '@/constants';
import { useRef, useState } from 'react';

const MAX_PROFILE_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;

export function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isDirty },
  } = useForm({
    defaultValues: {
      full_name: user?.full_name || '',
      phone: user?.phone || '',
    },
  });

  // Update profile mutation
  const updateMutation = useMutation({
    mutationFn: (data: { full_name?: string; phone?: string }) => usersApi.updateProfile(data),
    onSuccess: updatedUser => {
      setUser(updatedUser);
      reset({
        full_name: updatedUser.full_name || '',
        phone: updatedUser.phone || '',
      });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.USER] });
      toast('success', 'Your profile has been updated.', { title: 'Profile saved' });
    },
    onError: (error: Error) => {
      toast('error', error.message || 'Failed to update profile.', { title: 'Error' });
    },
  });

  // Upload profile image
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast('error', 'Choose a JPG, PNG, or WebP image.', { title: 'Unsupported file' });
      e.target.value = '';
      return;
    }

    if (file.size > MAX_PROFILE_IMAGE_SIZE_BYTES) {
      toast('error', 'Profile photos must be 2MB or smaller.', { title: 'File too large' });
      e.target.value = '';
      return;
    }

    setIsUploadingImage(true);
    try {
      const updatedUser = await usersApi.uploadProfileImage(file);
      setUser(updatedUser);
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.USER] });
      toast('success', 'Profile photo updated.', { title: 'Photo uploaded' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload image.';
      toast('error', message, { title: 'Upload failed' });
    } finally {
      setIsUploadingImage(false);
      e.target.value = '';
    }
  };

  const onSubmit = async (data: { full_name: string; phone: string }) => {
    await updateMutation.mutateAsync(data);
  };

  return (
    <div className="animate-fade-in mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Profile</h1>
        <p className="mt-1 text-[var(--color-text-muted)]">Manage your personal information</p>
      </div>

      {/* Profile Image */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Photo</CardTitle>
          <CardDescription>This will be displayed on your tours and profile</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-6">
          <div className="relative">
            <Avatar
              src={user?.profile_image_url}
              name={user?.full_name || user?.email || ''}
              size="xl"
              className="h-24 w-24"
            />
            {isUploadingImage && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                <Loader2 className="h-6 w-6 animate-spin text-white" />
              </div>
            )}
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              aria-label="Upload profile photo"
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingImage}
              aria-label="Change profile photo"
            >
              <Camera className="h-4 w-4" />
              Change Photo
            </Button>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              JPG, PNG or WebP. Max size 2MB
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Profile Form */}
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Update your personal details</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Full Name"
              {...register('full_name', {
                maxLength: {
                  value: 100,
                  message: 'Full name must be 100 characters or fewer.',
                },
              })}
              error={errors.full_name?.message}
            />
            <Input
              label="Email"
              value={user?.email || ''}
              disabled
              helperText="Contact support to change your email"
            />
            <div>
              <label
                htmlFor="profile-phone"
                className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]"
              >
                Phone
              </label>
              <Controller
                name="phone"
                control={control}
                render={({ field }) => (
                  <PhoneInput
                    id="profile-phone"
                    value={field.value}
                    onChange={field.onChange}
                    error={errors.phone?.message}
                    placeholder="Phone number"
                    ariaLabel="Phone number"
                  />
                )}
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={!isDirty || updateMutation.isPending}
                isLoading={updateMutation.isPending}
              >
                Save Changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Account Info */}
      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">Account Status</p>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Your account is {user?.is_active ? 'active' : 'inactive'}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-sm ${
                  user?.is_active
                    ? 'bg-[var(--color-success-50)] text-[var(--color-success-600)]'
                    : 'bg-[var(--color-error-50)] text-[var(--color-error-600)]'
                }`}
              >
                {user?.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">Role</p>
                <p className="text-sm text-[var(--color-text-muted)]">Your account role</p>
              </div>
              <span className="rounded-full bg-[var(--color-surface)] px-3 py-1 text-sm capitalize">
                {user?.role || 'user'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
