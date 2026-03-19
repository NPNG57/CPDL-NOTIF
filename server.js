const express = require('express');
const webpush = require('web-push');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = process.env.VAPID_EMAIL;

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);

const DATA_FILE = './data.json';
let userData = null;

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      userData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch(e) {}
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(userData));
  } catch(e) {}
}

loadData();

app.get('/ping', (req, res) => res.json({ ok: true }));

app.get('/vapid-public-key', (req, res) => {
  res.json({ key: VAPID_PUBLIC });
});

app.post('/subscribe', (req, res) => {
  const { subscription, habits } = req.body;
  if (!subscription || !habits) return res.status(400).json({ error: 'Missing data' });
  userData = { subscription, habits };
  saveData();
  res.json({ ok: true });
});

app.post('/update-habits', (req, res) => {
  if (!req.body.habits) return res.status(400).json({ error: 'Missing habits' });
  if (userData) {
    userData.habits = req.body.habits;
    saveData();
  }
  res.json({ ok: true });
});

function checkAndSend() {
  if (!userData) return;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const timeStr = hh + ':' + mm;
  const dow = now.getDay();

  userData.habits.forEach(habit => {
    if (!habit.notification || !habit.notification.enabled) return;
    if (habit.notification.time !== timeStr) return;
    if (!habit.days.includes(dow)) return;

    const payload = JSON.stringify({
      title: 'Habitudes',
      body: `N'oublie pas : ${habit.emoji} ${habit.name}`,
      tag: habit.id
    });

    webpush.sendNotification(userData.subscription, payload).catch(err => {
      if (err.statusCode === 410 || err.statusCode === 404) {
        userData = null;
        saveData();
      }
    });
  });
}

setInterval(checkAndSend, 60000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Serveur démarré sur le port ' + PORT));
