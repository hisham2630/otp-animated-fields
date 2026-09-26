export type OtpTheme = {
  fillColor: string;
  borderColor: string;
  accentColor: string;
  errorColor: string;
  successColor: string;
  ringColor: string;
  textColor: string;
  boxSize: number;
  gap: number;
  borderRadius: number;
  borderWidth: number;
  orbitBoxScale: number;
  orbitRadius?: number;
  morphDurationMs: number;
  orbitPeriodMs: number;
  errorDurationMs: number;
  successDurationMs: number;
  minVerifyingMs: number;
  shakeAmplitude: number;
};

const timings = {
  orbitBoxScale: 0.64,
  morphDurationMs: 700,
  orbitPeriodMs: 2600,
  errorDurationMs: 900,
  successDurationMs: 1000,
  minVerifyingMs: 1500,
  shakeAmplitude: 10,
  boxSize: 56,
  gap: 10,
  borderRadius: 14,
  borderWidth: 1.5,
} as const;

export const otpThemeDark: OtpTheme = {
  fillColor: '#1F1F26',
  borderColor: '#34343E',
  accentColor: '#FF5A3C',
  errorColor: '#FF4D4F',
  successColor: '#2ECC71',
  ringColor: 'rgba(255,255,255,0.2)',
  textColor: '#FFFFFF',
  ...timings,
};

export const otpThemeLight: OtpTheme = {
  fillColor: '#F4F4F7',
  borderColor: '#DADAE2',
  accentColor: '#FF5A3C',
  errorColor: '#FF4D4F',
  successColor: '#2ECC71',
  ringColor: 'rgba(0,0,0,0.14)',
  textColor: '#16161A',
  ...timings,
};
