# otp-animated-fields

Animated OTP input for React Native. Digits sit in boxes; on verify they travel onto a circle, orbit until verification resolves, then collapse into a check or return and shake.

Behavior inspired by Flutter [`otp_animated_fields`](https://pub.dev/packages/otp_animated_fields) ([source](https://github.com/draz26648/otp_animated_fields)). New TypeScript — not a copy of the Dart.

## Install

```bash
npm install github:hisham2630/otp-animated-fields
```

Peers: `react`, `react-native`, `react-native-reanimated`.

If Metro does not compile this package’s TypeScript, add `otp-animated-fields` to Expo’s transpile list in `metro.config.js` / `app.config`.

## Usage

```tsx
import { useRef } from 'react';
import {
  OtpAnimatedField,
  type OtpAnimatedFieldRef,
  otpThemeLight,
} from 'otp-animated-fields';

function VerifyScreen() {
  const ref = useRef<OtpAnimatedFieldRef>(null);

  return (
    <OtpAnimatedField
      ref={ref}
      length={6}
      autoFocus
      theme={{ ...otpThemeLight, accentColor: '#13a4ec', errorColor: '#ef4444' }}
      testID="verify-otp-field"
      onVerify={async (code) => api.checkOtp(code)}
      onVerified={(code) => { /* navigate */ }}
      onFailed={() => { /* show error */ }}
    />
  );
}
```

`ref.current?.verify()` from a button; `ref.current?.reset()` after resend.

## License

MIT
