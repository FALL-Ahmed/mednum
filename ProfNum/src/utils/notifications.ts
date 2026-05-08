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
    : '📚 ProfNum t\'attend — 5 minutes suffisent pour progresser !';

  await Notifications.scheduleNotificationAsync({
    content: { title: 'ProfNum', body },
    trigger: { hour: 18, minute: 0, repeats: true } as any,
  });
}
