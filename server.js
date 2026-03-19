const express = require('express');
const webpush = require('web-push');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = process.env.VAPID_EMAIL;
const TIMEZONE_OFFSET = parseInt(process.env.TIMEZONE_OFFSET || '1');

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);

let userData = null;

app.get('/ping', (req, res) => {
  console.log('[ping] serveur actif');
  res.json({ ok: true });
});

app.get('/vapid-public-key', (req, res) => {
  res.json({ key: VAPID_PUBLIC });
});

app.get('/status', (req, res) => {
  if (!userData) {
    res.json({ subscribed: false });
    return;
  }
  res.json({
    subscribed: true,
    habitsCount: userData.habits.length,
    habits: userData.habits.map(h => ({
      name: h.name,
      notifEnabled: h.notification?.enabled,
      notifTime: h.notification?.time,
      days: h.days
    }))
  });
});

app.post('/subscribe', (req, res) => {
  const { subscription, habits } = req.body;
  if (!subscription || !habits) return res.status(400).json({ error: 'Missing data' });
  userData = { subscription, habits };
  console.log('[subscribe] subscription reçue, habitudes:', habits.length);
  res.json({ ok: true });
});

app.post('/test-notif', (req, res) => {
  if (!userData) return res.status(400).json({ error: 'Pas de subscription' });
  const payload = JSON.stringify({
    title: 'Test notification',
    body: 'Si tu vois ça, les notifications fonctionnent !',
    tag: 'test'
  });
  webpush.sendNotification(userData.subscription, payload)
    .then(() => { console.log('[test-notif] envoyée'); res.json({ ok: true }); })
    .catch(err => { console.error('[test-notif] erreur:', err.statusCode, err.body); res.status(500).json({ error: err.message }); });
});

app.post('/update-habits', (req, res) => {
  if (!req.body.habits) return res.status(400).json({ error: 'Missing habits' });
  if (userData) {
    userData.habits = req.body.habits;
    console.log('[update-habits] habitudes mises à jour:', req.body.habits.length);
  }
  res.json({ ok: true });
});

function checkAndSend() {
  const now = new Date();
  const localNow = new Date(now.getTime() + TIMEZONE_OFFSET * 3600000);
  const hh = String(localNow.getUTCHours()).padStart(2, '0');
  const mm = String(localNow.getUTCMinutes()).padStart(2, '0');
  const timeStr = hh + ':' + mm;
  const dow = localNow.getUTCDay();

  console.log('[check] heure locale:', timeStr, '| jour:', dow, '| subscription:', !!userData);

  if (!userData) return;

  userData.habits.forEach(habit => {
    if (!habit.notification || !habit.notification.enabled) return;
    if (habit.notification.time !== timeStr) return;
    if (!habit.days.includes(dow)) return;

    console.log('[notif] envoi pour:', habit.name);

    const payload = JSON.stringify({
      title: 'Habitudes',
      body: `N'oublie pas : ${habit.emoji} ${habit.name}`,
      tag: habit.id
    });

    webpush.sendNotification(userData.subscription, payload)
      .then(() => console.log('[notif] envoyée avec succès:', habit.name))
      .catch(err => {
        console.error('[notif] erreur:', err.statusCode, err.body);
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log('[notif] subscription expirée, suppression');
          userData = null;
        }
      });
  });
}

setInterval(checkAndSend, 60000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Serveur démarré sur le port ' + PORT));
