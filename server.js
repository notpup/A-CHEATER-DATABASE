const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const LOGS_URL = 'https://raw.githubusercontent.com/notpup/cheater-logs-2/refs/heads/main/logs.json';
const LOGS2_URL = 'https://raw.githubusercontent.com/notpup/cheater-logs-2/refs/heads/main/logs2.json';

let allData = [];

async function loadRemoteJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} al pedir ${url}`);
  const parsed = await res.json();
  if (!Array.isArray(parsed)) {
    console.warn(`Aviso: ${url} no contiene un array, se omite.`);
    return [];
  }
  return parsed;
}

async function loadData() {
  console.log('Cargando logs.json y logs2.json (remotos)...');

  let logs1 = [];
  try {
    logs1 = await loadRemoteJson(LOGS_URL);
  } catch (err) {
    console.warn(`Aviso: no se pudo cargar logs.json remoto (${err.message}).`);
  }

  let logs2 = [];
  try {
    logs2 = await loadRemoteJson(LOGS2_URL);
  } catch (err) {
    console.warn(`Aviso: no se pudo cargar logs2.json remoto (${err.message}).`);
  }

  allData = logs1.concat(logs2);
  console.log(`Listo: ${logs1.length} + ${logs2.length} = ${allData.length} registros cargados.`);
}

function matchesQuery(record, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const fields = [
    record.userId, record.username, record.reporterName,
    record.description, record.placeId, record.gameInstanceId,
    record.profileUrl, record.timestampRaw,
    record.anonymousMode ? 'yes' : 'no'
  ];
  return fields.some(f => f && String(f).toLowerCase().includes(q));
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Resumen: totales + datos agregados para el gráfico (liviano, no importa cuántos registros haya)
app.get('/api/summary', (req, res) => {
  const q = (req.query.q || '').trim();
  const filtered = q ? allData.filter(r => matchesQuery(r, q)) : allData;

  const counts = {};
  filtered.forEach(r => {
    const key = r.description || 'Sin descripción';
    counts[key] = (counts[key] || 0) + 1;
  });
  const chartData = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([label, count]) => ({ label, count }));

  res.json({
    total: allData.length,
    anonCount: allData.filter(r => r.anonymousMode).length,
    gamesCount: new Set(allData.map(r => r.description).filter(Boolean)).size,
    matches: filtered.length,
    chartData
  });
});

// Registros paginados: el navegador nunca recibe más de "pageSize" filas por vez
app.get('/api/records', (req, res) => {
  const q = (req.query.q || '').trim();
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize) || 50));

  const filtered = q ? allData.filter(r => matchesQuery(r, q)) : allData;
  const start = (page - 1) * pageSize;
  const rows = filtered.slice(start, start + pageSize);

  res.json({
    rows,
    page,
    pageSize,
    total: filtered.length,
    totalPages: Math.max(1, Math.ceil(filtered.length / pageSize))
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

loadData().then(() => {
  app.listen(PORT, () => console.log(`Corriendo en puerto ${PORT}`));
});