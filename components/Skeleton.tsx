import React, { useEffect, useRef } from 'react';
import { Animated, DimensionValue, StyleProp, ViewStyle } from 'react-native';
import { BauhausCard } from './BauhausCard';
import { SPACING } from '../lib/theme';

const PLACEHOLDER = '#ECECEC'; // neutral grey against the #FAFAFA background

/**
 * Skeleton — a flat Bauhaus placeholder with the same pulsing animation as
 * LoadingScreen (§12). Size it to match a roster row / history row / stat tile
 * so re-fetches don't flash a blank screen.
 */
export function Skeleton({
  width = '100%',
  height = 56,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View style={[{ opacity: pulse, width }, style]}>
      <BauhausCard color={PLACEHOLDER} borderColor={PLACEHOLDER} style={{ height }} />
    </Animated.View>
  );
}

/** Convenience: a vertical stack of `count` row skeletons. */
export function SkeletonList({ count = 5, height = 56 }: { count?: number; height?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} height={height} style={{ marginBottom: SPACING.md }} />
      ))}
    </>
  );
}

export default Skeleton;
