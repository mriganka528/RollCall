import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { BauhausCard, fonts, theme } from './BauhausCard';
import { COLORS, SPACING } from '../lib/theme';

/**
 * LoadingScreen — full-page branded loader (§12).
 * A single pulsing Bauhaus square (opacity looping 0.4↔1 via core Animated) —
 * the square is the "container" shape from the Bauhaus system — with "Loading…"
 * in Archivo Black beneath it.
 */
export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
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
    <View style={styles.root}>
      <Animated.View style={{ opacity: pulse }}>
        <BauhausCard color={COLORS.blue} style={styles.square} />
      </Animated.View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  square: { width: 72, height: 72 },
  label: {
    marginTop: SPACING.lg,
    fontFamily: fonts.header,
    fontSize: 18,
    color: theme.ink,
  },
});

export default LoadingScreen;
