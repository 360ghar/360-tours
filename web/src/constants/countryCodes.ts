export interface CountryCode {
  code: string;
  name: string;
  dialCode: string;
}

export const COUNTRY_CODES: CountryCode[] = [
  { code: 'IN', name: 'India', dialCode: '+91' },
  { code: 'US', name: 'United States', dialCode: '+1' },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44' },
  { code: 'AE', name: 'UAE', dialCode: '+971' },
  { code: 'SA', name: 'Saudi Arabia', dialCode: '+966' },
  { code: 'AU', name: 'Australia', dialCode: '+61' },
  { code: 'CA', name: 'Canada', dialCode: '+1' },
  { code: 'SG', name: 'Singapore', dialCode: '+65' },
  { code: 'MY', name: 'Malaysia', dialCode: '+60' },
  { code: 'BD', name: 'Bangladesh', dialCode: '+880' },
  { code: 'PK', name: 'Pakistan', dialCode: '+92' },
  { code: 'NP', name: 'Nepal', dialCode: '+977' },
  { code: 'LK', name: 'Sri Lanka', dialCode: '+94' },
  { code: 'DE', name: 'Germany', dialCode: '+49' },
  { code: 'FR', name: 'France', dialCode: '+33' },
  { code: 'IT', name: 'Italy', dialCode: '+39' },
  { code: 'ES', name: 'Spain', dialCode: '+34' },
  { code: 'NL', name: 'Netherlands', dialCode: '+31' },
  { code: 'JP', name: 'Japan', dialCode: '+81' },
  { code: 'KR', name: 'South Korea', dialCode: '+82' },
  { code: 'CN', name: 'China', dialCode: '+86' },
  { code: 'HK', name: 'Hong Kong', dialCode: '+852' },
  { code: 'TH', name: 'Thailand', dialCode: '+66' },
  { code: 'ID', name: 'Indonesia', dialCode: '+62' },
  { code: 'PH', name: 'Philippines', dialCode: '+63' },
  { code: 'VN', name: 'Vietnam', dialCode: '+84' },
  { code: 'NZ', name: 'New Zealand', dialCode: '+64' },
  { code: 'ZA', name: 'South Africa', dialCode: '+27' },
  { code: 'KE', name: 'Kenya', dialCode: '+254' },
  { code: 'NG', name: 'Nigeria', dialCode: '+234' },
];

export const DEFAULT_COUNTRY_CODE = 'IN';
