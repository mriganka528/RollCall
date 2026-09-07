import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BauhausButton, BauhausInput, BauhausText, theme } from '../../../components/BauhausCard';
import { useToast } from '../../../components/Toast';
import { api, ApiError } from '../../../lib/api';
import { haptics } from '../../../lib/haptics';
import { ClassSummary } from '../../../lib/types';

export default function NewClass() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    if (!name.trim()) {
      toast.show('Enter a class name.', 'error');
      return;
    }
    setBusy(true);
    try {
      const created = await api.post<ClassSummary>('/classes', { name: name.trim() });
      haptics.success();
      toast.show(`Created “${created.name}”.`, 'success');
      router.back();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Could not create class.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <BauhausText style={styles.label}>Class name</BauhausText>
      <BauhausInput placeholder="e.g. Math 101" value={name} onChangeText={setName} autoFocus />
      <BauhausButton label={busy ? 'Creating…' : 'Create Class'} disabled={busy} onPress={onCreate} style={{ marginTop: 24 }} />
      <BauhausText style={styles.hint}>
        A short join code (e.g. MATH-3F9K) is generated automatically. Build the roster next, then share the code so
        students can claim their roll number.
      </BauhausText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, padding: 24 },
  label: { fontSize: 13, marginBottom: 10, opacity: 0.7 },
  hint: { color: theme.muted, marginTop: 20, lineHeight: 20 },
});
