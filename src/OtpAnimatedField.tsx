import React, {
  forwardRef,
  useEffect,
  useMemo,
  useState,
  type Ref,
} from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  TextInput,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import {
  convergence,
  innerRingRadius,
  orbitCenter,
  outerRingRadius,
  resolveGeometry,
  rowCenter,
  shakeOffset,
  travel,
  type OtpGeometry,
} from './geometry';
import { otpThemeLight, type OtpTheme } from './theme';
import {
  useOtpAnimatedField,
  type OtpAnimatedFieldRef,
  type OtpStatus,
} from './useOtpAnimatedField';

export type { OtpAnimatedFieldRef, OtpStatus, OtpTheme };

export type OtpAnimatedFieldProps = {
  length?: number;
  autoFocus?: boolean;
  enabled?: boolean;
  theme?: Partial<OtpTheme>;
  hapticFeedback?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  onVerify: (code: string) => Promise<boolean>;
  onVerified?: (code: string) => void;
  onFailed?: () => void;
  onStatusChanged?: (status: OtpStatus) => void;
};

type BoxProps = {
  index: number;
  digit: string;
  geometry: OtpGeometry;
  theme: OtpTheme;
  status: OtpStatus;
  focusedSlot: boolean;
  morph: SharedValue<number>;
  orbit: SharedValue<number>;
  shake: SharedValue<number>;
  success: SharedValue<number>;
};

function OtpBox({
  index,
  digit,
  geometry,
  theme,
  status,
  focusedSlot,
  morph,
  orbit,
  shake,
  success,
}: BoxProps) {
  const half = geometry.boxSize / 2;

  const animatedStyle = useAnimatedStyle(() => {
    const t = travel(morph.value, index, geometry.length);
    const conv = convergence(success.value);
    const opacity = 1 - conv;
    if (opacity <= 0) {
      return { opacity: 0, transform: [{ scale: 0 }] };
    }

    const shakeX = shakeOffset(shake.value) * theme.shakeAmplitude;
    const onOrbit = orbitCenter(geometry, index, orbit.value, 1 - conv);
    const inRow = rowCenter(geometry, index);
    const cx = inRow.x + shakeX + (onOrbit.x - inRow.x) * t;
    const cy = inRow.y + (onOrbit.y - inRow.y) * t;
    const scale =
      (1 + (geometry.orbitBoxScale - 1) * t) * (1 - 0.7 * conv);

    return {
      opacity,
      transform: [
        { translateX: cx - half },
        { translateY: cy - half },
        { scale },
      ],
    };
  }, [geometry, half, index, theme.shakeAmplitude]);

  let borderColor = theme.borderColor;
  if (status === 'error') borderColor = theme.errorColor;
  else if (status === 'verifying' || status === 'success')
    borderColor = theme.accentColor;
  else if (focusedSlot || digit) borderColor = theme.accentColor;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.box,
        {
          width: geometry.boxSize,
          height: geometry.boxSize,
          borderRadius: theme.borderRadius * (geometry.fit || 1),
          borderWidth: theme.borderWidth,
          borderColor,
          backgroundColor: theme.fillColor,
        },
        animatedStyle,
      ]}
    >
      <Animated.Text
        style={[
          styles.digit,
          {
            color: theme.textColor,
            fontSize: Math.max(16, geometry.boxSize * 0.42),
          },
        ]}
      >
        {digit}
      </Animated.Text>
    </Animated.View>
  );
}

type RingsProps = {
  geometry: OtpGeometry;
  theme: OtpTheme;
  morph: SharedValue<number>;
  success: SharedValue<number>;
};

function OrbitRings({ geometry, theme, morph, success }: RingsProps) {
  const c = { x: geometry.width / 2, y: geometry.height / 2 };
  const inner = innerRingRadius(geometry);
  const outer = outerRingRadius(geometry);

  const style = useAnimatedStyle(() => {
    const t = morph.value;
    const conv = convergence(success.value);
    const opacity = Math.min(1, t * 1.2) * (1 - conv);
    return { opacity };
  });

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <View
        style={[
          styles.ring,
          {
            width: inner * 2,
            height: inner * 2,
            borderRadius: inner,
            borderColor: theme.ringColor,
            left: c.x - inner,
            top: c.y - inner,
          },
        ]}
      />
      <View
        style={[
          styles.ring,
          {
            width: outer * 2,
            height: outer * 2,
            borderRadius: outer,
            borderColor: theme.ringColor,
            left: c.x - outer,
            top: c.y - outer,
          },
        ]}
      />
    </Animated.View>
  );
}

type CheckProps = {
  geometry: OtpGeometry;
  theme: OtpTheme;
  success: SharedValue<number>;
};

function SuccessCheck({ geometry, theme, success }: CheckProps) {
  const style = useAnimatedStyle(() => {
    const conv = convergence(success.value);
    return {
      opacity: conv,
      transform: [{ scale: 0.4 + 0.6 * conv }],
    };
  });

  const size = Math.min(geometry.boxSize * 1.1, 48);
  const c = { x: geometry.width / 2, y: geometry.height / 2 };

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.checkWrap,
        {
          width: size,
          height: size,
          left: c.x - size / 2,
          top: c.y - size / 2,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.checkShort,
          { backgroundColor: theme.successColor, borderRadius: 2 },
        ]}
      />
      <View
        style={[
          styles.checkLong,
          { backgroundColor: theme.successColor, borderRadius: 2 },
        ]}
      />
    </Animated.View>
  );
}

function OtpAnimatedFieldInner(
  props: OtpAnimatedFieldProps,
  ref: Ref<OtpAnimatedFieldRef>,
) {
  const {
    length = 6,
    autoFocus = false,
    enabled = true,
    theme: themePartial,
    hapticFeedback = false,
    testID,
    style,
    onVerify,
    onVerified,
    onFailed,
    onStatusChanged,
  } = props;

  const theme = useMemo(
    () => ({ ...otpThemeLight, ...themePartial }),
    [themePartial],
  );

  const [maxWidth, setMaxWidth] = useState(360);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReducedMotion(v);
    });
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion,
    );
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const field = useOtpAnimatedField({
    length,
    enabled,
    theme,
    hapticFeedback,
    reducedMotion,
    onVerify,
    onVerified,
    onFailed,
    onStatusChanged,
    ref,
  });

  const geometry = useMemo(
    () =>
      resolveGeometry(
        length,
        {
          boxSize: theme.boxSize,
          gap: theme.gap,
          orbitBoxScale: theme.orbitBoxScale,
          orbitRadius: theme.orbitRadius,
        },
        maxWidth,
      ),
    [length, maxWidth, theme],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - maxWidth) > 0.5) setMaxWidth(w);
  };

  const focusIndex = Math.min(field.digits.length, length - 1);

  return (
    <View
      testID={testID}
      style={[styles.root, { minHeight: geometry.height }, style]}
      onLayout={onLayout}
    >
      <View style={{ width: '100%', height: geometry.height }}>
        <OrbitRings
          geometry={geometry}
          theme={theme}
          morph={field.morph}
          success={field.success}
        />
        {Array.from({ length }, (_, i) => (
          <OtpBox
            key={i}
            index={i}
            digit={field.digits[i] ?? ''}
            geometry={geometry}
            theme={theme}
            status={field.status}
            focusedSlot={field.focused && focusIndex === i}
            morph={field.morph}
            orbit={field.orbit}
            shake={field.shake}
            success={field.success}
          />
        ))}
        <SuccessCheck
          geometry={geometry}
          theme={theme}
          success={field.success}
        />
        <TextInput
          value={field.digits}
          onChangeText={field.onChangeText}
          onFocus={() => field.setFocused(true)}
          onBlur={() => field.setFocused(false)}
          editable={field.inputEditable}
          autoFocus={autoFocus}
          caretHidden
          contextMenuHidden={false}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={length}
          importantForAutofill="yes"
          style={styles.hiddenInput}
          accessibilityLabel="One-time code"
        />
      </View>
    </View>
  );
}

export const OtpAnimatedField = forwardRef(OtpAnimatedFieldInner);

const styles = StyleSheet.create({
  root: {
    width: '100%',
    alignItems: 'center',
  },
  box: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: {
    fontWeight: '600',
    textAlign: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth * 2,
    backgroundColor: 'transparent',
  },
  checkWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkShort: {
    position: 'absolute',
    width: 3,
    height: '38%',
    left: '22%',
    top: '48%',
    transform: [{ rotate: '-45deg' }],
  },
  checkLong: {
    position: 'absolute',
    width: 3,
    height: '62%',
    left: '52%',
    top: '22%',
    transform: [{ rotate: '45deg' }],
  },
  hiddenInput: {
    ...StyleSheet.absoluteFill,
    opacity: 0.02,
    color: 'transparent',
    fontSize: 1,
  },
});
