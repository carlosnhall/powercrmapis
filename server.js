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
        
        // Consulta USQL: Busca usuarios que usaron la API de perfilado
        // Filtramos por el nombre de la app que vimos en Kibana: Power CRM2
        const usql = `SELECT userId, startTime, duration, userAction.name, application FROM userSession WHERE userAction.name LIKE "*customer-account-profiling*" LIMIT 50`;
        const url = `https://${DT_DOMAIN}/api/v2/userSessions/query?query=${encodeURIComponent(usql)}`;
        
        const response = await axios.get(url, { 
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
        });

        const rows = response.data.values || [];
        let nuevos = 0;

        for (const row of rows) {
            // row[0] es userId, row[1] es startTime
            const result = await client.query(`
                INSERT INTO monitor_usuarios (trace_id, timestamp_evento, usuario_id, status_code, latencia_ms, endpoint)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (trace_id) DO NOTHING
            `, [
                `usql-${row[1]}-${row[0]}`, // Generamos un ID único basado en tiempo y usuario
                new Date(row[1]).toISOString(), 
                row[0] || "Anonimo", 
                200, 
                row[2] || 0,
                row[3] || "customer-account-profiling"
            ]);
            
            if (result.rowCount > 0) nuevos++;
        }

        res.json({ 
            success: true, 
            procesados_usql: rows.length, 
            registrados_en_neon: nuevos 
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