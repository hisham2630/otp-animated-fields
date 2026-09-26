import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from 'react';
import { Vibration } from 'react-native';
import {
  cancelAnimation,
  Easing,
  runOnJS,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { OtpTheme } from './theme';

export type OtpStatus = 'idle' | 'verifying' | 'success' | 'error';

export type OtpAnimatedFieldRef = {
  reset: () => void;
  verify: () => void;
};

export type UseOtpAnimatedFieldArgs = {
  length: number;
  enabled?: boolean;
  theme: OtpTheme;
  hapticFeedback?: boolean;
  reducedMotion: boolean;
  onVerify: (code: string) => Promise<boolean>;
  onVerified?: (code: string) => void;
  onFailed?: () => void;
  onStatusChanged?: (status: OtpStatus) => void;
  onCodeChange?: (code: string) => void;
  ref?: Ref<OtpAnimatedFieldRef>;
};

export type UseOtpAnimatedFieldResult = {
  digits: string;
  status: OtpStatus;
  focused: boolean;
  setFocused: (v: boolean) => void;
  morph: SharedValue<number>;
  orbit: SharedValue<number>;
  shake: SharedValue<number>;
  success: SharedValue<number>;
  onChangeText: (text: string) => void;
  inputEditable: boolean;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function animateTo(
  value: SharedValue<number>,
  to: number,
  duration: number,
  reduced: boolean,
): Promise<void> {
  if (reduced || duration <= 0) {
    value.value = to;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    value.value = withTiming(
      to,
      { duration, easing: Easing.inOut(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(resolve)();
        else runOnJS(resolve)();
      },
    );
  });
}

export function useOtpAnimatedField(
  args: UseOtpAnimatedFieldArgs,
): UseOtpAnimatedFieldResult {
  const {
    length,
    enabled = true,
    theme,
    hapticFeedback = false,
    reducedMotion,
    onVerify,
    onVerified,
    onFailed,
    onStatusChanged,
    onCodeChange,
    ref,
  } = args;

  const [digits, setDigits] = useState('');
  const [status, setStatus] = useState<OtpStatus>('idle');
  const [focused, setFocused] = useState(false);

  const morph = useSharedValue(0);
  const orbit = useSharedValue(0);
  const shake = useSharedValue(0);
  const success = useSharedValue(0);

  const digitsRef = useRef(digits);
  const statusRef = useRef(status);
  const seqRef = useRef(0);
  const verifyingRef = useRef(false);

  // Keep latest callbacks without re-binding verify on every render.
  const onVerifyRef = useRef(onVerify);
  const onVerifiedRef = useRef(onVerified);
  const onFailedRef = useRef(onFailed);
  const onStatusRef = useRef(onStatusChanged);
  const onCodeChangeRef = useRef(onCodeChange);
  const themeRef = useRef(theme);
  const reducedRef = useRef(reducedMotion);
  const hapticRef = useRef(hapticFeedback);

  digitsRef.current = digits;
  statusRef.current = status;
  onVerifyRef.current = onVerify;
  onVerifiedRef.current = onVerified;
  onFailedRef.current = onFailed;
  onStatusRef.current = onStatusChanged;
  onCodeChangeRef.current = onCodeChange;
  themeRef.current = theme;
  reducedRef.current = reducedMotion;
  hapticRef.current = hapticFeedback;

  const bumpStatus = useCallback((next: OtpStatus) => {
    statusRef.current = next;
    setStatus(next);
    onStatusRef.current?.(next);
  }, []);

  const stopOrbit = useCallback(() => {
    cancelAnimation(orbit);
  }, [orbit]);

  const startOrbit = useCallback(() => {
    if (reducedRef.current) return;
    cancelAnimation(orbit);
    orbit.value = 0;
    orbit.value = withRepeat(
      withTiming(1, {
        duration: themeRef.current.orbitPeriodMs,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
  }, [orbit]);

  const resetVisuals = useCallback(() => {
    cancelAnimation(morph);
    cancelAnimation(orbit);
    cancelAnimation(shake);
    cancelAnimation(success);
    morph.value = 0;
    orbit.value = 0;
    shake.value = 0;
    success.value = 0;
  }, [morph, orbit, shake, success]);

  const playErrorShake = useCallback(
    async (clearText: boolean, seq: number) => {
      const t = themeRef.current;
      const reduced = reducedRef.current;
      bumpStatus('error');
      if (hapticRef.current) Vibration.vibrate(40);

      await animateTo(morph, 0, t.morphDurationMs, reduced);
      if (seq !== seqRef.current) return;
      stopOrbit();

      shake.value = 0;
      await animateTo(shake, 1, t.errorDurationMs, reduced);
      if (seq !== seqRef.current) return;

      if (clearText) {
        setDigits('');
        digitsRef.current = '';
        onCodeChangeRef.current?.('');
      }
      resetVisuals();
      bumpStatus('idle');
      if (clearText) onFailedRef.current?.();
      verifyingRef.current = false;
    },
    [bumpStatus, morph, resetVisuals, shake, stopOrbit],
  );

  const playSuccess = useCallback(
    async (code: string, seq: number) => {
      const t = themeRef.current;
      const reduced = reducedRef.current;
      bumpStatus('success');
      if (hapticRef.current) Vibration.vibrate(20);

      success.value = 0;
      await animateTo(success, 1, t.successDurationMs, reduced);
      if (seq !== seqRef.current) return;
      stopOrbit();
      onVerifiedRef.current?.(code);
      verifyingRef.current = false;
    },
    [bumpStatus, stopOrbit, success],
  );

  const runVerify = useCallback(
    async (code: string) => {
      if (verifyingRef.current) return;
      if (statusRef.current !== 'idle') return;

      if (code.length < length) {
        const seq = ++seqRef.current;
        await playErrorShake(false, seq);
        return;
      }

      verifyingRef.current = true;
      const seq = ++seqRef.current;
      const t = themeRef.current;
      const reduced = reducedRef.current;

      bumpStatus('verifying');
      startOrbit();
      const morphPromise = animateTo(morph, 1, t.morphDurationMs, reduced);
      const holdPromise = wait(reduced ? 0 : t.minVerifyingMs);

      let verified = false;
      try {
        verified = await onVerifyRef.current(code);
      } catch {
        verified = false;
      }

      await Promise.all([morphPromise, holdPromise]);
      if (seq !== seqRef.current) return;

      if (verified) {
        await playSuccess(code, seq);
      } else {
        await playErrorShake(true, seq);
      }
    },
    [bumpStatus, length, morph, playErrorShake, playSuccess, startOrbit],
  );

  const onChangeText = useCallback(
    (text: string) => {
      if (!enabled || statusRef.current !== 'idle') return;
      const next = text.replace(/\D/g, '').slice(0, length);
      setDigits(next);
      digitsRef.current = next;
      onCodeChangeRef.current?.(next);
      if (next.length === length) {
        void runVerify(next);
      }
    },
    [enabled, length, runVerify],
  );

  const reset = useCallback(() => {
    seqRef.current += 1;
    verifyingRef.current = false;
    setDigits('');
    digitsRef.current = '';
    onCodeChangeRef.current?.('');
    resetVisuals();
    bumpStatus('idle');
  }, [bumpStatus, resetVisuals]);

  const verify = useCallback(() => {
    void runVerify(digitsRef.current);
  }, [runVerify]);

  useImperativeHandle(ref, () => ({ reset, verify }), [reset, verify]);

  useEffect(() => {
    return () => {
      seqRef.current += 1;
      cancelAnimation(morph);
      cancelAnimation(orbit);
      cancelAnimation(shake);
      cancelAnimation(success);
    };
  }, [morph, orbit, shake, success]);

  return {
    digits,
    status,
    focused,
    setFocused,
    morph,
    orbit,
    shake,
    success,
    onChangeText,
    inputEditable: enabled && status === 'idle',
  };
}
