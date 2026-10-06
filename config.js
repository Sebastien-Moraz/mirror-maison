// Configuration du miroir. Les secrets (token Plex, URL ICS) sont dans .env, jamais ici.

export default {
  port: Number(process.env.PORT) || 8090,
  timezone: "Europe/Zurich",
  locale: "fr-CH",

  location: { latitude: 46.66583, longitude: 6.31601 },

  // Rafraîchissements côté serveur (ms)
  intervals: {
    weather: 10 * 60_000,
    alert: 5 * 60_000,
    calendars: 10 * 60_000,
    plex: 2_000,
    ping: 30_000,
    xiaomiRead: 5 * 60_000,
    clouds: 3 * 60 * 60_000,
  },

  thresholds: {
    warmTemp: 26, // °C, température affichée en orange
    humidHigh: 80, // %, humidité affichée en bleu
    sensorOfflineMinutes: 30,
    rainProbability: 40, // %, une heure est pluvieuse si ≥
    rainMm: 0.2, // mm, ou si ≥
    rainHours: 12, // fenêtre de la phrase de pluie
    hostDownAfter: 2, // échecs de ping consécutifs
  },

  hosts: [
    { name: "Proxmox", host: "192.168.1.10" },
    { name: "Web", host: "192.168.1.25" },
    { name: "Plex", host: "192.168.1.22" },
    { name: "Reolink", host: "192.168.1.111" },
    { name: "Synology", host: "192.168.1.40" },
    { name: "Internet", host: "8.8.8.8" },
  ],

  xiaomi: {
    gateway: "192.168.1.150",
    sensors: [
      { name: "Extérieur", sid: "158d00062f9d5a" },
      { name: "Salon", sid: "158d0008ab2c11" },
      { name: "Cuisine", sid: "158d0004836aa9" },
      { name: "Bibliothèque", sid: "158d0004111bc5" },
      { name: "Bureau", sid: "158d0008ab2bbf" },
      { name: "Salle de bain", sid: "158d00088faddb" },
      { name: "Chambre Seb", sid: "158d00044b4629" },
      { name: "Chambre Vero", sid: "158d0003ce30f1" },
      { name: "Chambre Chloé", sid: "158d00033e7858" },
      { name: "Cave", sid: "158d0008ab25b3" },
      { name: "Couloir", sid: "158d00034f8c21" },
      { name: "Couloir immeuble", sid: "158d00034f804c" },
    ],
  },

  // `env` : nom de la variable de .env qui contient l'URL ICS privée
  people: [
    { name: "Lionel", color: "#8fb4ff", env: "ICS_LIONEL" },
    { name: "Véro", color: "#f2a6cc", env: "ICS_VERO" },
    { name: "Chloé", color: "#f2c27a", env: "ICS_CHLOE" },
    { name: "Seb", color: "#86dcae", env: "ICS_SEB" },
  ],
  // La page affiche maxEvents ; le serveur en garde `keep` pour continuer à afficher les suivants si Internet coupe.
  calendar: { maxEvents: 3, keep: 10, daysAhead: 60 },

  plex: { maxSessions: 3 }, // au-delà de 2, les cartes passent en format compact

  alert: {
    url: "https://my.wetteralarm.ch/v6/alarms/meteo/with-regions.json",
    region: "VD Jura", // nom_de de la région chez Wetteralarm
    label: "Jura vaudois", // nom affiché
  },

  globe: {
    // 4096 ou 2048. Le navigateur repasse seul en 2048 si le GPU ne suit pas.
    textureSize: 4096,
    center: { lat: 44, lon: 6.3 },
    cloudsUrl: "https://clouds.matteason.co.uk/images/{size}/clouds-alpha.png",
  },
};
