const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

const DT_DOMAIN = 'ftr18515.live.dynatrace.com';
const DT_TOKEN = process.env.DT_TOKEN;

// IDs que acabamos de descubrir
const API_METHODS = [
    'SERVICE_METHOD-8398C8AA04D61E9A', 
    'SERVICE_METHOD-D785A53BF27199DA'
];

const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.get('/api/sync-users', async (req, res) => {
    let client;
    try {
        client = await pgPool.connect();
        let totalNuevos = 0;

        for (const methodId of API_METHODS) {
            // CAMBIO CLAVE: Usamos el endpoint de 'events' que es más robusto que 'traces'
            const url = `https://${DT_DOMAIN}/api/v2/events?entitySelector=type(SERVICE_METHOD),entityId("${methodId}")&from=now-1h`;
            
            const response = await axios.get(url, { 
                headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
            });

            // Si este también falla, probaremos con el API de Metrics que es infalible
            const eventos = response.data.events || [];

            for (const ev of eventos) {
                // Sacamos el usuario de las propiedades del evento
                const userId = ev.properties?.["http.user_id"] || ev.properties?.["user.name"] || "Usuario Log";

                const result = await client.query(`
                    INSERT INTO monitor_usuarios (trace_id, timestamp_evento, usuario_id, status_code, latencia_ms, endpoint)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (trace_id) DO NOTHING
                `, [
                    ev.eventId || `ev-${Date.now()}-${Math.random()}`, 
                    new Date(ev.startTime).toISOString(), 
                    userId, 
                    200, // Los eventos suelen ser de éxito
                    0, 
                    "customer-account-profiling"
                ]);
                
                if (result.rowCount > 0) totalNuevos++;
            }
        }

        res.json({ 
            success: true, 
            mensaje: "Sincronización intentada vía Eventos",
            registrados_en_neon: totalNuevos 
        });

    } catch (e) {
        // Si da 404 de nuevo, es que el método no tiene eventos. 
        // En ese caso, la última opción es leer el log directamente.
        res.status(500).json({ error: e.message, detalle: e.response?.data });
    } finally {
        if (client) client.release();
    }
});

// Endpoint simple para ver los últimos 10 de la DB
app.get('/api/view-data', async (req, res) => {
    try {
        const result = await pgPool.query('SELECT * FROM monitor_usuarios ORDER BY timestamp_evento DESC LIMIT 10');
        res.json(result.rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Power CRM Monitor Activo en puerto ${PORT}`));