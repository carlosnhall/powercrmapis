const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// 1. CONFIGURACIÓN DE BASE DE DATOS (Neon - use-monitor-db)
const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 2. CONFIGURACIÓN DE DYNATRACE (ftr18515)
const DT_DOMAIN = 'ftr18515.live.dynatrace.com';
const DT_TOKEN = process.env.DT_TOKEN;
const DT_BASE_URL = `https://${DT_DOMAIN}/api/v2`;

// --- ENDPOINT DE BIENVENIDA ---
app.get('/', (req, res) => {
    res.send('🚀 Power CRM Monitor Activo (2026). Usa /api/discover-fields o /api/sync-users.');
});

// --- ENDPOINT 1: DESCUBRIMIENTO ---
// Busca la entidad exacta usando el nombre técnico visto en Kibana
app.get('/api/discover-fields', async (req, res) => {
    const entitySelector = encodeURIComponent('type(SERVICE),entityName.contains("customer-account-profiling")');
    const url = `${DT_BASE_URL}/entities?entitySelector=${entitySelector}`;
    
    try {
        const response = await axios.get(url, { 
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
        });

        if (response.data.entities.length === 0) {
            return res.json({ 
                message: "No se encontró el servicio con 'customer-account-profiling'.",
                sugerencia: "Verificá si el nombre en Dynatrace coincide con el uri_path de Kibana." 
            });
        }

        res.json({
            mensaje: "¡Servicios encontrados!",
            datos: response.data.entities
        });
    } catch (e) {
        res.status(500).json({ error: e.message, detalle: e.response?.data });
    }
});

// --- ENDPOINT 2: SINCRONIZACIÓN (Proyecto Power CRM Monitor) ---
app.get('/api/sync-users', async (req, res) => {
    let client;
    try {
        client = await pgPool.connect();
        
        // Buscamos las métricas de peticiones para capturar las URLs
        // Como no tenemos 'Read traces', usamos 'metrics/query' con splitBy por URL
        const metricSelector = 'builtin:service.keyRequest.count.total:splitBy("dt.entity.service.keyRequest")';
        const url = `${DT_BASE_URL}/metrics/query?metricSelector=${metricSelector}&from=now-1h`;
        
        const response = await axios.get(url, { 
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
        });

        const dataPoints = response.data.result[0]?.data || [];
        let nuevos = 0;

        for (const item of dataPoints) {
            const fullUrl = item.dimensionMap["dt.entity.service.keyRequest"] || "";
            
            // Lógica basada en tu log de Kibana: extraer el teléfono de la URI
            // Path: .../phone-numbers/2616570318/subscription-status
            const phoneMatch = fullUrl.match(/phone-numbers\/(\d+)/);
            const usuarioId = phoneMatch ? phoneMatch[1] : "Sistema/Anonimo";

            // Solo procesamos si la URL pertenece a tu API de perfilado
            if (fullUrl.includes("customer-account-profiling") || fullUrl.includes("perfilado")) {
                const result = await client.query(`
                    INSERT INTO monitor_usuarios (trace_id, timestamp_evento, usuario_id, status_code, endpoint)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (trace_id) DO NOTHING
                `, [
                    `TR-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, // Generamos ID único temporal
                    new Date().toISOString(),
                    usuarioId,
                    200, // Status code asumido (puedes ajustarlo si obtienes la métrica de error)
                    fullUrl
                ]);
                
                if (result.rowCount > 0) nuevos++;
            }
        }

        res.json({ 
            success: true, 
            mensaje: "Sincronización completada basada en URLs de Kibana",
            nuevos_registros: nuevos 
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    } finally {
        if (client) client.release();
    }
});

// Inicio del servidor
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor Power CRM Monitor corriendo en puerto ${PORT}`);
});