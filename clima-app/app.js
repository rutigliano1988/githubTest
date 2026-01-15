// --- Helpers UI ---
const $ = (id) => document.getElementById(id);

const statusEl = $("status");
const cardEl = $("card");
const forecastEl = $("forecast");
const forecastGridEl = $("forecastGrid");

const placeEl = $("place");
const timeEl = $("time");
const iconEl = $("icon");

const tempEl = $("temp");
const feelsEl = $("feels");
const humidityEl = $("humidity");
const windEl = $("wind");

const themeBtn = $("themeBtn");

function setStatus(msg, isError = false) {
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("error", !!isError);
}

function showCard(show) {
  cardEl.classList.toggle("hidden", !show);
}

function showForecast(show) {
  forecastEl.classList.toggle("hidden", !show);
}

function formatLocalTime(isoLike) {
  return isoLike ? isoLike.replace("T", " ") : "—";
}

// Mapea códigos WMO a un icono (simplificado)
function wmoToEmoji(code) {
  if (code === 0) return "☀️";
  if (code === 1 || code === 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code >= 45 && code <= 48) return "🌫️";
  if (code >= 51 && code <= 57) return "🌦️";
  if (code >= 61 && code <= 67) return "🌧️";
  if (code >= 71 && code <= 77) return "🌨️";
  if (code >= 80 && code <= 82) return "🌧️";
  if (code >= 85 && code <= 86) return "🌨️";
  if (code >= 95 && code <= 99) return "⛈️";
  return "🌡️";
}

function getWeekdayShort(dateStr) {
  // dateStr: "YYYY-MM-DD"
  const d = new Date(dateStr + "T00:00:00");
  return new Intl.DateTimeFormat("es-ES", { weekday: "short" }).format(d);
}

function formatDM(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit" }).format(d);
}

// --- Theme (claro/oscuro) ---
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeBtn.textContent = theme === "dark" ? "🌙" : "☀️";
  localStorage.setItem("theme", theme);
}

function initTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "dark" || saved === "light") {
    applyTheme(saved);
    return;
  }
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  applyTheme(prefersDark ? "dark" : "light");
}

themeBtn.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
});

// --- API calls ---
// 1) Geocoding por ciudad -> lat/lon
async function geocodeCity(name) {
  const url =
    "https://geocoding-api.open-meteo.com/v1/search" +
    `?name=${encodeURIComponent(name)}` +
    "&count=1&language=es&format=json";

  const res = await fetch(url);
  if (!res.ok) throw new Error("Error en geocoding");
  const data = await res.json();
  if (!data.results || data.results.length === 0) return null;

  const r = data.results[0];
  return {
    name: r.name,
    admin1: r.admin1,
    country: r.country,
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone,
  };
}

// 2) Meteo actual + daily 7 días
async function fetchWeather(lat, lon, timezone = "auto") {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}` +
    "&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code" +
    "&daily=temperature_2m_max,temperature_2m_min,weather_code" +
    "&forecast_days=7" +
    `&timezone=${encodeURIComponent(timezone)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Error en meteo");
  return await res.json();
}

function renderCurrent(placeLabel, weatherJson) {
  const c = weatherJson.current;
  const tz = weatherJson.timezone || "—";

  placeEl.textContent = placeLabel;
  timeEl.textContent = `Hora (${tz}): ${formatLocalTime(c.time)}`;
  iconEl.textContent = wmoToEmoji(c.weather_code);

  tempEl.textContent = Math.round(c.temperature_2m);
  feelsEl.textContent = Math.round(c.apparent_temperature);
  humidityEl.textContent = Math.round(c.relative_humidity_2m);
  windEl.textContent = Math.round(c.wind_speed_10m);

  showCard(true);
}

function renderForecast(weatherJson) {
  const d = weatherJson.daily;
  if (!d || !d.time || d.time.length === 0) {
    showForecast(false);
    return;
  }

  const days = d.time.map((dateStr, i) => ({
    dateStr,
    wmo: d.weather_code?.[i],
    tmax: d.temperature_2m_max?.[i],
    tmin: d.temperature_2m_min?.[i],
  }));

  forecastGridEl.innerHTML = days
    .map((day, i) => {
      const name = i === 0 ? "Hoy" : getWeekdayShort(day.dateStr);
      const date = formatDM(day.dateStr);
      const icon = wmoToEmoji(day.wmo);
      const tmax = Number.isFinite(day.tmax) ? Math.round(day.tmax) : "—";
      const tmin = Number.isFinite(day.tmin) ? Math.round(day.tmin) : "—";

      return `
        <article class="day">
          <div class="day-top">
            <div>
              <div class="day-name">${name}</div>
              <div class="day-date">${date}</div>
            </div>
            <div class="day-icon" aria-hidden="true">${icon}</div>
          </div>
          <div class="day-temps">
            <span class="temp-max">Máx ${tmax}°</span>
            <span class="temp-min">Mín ${tmin}°</span>
          </div>
        </article>
      `;
    })
    .join("");

  showForecast(true);
}

async function searchByCity(city) {
  setStatus("Buscando…");
  showCard(false);
  showForecast(false);

  const geo = await geocodeCity(city);
  if (!geo) {
    setStatus("No encontré esa ciudad. Prueba con otro nombre.", true);
    return;
  }

  const placeLabel = `${geo.name}${geo.admin1 ? ", " + geo.admin1 : ""}${geo.country ? ", " + geo.country : ""}`;
  const weather = await fetchWeather(geo.latitude, geo.longitude, geo.timezone || "auto");

  renderCurrent(placeLabel, weather);
  renderForecast(weather);
  setStatus("");
}

async function searchByGeolocation() {
  setStatus("Pidiendo permiso de ubicación…");
  showCard(false);
  showForecast(false);

  if (!navigator.geolocation) {
    setStatus("Tu navegador no soporta geolocalización.", true);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        setStatus("Cargando clima de tu ubicación…");
        const { latitude, longitude } = pos.coords;
        const weather = await fetchWeather(latitude, longitude, "auto");

        renderCurrent("Mi ubicación", weather);
        renderForecast(weather);
        setStatus("");
      } catch {
        setStatus("No pude obtener el clima para tu ubicación.", true);
      }
    },
    () => setStatus("No se pudo acceder a tu ubicación (permiso denegado o error).", true),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
  );
}

// --- Wire up UI ---
$("searchForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const city = $("cityInput").value.trim();
  if (!city) {
    setStatus("Escribe una ciudad para buscar.", true);
    return;
  }
  try {
    await searchByCity(city);
  } catch {
    setStatus("Hubo un error al buscar el clima. Inténtalo de nuevo.", true);
  }
});

$("geoBtn").addEventListener("click", () => {
  searchByGeolocation();
});

// Init
initTheme();
searchByCity("Madrid").catch(() => {});
