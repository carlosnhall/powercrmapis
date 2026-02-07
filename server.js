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
        let totalProcesados = 0;

        for (const methodId of API_METHODS) {
            // Buscamos trazas de los últimos 30 minutos para este método
            const url = `https://${DT_DOMAIN}/api/v2/traces?entitySelector=type(SERVICE_METHOD),entityId("${methodId}")&pageSize=50&from=now-30m`;
            
            const response = await axios.get(url, { 
                headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
            });

            const traces = response.data.traces || [];
            totalProcesados += traces.length;

            for (const trace of traces) {
                // Lógica de extracción: Priorizamos el ID de usuario de Dynatrace, 
                // si no, intentamos sacar el teléfono de la URL
                const userId = trace.attributes?.["user.id"] || 
                               trace.attributes?.["http.user_id"] || 
                               (trace.attributes?.["http.url"]?.match(/\d{10}/) || [])[0] || 
                               "Desconocido";

                const result = await client.query(`
                    INSERT INTO monitor_usuarios (trace_id, timestamp_evento, usuario_id, status_code, latencia_ms, endpoint)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (trace_id) DO NOTHING
                `, [
                    trace.traceId, 
                    new Date(trace.startTime / 1000).toISOString(), 
                    userId, 
                    trace.statusCode || 200,
                    (trace.duration / 1000).toFixed(2), // Convertir micro a mili
                    trace.attributes?.["http.url"] || "customer-account-profiling"
                ]);
                
                if (result.rowCount > 0) totalNuevos++;
            }
        }

        res.json({ 
            success: true, 
            procesados: totalProcesados, 
            registrados_en_neon: totalNuevos 
        });

    } catch (e) {
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