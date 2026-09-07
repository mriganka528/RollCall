import React from 'react';
import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { QRPayload } from '../lib/types';
import { BauhausCard, theme } from './BauhausCard';

/**
 * QR sits on a pure-white square for reliable scanning, inside a flat Bauhaus
 * card with a bold blue frame (§Part 2 — the session screen is a spot where
 * some color presence is welcome). The frame goes around it, never through it.
 */
export default function QRDisplay({
  payload,
  size = 240,
}: {
  payload: QRPayload;
  size?: number;
}) {
  return (
    <BauhausCard color={theme.white} borderColor={theme.blue} style={styles.card}>
      <View style={styles.whiteSquare}>
        <QRCode value={JSON.stringify(payload)} size={size} />
      </View>
    </BauhausCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20, alignSelf: 'center', borderWidth: 3 },
  whiteSquare: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 2,
  },
});
