import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils';
import {
  COUNTRY_CODES,
  DEFAULT_COUNTRY_CODE,
  type CountryCode,
} from '@/constants/countryCodes';

export interface PhoneInputProps {
  id?: string;
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  name?: string;
  required?: boolean;
  autoComplete?: string;
  ariaLabel?: string;
}

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  (
    {
      value = '',
      onChange,
      error,
      placeholder = 'Phone number',
      disabled = false,
      className,
      name,
      id,
      required = false,
      autoComplete,
      ariaLabel,
    },
    ref
  ) => {
    // Parse the value to extract country code and local number
    const parseValue = (val: string): { countryCode: string; localNumber: string } => {
      if (!val) {
        return { countryCode: DEFAULT_COUNTRY_CODE, localNumber: '' };
      }

      // Try to match a country dial code
      for (const country of COUNTRY_CODES) {
        if (val.startsWith(country.dialCode)) {
          return {
            countryCode: country.code,
            localNumber: val.slice(country.dialCode.length),
          };
        }
      }

      // If no match, assume default country and the value is the local number
      if (val.startsWith('+')) {
        return { countryCode: DEFAULT_COUNTRY_CODE, localNumber: val };
      }
      return { countryCode: DEFAULT_COUNTRY_CODE, localNumber: val };
    };

    const { countryCode: initialCountryCode, localNumber: initialLocalNumber } = parseValue(value);
    const [selectedCountry, setSelectedCountry] = React.useState<string>(initialCountryCode);
    const [localNumber, setLocalNumber] = React.useState<string>(initialLocalNumber);
    const [isOpen, setIsOpen] = React.useState(false);
    const dropdownRef = React.useRef<HTMLDivElement>(null);

    // Get the selected country object
    const selectedCountryData = COUNTRY_CODES.find((c) => c.code === selectedCountry) || COUNTRY_CODES[0];

    // Close dropdown when clicking outside
    React.useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
          setIsOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Update parent when local number or country changes
    const handleLocalNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newLocal = e.target.value.replace(/[^\d]/g, '');
      setLocalNumber(newLocal);
      if (onChange) {
        onChange(selectedCountryData.dialCode + newLocal);
      }
    };

    const handleCountrySelect = (country: CountryCode) => {
      setSelectedCountry(country.code);
      setIsOpen(false);
      if (onChange) {
        onChange(country.dialCode + localNumber);
      }
    };

    // Sync with external value changes
    React.useEffect(() => {
      const { countryCode, localNumber: parsed } = parseValue(value);
      setSelectedCountry(countryCode);
      setLocalNumber(parsed);
    }, [value]);

    return (
      <div className={cn('space-y-1', className)}>
        <div className="flex">
          {/* Country Code Dropdown */}
          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => !disabled && setIsOpen(!isOpen)}
              disabled={disabled}
              className={cn(
                'flex h-10 items-center gap-1 rounded-l-lg border border-r-0 px-3',
                'bg-[var(--color-surface)] border-[var(--color-border)]',
                'text-sm text-[var(--color-text-primary)]',
                'hover:bg-[var(--color-surface-hover)]',
                'focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)] focus:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'transition-colors',
                error && 'border-[var(--color-error-500)]'
              )}
            >
              <span className="font-medium">{selectedCountryData.dialCode}</span>
              <ChevronDown className="h-4 w-4 text-[var(--color-text-muted)]" />
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
              <div
                className={cn(
                  'absolute left-0 top-full z-50 mt-1 max-h-60 w-56 overflow-auto',
                  'rounded-lg border border-[var(--color-border)]',
                  'bg-[var(--color-surface-elevated)] shadow-lg'
                )}
              >
                {COUNTRY_CODES.map((country) => (
                  <button
                    key={country.code}
                    type="button"
                    onClick={() => handleCountrySelect(country)}
                    className={cn(
                      'flex w-full items-center justify-between px-3 py-2 text-left text-sm',
                      'hover:bg-[var(--color-surface)]',
                      'text-[var(--color-text-primary)]',
                      selectedCountry === country.code && 'bg-[var(--color-primary-50)]'
                    )}
                  >
                    <span>{country.name}</span>
                    <span className="text-[var(--color-text-muted)]">{country.dialCode}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Phone Number Input */}
          <input
            ref={ref}
            id={id}
            name={name}
            type="tel"
            inputMode="numeric"
            value={localNumber}
            onChange={handleLocalNumberChange}
            placeholder={placeholder}
            aria-label={ariaLabel ?? placeholder}
            required={required}
            autoComplete={autoComplete}
            disabled={disabled}
            className={cn(
              'flex h-10 w-full rounded-r-lg border px-3 py-2',
              'bg-[var(--color-background)] border-[var(--color-border)]',
              'text-sm text-[var(--color-text-primary)]',
              'placeholder:text-[var(--color-text-muted)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)] focus:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'transition-colors',
              error && 'border-[var(--color-error-500)]'
            )}
          />
        </div>

        {/* Error Message */}
        {error && (
          <p className="text-sm text-[var(--color-error-600)]">{error}</p>
        )}
      </div>
    );
  }
);

PhoneInput.displayName = 'PhoneInput';
