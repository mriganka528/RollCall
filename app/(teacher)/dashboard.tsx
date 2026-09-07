import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BauhausCard, BauhausButton, BauhausHeader, BauhausText, Square, theme } from '../../components/BauhausCard';
import { SkeletonList } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { api, ApiError } from '../../lib/api';
import { ClassSummary } from '../../lib/types';
import { SPACING } from '../../lib/theme';

// Bauhaus color rhythm — class cards cycle the three primaries so the dashboard
// reads as color-blocked without any gradients or decoration.
const ACCENTS = [theme.blue, theme.red, theme.yellow];

export default function TeacherDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [firstLoad, setFirstLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      try {
        setClasses(await api.get<ClassSummary[]>('/classes'));
      } catch (e) {
        toast.show(e instanceof ApiError ? e.message : 'Could not load your classes.', 'error');
      } finally {
        setFirstLoad(false);
        setRefreshing(false);
      }
    },
    [toast]
  );

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + SPACING.xl }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
    >
      {firstLoad ? (
        <SkeletonList count={3} height={84} />
      ) : (
        <>
          {classes.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Image
                source={require('../../assets/images/rollcall-logo-full.png')}
                style={styles.emptyLogo}
                resizeMode="contain"
              />
              <BauhausText style={styles.empty}>No classes yet. Create your first one.</BauhausText>
            </View>
          ) : (
            <View style={styles.list}>
              {classes.map((c, i) => (
                <BauhausCard
                  key={c.id}
                  color={theme.white}
                  onPress={() => router.push(`/(teacher)/class/${c.id}`)}
                  style={styles.card}
                >
                  <View style={styles.cardTop}>
                    <Square size={16} color={ACCENTS[i % ACCENTS.length]} />
                    <BauhausHeader style={styles.className}>{c.name}</BauhausHeader>
                  </View>
                  <BauhausText style={styles.meta}>
                    Code {c.joinCode}
                    {c.studentCount !== undefined ? `  ·  ${c.studentCount} students` : ''}
                  </BauhausText>
                </BauhausCard>
              ))}
            </View>
          )}

          <BauhausButton
            label="+ New Class"
            onPress={() => router.push('/(teacher)/class/new')}
            style={{ marginTop: SPACING.lg }}
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  container: { padding: SPACING.lg },
  list: { gap: SPACING.lg },
  card: { padding: SPACING.lg },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  className: { flex: 1, fontSize: 20 },
  meta: { fontSize: 13, marginTop: SPACING.sm, color: theme.muted },
  emptyWrap: { alignItems: 'center', marginVertical: SPACING.xl },
  emptyLogo: { width: 180, height: 216, marginBottom: SPACING.md },
  empty: { color: theme.muted, textAlign: 'center' },
});
