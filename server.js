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
        
        // Usamos la API de Logs v2. Esta no suele dar 404 si el token tiene permisos de lectura
        // Buscamos la URL que sacamos de Kibana
        const logQuery = encodeURIComponent('status="query_as_you_type" AND content="customer-account-profiling"');
        const url = `https://${DT_DOMAIN}/api/v2/logs/search?query=${logQuery}&from=now-1h&limit=50`;
        
        const response = await axios.get(url, { 
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
        });

        const logs = response.data.results || [];
        let nuevos = 0;

        for (const log of logs) {
            // En los logs, el contenido es una cadena. Intentamos extraer el teléfono o ID
            const content = log.content || "";
            const phoneMatch = content.match(/\d{10}/); 
            const userId = phoneMatch ? phoneMatch[0] : "Usuario-Log";

            const result = await client.query(`
                INSERT INTO monitor_usuarios (trace_id, timestamp_evento, usuario_id, status_code, latencia_ms, endpoint)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (trace_id) DO NOTHING
            `, [
                log.id || `log-${Date.now()}-${Math.random()}`, 
                new Date(log.timestamp).toISOString(), 
                userId, 
                200, 
                0,
                "customer-account-profiling"
            ]);
            
            if (result.rowCount > 0) nuevos++;
        }

        res.json({ 
            success: true, 
            fuente: "Dynatrace Logs",
            procesados: logs.length, 
            registrados_en_neon: nuevos 
        });

    } catch (e) {
        // Si incluso Logs da 404, usaremos el endpoint de Metrics (tu viejo conocido)
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