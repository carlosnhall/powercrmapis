const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// 1. CONFIGURACIÓN DE IDENTIDAD (Siguiendo tu script original)
const DT_DOMAIN = 'ftr18515.live.dynatrace.com';
const DT_TOKEN = process.env.DT_TOKEN;

// 2. CONFIGURACIÓN DE CONEXIÓN (Usando DATABASE_URL de Render)
const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- ENDPOINT DE DESCUBRIMIENTO (Versión v2 compatible) ---
app.get('/api/discover-fields', async (req, res) => {
    // Usamos la ruta de 'traces' que suele ser más compatible que Grail en algunos tenants
    const url = `https://${DT_DOMAIN}/api/v2/traces?filter=contains(http.url, "perfilado-customer-account-api")&pageSize=1`;
    
    try {
        const response = await axios.get(url, { 
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
        });

        if (!response.data.traces || response.data.traces.length === 0) {
            return res.json({ message: "No se encontraron trazas recientes." });
        }

        // Devolvemos la primera traza para ver sus atributos
        res.json(response.data.traces[0]);
    } catch (e) {
        console.error(`[❌] Error: ${e.message}`);
        res.status(500).json({ error: e.message, detalle: e.response?.data });
    }
});

// --- ENDPOINT DE SINCRONIZACIÓN ---
app.get('/api/sync-users', async (req, res) => {
    let client;
    try {
        client = await pgPool.connect();
        const url = `https://${DT_DOMAIN}/api/v2/traces?filter=contains(http.url, "perfilado-customer-account-api")&pageSize=50`;
        
        const response = await axios.get(url, { 
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
        });

        const traces = response.data.traces || [];
        let nuevos = 0;

        for (const trace of traces) {
            // Buscamos el usuario en los atributos (ajustar nombre según discover-fields)
            const userId = trace.attributes?.["http.user_id"] || "Desconocido";
            
            const result = await client.query(`
                INSERT INTO monitor_usuarios (trace_id, timestamp_evento, usuario_id, status_code, latencia_ms)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (trace_id) DO NOTHING
            `, [
                trace.traceId, 
                new Date(trace.startTime / 1000).toISOString(), 
                userId, 
                trace.statusCode || 200,
                (trace.duration / 1000000).toFixed(2)
            ]);
            
            if (result.rowCount > 0) nuevos++;
        }

        res.json({ success: true, procesados: traces.length, nuevos_en_db: nuevos });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (client) client.release();
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Corriendo en puerto ${PORT}`));