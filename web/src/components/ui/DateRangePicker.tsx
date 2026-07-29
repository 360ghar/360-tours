import * as React from 'react';
import { format, subDays, subMonths, startOfMonth, endOfMonth, subYears } from 'date-fns';
import { DayPicker, DateRange } from 'react-day-picker';
import { Calendar, ChevronDown } from 'lucide-react';
import { Button } from './Button';
import { Popover, PopoverTrigger, PopoverContent } from './Popover';
import { cn } from '@/utils';

import 'react-day-picker/dist/style.css';

export interface DateRangePickerProps {
  value?: DateRange;
  onChange?: (range: DateRange | undefined) => void;
  className?: string;
  placeholder?: string;
  presets?: boolean;
  disabled?: boolean;
}

const PRESETS = [
  {
    label: 'Today',
    getValue: () => {
      const today = new Date();
      return { from: today, to: today };
    },
  },
  {
    label: 'Last 7 days',
    getValue: () => ({
      from: subDays(new Date(), 6),
      to: new Date(),
    }),
  },
  {
    label: 'Last 30 days',
    getValue: () => ({
      from: subDays(new Date(), 29),
      to: new Date(),
    }),
  },
  {
    label: 'Last 90 days',
    getValue: () => ({
      from: subDays(new Date(), 89),
      to: new Date(),
    }),
  },
  {
    label: 'This month',
    getValue: () => ({
      from: startOfMonth(new Date()),
      to: new Date(),
    }),
  },
  {
    label: 'Last month',
    getValue: () => {
      const lastMonth = subMonths(new Date(), 1);
      return {
        from: startOfMonth(lastMonth),
        to: endOfMonth(lastMonth),
      };
    },
  },
  {
    label: 'This year',
    getValue: () => ({
      from: new Date(new Date().getFullYear(), 0, 1),
      to: new Date(),
    }),
  },
  {
    label: 'Last year',
    getValue: () => {
      const lastYear = subYears(new Date(), 1);
      return {
        from: new Date(lastYear.getFullYear(), 0, 1),
        to: new Date(lastYear.getFullYear(), 11, 31),
      };
    },
  },
];

export function DateRangePicker({
  value,
  onChange,
  className,
  placeholder = 'Select date range',
  presets = true,
  disabled = false,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);

  const formatDateRange = (range: DateRange | undefined) => {
    if (!range?.from) return placeholder;
    if (!range.to) return format(range.from, 'MMM d, yyyy');
    if (format(range.from, 'yyyy') === format(range.to, 'yyyy')) {
      return `${format(range.from, 'MMM d')} - ${format(range.to, 'MMM d, yyyy')}`;
    }
    return `${format(range.from, 'MMM d, yyyy')} - ${format(range.to, 'MMM d, yyyy')}`;
  };

  const handlePresetClick = (preset: (typeof PRESETS)[0]) => {
    onChange?.(preset.getValue());
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'justify-start text-left font-normal',
            !value?.from && 'text-[var(--color-text-muted)]',
            className
          )}
          disabled={disabled}
        >
          <Calendar className="h-4 w-4" />
          {formatDateRange(value)}
          <ChevronDown className="ml-auto h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex">
          {/* Presets sidebar */}
          {presets && (
            <div className="flex flex-col border-r border-[var(--color-border)] p-2 w-36">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handlePresetClick(preset)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                    'hover:bg-[var(--color-surface-elevated)]',
                    'focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)] focus:ring-offset-2'
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}

          {/* Calendar */}
          <div className="p-3">
            <DayPicker
              mode="range"
              defaultMonth={value?.from}
              selected={value}
              onSelect={onChange}
              numberOfMonths={2}
              disabled={{ after: new Date() }}
              classNames={{
                months: 'flex gap-4',
                month: 'space-y-4',
                caption: 'flex justify-center pt-1 relative items-center',
                caption_label: 'text-sm font-medium',
                nav: 'flex items-center gap-1',
                nav_button: cn(
                  'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100',
                  'inline-flex items-center justify-center rounded-md border border-[var(--color-border)]'
                ),
                nav_button_previous: 'absolute left-1',
                nav_button_next: 'absolute right-1',
                table: 'w-full border-collapse space-y-1',
                head_row: 'flex',
                head_cell: 'text-[var(--color-text-muted)] rounded-md w-9 font-normal text-[0.8rem]',
                row: 'flex w-full mt-2',
                cell: cn(
                  'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
                  '[&:has([aria-selected])]:bg-[var(--color-primary-100)]',
                  '[&:has([aria-selected].day-range-end)]:rounded-r-md',
                  '[&:has([aria-selected].day-range-start)]:rounded-l-md',
                  '[&:has([aria-selected].day-outside)]:bg-[var(--color-primary-50)]'
                ),
                day: cn(
                  'h-9 w-9 p-0 font-normal aria-selected:opacity-100',
                  'inline-flex items-center justify-center rounded-md text-sm',
                  'hover:bg-[var(--color-surface-elevated)]',
                  'focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)]'
                ),
                day_range_start: 'day-range-start bg-[var(--color-primary-500)] text-white',
                day_range_end: 'day-range-end bg-[var(--color-primary-500)] text-white',
                day_selected: 'bg-[var(--color-primary-500)] text-white hover:bg-[var(--color-primary-600)]',
                day_today: 'bg-[var(--color-surface-elevated)] font-semibold',
                day_outside: 'day-outside text-[var(--color-text-muted)] opacity-50',
                day_disabled: 'text-[var(--color-text-muted)] opacity-50 cursor-not-allowed',
                day_range_middle: 'aria-selected:bg-[var(--color-primary-100)] aria-selected:text-[var(--color-primary-900)]',
                day_hidden: 'invisible',
              }}
            />
            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--color-border)] mt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onChange?.(undefined);
                }}
              >
                Clear
              </Button>
              <Button
                size="sm"
                onClick={() => setOpen(false)}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
