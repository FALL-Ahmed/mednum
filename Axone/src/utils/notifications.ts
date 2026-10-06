import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const NOTIF_ID_KEY = 'streak-daily-reminder';

export async function scheduleStreakReminder(streakCurrent: number, xpToday: number) {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;

  await Notifications.cancelAllScheduledNotificationsAsync();

  // Si déjà étudié aujourd'hui → pas de rappel aujourd'hui
  if (xpToday > 0) return;

  const body = streakCurrent >= 3
    ? `🔥 ${streakCurrent} jours de suite — ne brise pas ta série !`
    : streakCurrent === 1
    ? '📚 Tu as commencé hier — continue sur ta lancée !'
    : '📚 Axone t\'attend — 5 minutes suffisent pour progresser !';

  await Notifications.scheduleNotificationAsync({
    content: { title: 'Axone', body },
    trigger: { hour: 18, minute: 0, repeats: true } as any,
  });
}

const POMODORO_NOTIF_ID = 'pomodoro-cycle-end';

// Notifie la fin d'un cycle Focus/Pause même app fermée ou téléphone verrouillé
// (le déclenchement OS est indépendant du JS — contrairement au décompte affiché
// à l'écran, qui lui reste approximatif tant qu'il n'y a pas de code natif dédié).
export async function schedulePomodoroEnd(seconds: number, title: string, body: string) {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  await Notifications.cancelScheduledNotificationAsync(POMODORO_NOTIF_ID).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: POMODORO_NOTIF_ID,
    content: { title, body },
    trigger: { seconds: Math.max(1, seconds), repeats: false } as any,
  });
}

export async function cancelPomodoroNotification() {
  await Notifications.cancelScheduledNotificationAsync(POMODORO_NOTIF_ID).catch(() => {});
}

// Rappel pour une session planifiée à l'avance (calendrier de planification)
export async function schedulePlannedReminder(id: string, when: Date, title: string, body: string) {
  if (when.getTime() <= Date.now()) return; // date déjà passée — pas de rappel
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  await Notifications.scheduleNotificationAsync({
    identifier: `planned-${id}`,
    content: { title, body },
    trigger: { date: when } as any,
  });
}

export async function cancelPlannedReminder(id: string) {
  await Notifications.cancelScheduledNotificationAsync(`planned-${id}`).catch(() => {});
}
