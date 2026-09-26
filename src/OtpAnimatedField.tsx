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
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
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
  onCodeChange?: (code: string) => void;
};

function hexRgb(color: string): { r: number; g: number; b: number } | null {
  const hex = color.trim();
  if (!hex.startsWith('#')) return null;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Flutter `Color.alphaBlend`: src over dst. */
function alphaBlend(src: string, dst: string, srcAlpha: number): string {
  const s = hexRgb(src);
  const d = hexRgb(dst);
  if (!s || !d) return src;
  const mix = (a: number, b: number) => Math.round(a * srcAlpha + b * (1 - srcAlpha));
  return `rgb(${mix(s.r, d.r)},${mix(s.g, d.g)},${mix(s.b, d.b)})`;
}

function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  if (!hex.startsWith('#')) return color;
  const h = hex.slice(1);
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  if (full.length !== 6) return color;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

type BoxFillStyle = ViewStyle & { experimental_backgroundImage?: string };

/** Flutter box fill: solid, or a top-right radial wash while orbiting. */
function boxFill(
  theme: OtpTheme,
  side: number,
  radius: number,
  borderColor: string,
  orbiting: boolean,
): BoxFillStyle {
  const fill: BoxFillStyle = {
    borderRadius: radius,
    borderWidth: theme.borderWidth,
    borderColor,
    backgroundColor: theme.fillColor,
  };
  if (!orbiting) return fill;
  const corner = alphaBlend(theme.accentColor, theme.fillColor, 0.8);
  const reach = side * 1.1;
  fill.experimental_backgroundImage =
    `radial-gradient(circle ${reach}px at 100% 0%, ${corner} 0%, ${theme.fillColor} 70%, ${theme.fillColor} 100%)`;
  return fill;
}

function clamp01(v: number): number {
  'worklet';
  return Math.min(1, Math.max(0, v));
}

function easeOutBack(t: number): number {
  'worklet';
  const c = 1.70158;
  const x = t - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
}

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
  const showCursor = focusedSlot && !digit && status === 'idle';
  const cursor = useSharedValue(1);
  const pop = useSharedValue(digit ? 1 : 0.6);

  useEffect(() => {
    if (!showCursor) {
      cancelAnimation(cursor);
      cursor.value = 0;
      return;
    }
    cursor.value = 1;
    cursor.value = withRepeat(withTiming(0, { duration: 520 }), -1, true);
    return () => cancelAnimation(cursor);
  }, [cursor, showCursor]);

  useEffect(() => {
    if (!digit) {
      pop.value = 0.6;
      return;
    }
    pop.value = 0.6;
    pop.value = withTiming(1, { duration: 180 });
  }, [digit, pop]);

  const cursorStyle = useAnimatedStyle(() => ({ opacity: cursor.value }));
  const digitStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
  }));

  const animatedStyle = useAnimatedStyle(() => {
    const t = travel(morph.value, index, geometry.length);
    const conv = convergence(success.value);
    const opacity = 1 - conv;
    if (opacity <= 0) {
      return { opacity: 0, transform: [{ scale: 0 }] };
    }

    const shakeX = shakeOffset(shake.value) * geometry.boxSize * 0.16;
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
  }, [geometry, half, index]);

  const radius = theme.borderRadius * (geometry.fit || 1);
  let borderColor = theme.borderColor;
  let glow: string | undefined;
  let glowBlur = theme.glowBlur;
  if (status === 'error') {
    borderColor = theme.errorColor;
    glow = withAlpha(theme.errorColor, 0.4);
  } else if (status === 'verifying') {
    borderColor = theme.accentColor;
    glow = withAlpha(theme.accentColor, 0.25);
    glowBlur = theme.glowBlur * 0.7;
  } else if (status === 'success') {
    borderColor = theme.successColor;
    glow = withAlpha(theme.successColor, 0.35);
  } else if (showCursor) {
    borderColor = theme.accentColor;
    glow = withAlpha(theme.accentColor, 0.45);
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.box,
        {
          width: geometry.boxSize,
          height: geometry.boxSize,
          boxShadow: glow ? `0px 0px ${glowBlur}px ${glow}` : undefined,
        },
        animatedStyle,
      ]}
    >
      <View
        style={[
          styles.boxClip,
          boxFill(theme, geometry.boxSize, radius, borderColor, status === 'verifying'),
        ]}
      >
        {digit ? (
          <Animated.Text
            style={[
              styles.digit,
              digitStyle,
              {
                color: theme.textColor,
                fontSize: 24 * (geometry.fit || 1),
                lineHeight: 24 * (geometry.fit || 1),
              },
            ]}
          >
            {digit}
          </Animated.Text>
        ) : null}
        {showCursor ? (
          <Animated.View
            style={[
              styles.cursor,
              cursorStyle,
              {
                height: geometry.boxSize * 0.4,
                backgroundColor: theme.textColor,
              },
            ]}
          />
        ) : null}
      </View>
    </Animated.View>
  );
}

type RingsProps = {
  geometry: OtpGeometry;
  theme: OtpTheme;
  morph: SharedValue<number>;
  orbit: SharedValue<number>;
  success: SharedValue<number>;
};

function ringFade(morph: number, success: number): { rings: number; scale: number } {
  'worklet';
  const appear = clamp01((morph - 0.35) / 0.65);
  const eased = 1 - Math.pow(1 - appear, 3);
  const outT = clamp01(success / 0.45);
  const out = outT * outT * outT;
  return {
    rings: eased * (1 - out),
    scale: (0.6 + 0.4 * eased) * (1 - 0.45 * out),
  };
}

function OrbitDot({
  angle,
  outer,
  cx,
  cy,
  accent,
  morph,
  orbit,
  success,
}: {
  angle: number;
  outer: number;
  cx: number;
  cy: number;
  accent: string;
  morph: SharedValue<number>;
  orbit: SharedValue<number>;
  success: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const { rings, scale } = ringFade(morph.value, success.value);
    const sweep = -orbit.value * Math.PI * 2;
    let rel = (angle - sweep) % (Math.PI * 2);
    if (rel < 0) rel += Math.PI * 2;
    const r = outer * scale;
    return {
      opacity: rings * (0.1 + 0.9 * (rel / (Math.PI * 2))),
      transform: [
        { translateX: Math.cos(angle) * r },
        { translateY: Math.sin(angle) * r },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.dot,
        style,
        { left: cx - 0.9, top: cy - 0.9, backgroundColor: accent },
      ]}
    />
  );
}

function OrbitRings({ geometry, theme, morph, orbit, success }: RingsProps) {
  const c = { x: geometry.width / 2, y: geometry.height / 2 };
  const inner = innerRingRadius(geometry);
  const outer = outerRingRadius(geometry);
  const dotCount = Math.max(12, Math.round((2 * Math.PI * outer) / 7));
  const dots = Array.from({ length: dotCount }, (_, i) => (i / dotCount) * Math.PI * 2);

  const innerStyle = useAnimatedStyle(() => {
    const { rings, scale } = ringFade(morph.value, success.value);
    return {
      opacity: rings,
      transform: [{ scale: Math.max(0.01, scale) }],
    };
  });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          styles.ring,
          innerStyle,
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
      {dots.map((angle) => (
        <OrbitDot
          key={angle}
          angle={angle}
          outer={outer}
          cx={c.x}
          cy={c.y}
          accent={theme.accentColor}
          morph={morph}
          orbit={orbit}
          success={success}
        />
      ))}
    </View>
  );
}

type CheckProps = {
  geometry: OtpGeometry;
  theme: OtpTheme;
  success: SharedValue<number>;
};

function CheckLeg({
  x1,
  y1,
  x2,
  y2,
  stroke,
  color,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: number;
  color: string;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <View
      style={{
        position: 'absolute',
        width: len,
        height: stroke,
        left: (x1 + x2) / 2 - len / 2,
        top: (y1 + y2) / 2 - stroke / 2,
        borderRadius: stroke / 2,
        backgroundColor: color,
        transform: [{ rotate: `${deg}deg` }],
      }}
    />
  );
}

function SuccessCheck({ geometry, theme, success }: CheckProps) {
  const inner = innerRingRadius(geometry);
  const radius = inner * 0.7;
  const size = radius * 2;
  const c = { x: geometry.width / 2, y: geometry.height / 2 };

  const style = useAnimatedStyle(() => {
    const t = success.value;
    const pop = easeOutBack(clamp01((t - 0.3) / 0.45));
    return {
      opacity: t > 0.05 ? 1 : 0,
      transform: [{ scale: Math.max(0.01, pop) }],
    };
  });

  const draw = useAnimatedStyle(() => ({
    opacity: clamp01((success.value - 0.55) / 0.45),
  }));

  const r = radius;
  const stroke = Math.max(2, r * 0.13);
  const knee = { x: r * 0.88, y: r * 1.32 };

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.checkWrap,
        {
          width: size,
          height: size,
          left: c.x - radius,
          top: c.y - radius,
          borderRadius: radius,
          borderWidth: 2,
          borderColor: theme.successColor,
          backgroundColor: withAlpha(theme.successColor, 0.16),
        },
        style,
      ]}
    >
      <Animated.View style={[styles.checkMark, draw]}>
        <CheckLeg
          x1={r * 0.58}
          y1={r * 1.02}
          x2={knee.x}
          y2={knee.y}
          stroke={stroke}
          color={theme.successColor}
        />
        <CheckLeg
          x1={knee.x}
          y1={knee.y}
          x2={r * 1.45}
          y2={r * 0.7}
          stroke={stroke}
          color={theme.successColor}
        />
      </Animated.View>
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
    onCodeChange,
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
    onCodeChange,
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
      <View
        style={{
          width: geometry.width,
          height: geometry.height,
          direction: 'ltr',
          overflow: 'visible',
        }}
      >
        <OrbitRings
          geometry={geometry}
          theme={theme}
          morph={field.morph}
          orbit={field.orbit}
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
    direction: 'ltr',
  },
  box: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  boxClip: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  digit: {
    fontWeight: '600',
    textAlign: 'center',
  },
  cursor: {
    position: 'absolute',
    width: 2,
    borderRadius: 1,
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  dot: {
    position: 'absolute',
    width: 1.8,
    height: 1.8,
    borderRadius: 0.9,
  },
  checkWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenInput: {
    ...StyleSheet.absoluteFill,
    opacity: 0.02,
    color: 'transparent',
    fontSize: 1,
  },
});
