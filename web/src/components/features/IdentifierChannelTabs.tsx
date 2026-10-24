import type { IdentifierChannel } from '@/api/auth';

const TAB_BASE = 'flex min-h-10 flex-1 items-center justify-center rounded-md py-1.5';
const TAB_ACTIVE = `${TAB_BASE} bg-[var(--color-primary-600)] font-medium text-white`;
const TAB_IDLE = `${TAB_BASE} text-[var(--color-text-muted)]`;

const CHANNELS: { value: IdentifierChannel; label: string }[] = [
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
];

/** Phone / Email switch shared by the login, register and password-reset pages. */
export function IdentifierChannelTabs({
  value,
  onChange,
  label,
}: {
  value: IdentifierChannel;
  onChange: (channel: IdentifierChannel) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex rounded-lg border border-[var(--color-border)] p-1 text-sm"
    >
      {CHANNELS.map(channel => (
        <button
          key={channel.value}
          type="button"
          role="tab"
          aria-selected={value === channel.value}
          onClick={() => onChange(channel.value)}
          className={value === channel.value ? TAB_ACTIVE : TAB_IDLE}
        >
          {channel.label}
        </button>
      ))}
    </div>
  );
}
