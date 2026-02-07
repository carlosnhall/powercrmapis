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
    res.send('🚀 Power CRM Monitor Activo (2026). Usa /api/sync-users para procesar datos.');
});

// --- ENDPOINT DE SINCRONIZACIÓN (Lógica basada en Kibana) ---
app.get('/api/sync-users', async (req, res) => {
    let client;
    try {
        client = await pgPool.connect();
        
        // Consultamos métricas desglosadas por el nombre del método/URL
        const metricSelector = 'builtin:service.keyRequest.count.total:splitBy("dt.entity.service.keyRequest")';
        const url = `${DT_BASE_URL}/metrics/query?metricSelector=${metricSelector}&from=now-1h`;
        
        console.log("📡 Consultando tráfico reciente a Dynatrace...");
        
        const response = await axios.get(url, { 
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
        });

        const dataPoints = response.data.result[0]?.data || [];
        let nuevos = 0;

        for (const item of dataPoints) {
            // Buscamos el nombre de la API en cualquier dimensión disponible que envíe Dyna
            const dimensionValue = item.dimensionMap["dt.entity.service.keyRequest"] || 
                                 item.dimensionMap["Service method"] || 
                                 Object.values(item.dimensionMap)[0] || "";
            
            console.log(`🔍 Analizando ruta detectada: ${dimensionValue}`);

            // Filtro basado en tu log de Kibana: customer-account-profiling
            if (dimensionValue.toLowerCase().includes("customer-account") || 
                dimensionValue.toLowerCase().includes("profiling")) {
                
                console.log("✅ ¡API de Perfilado detectada! Extrayendo datos...");

                // Extraemos el número de teléfono de la URL (el usuario real en Power CRM)
                const phoneMatch = dimensionValue.match(/phone-numbers\/(\d+)/);
                const usuarioId = phoneMatch ? phoneMatch[1] : "Sistema/Anonimo";

                // Insertamos en la tabla de Neon
                const result = await client.query(`
                    INSERT INTO monitor_usuarios (trace_id, timestamp_evento, usuario_id, status_code, endpoint)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (trace_id) DO NOTHING
                `, [
                    `TR-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                    new Date().toISOString(),
                    usuarioId,
                    200,
                    dimensionValue
                ]);
                
                if (result.rowCount > 0) nuevos++;
            }
        }

        res.json({ 
            success: true, 
            procesados: dataPoints.length,
            nuevos_en_db: nuevos,
            timestamp: new Date().toISOString()
        });

    } catch (e) {
        console.error("❌ ERROR EN SINCRONIZACIÓN:", e.message);
        res.status(500).json({ error: e.message, detalle: e.response?.data });
    } finally {
        if (client) client.release();
    }
});

// --- ENDPOINT DE DESCUBRIMIENTO (Para ver qué servicios hay) ---
app.get('/api/discover-fields', async (req, res) => {
    const entitySelector = encodeURIComponent('type(SERVICE),entityName.contains("customer")');
    const url = `${DT_BASE_URL}/entities?entitySelector=${entitySelector}`;
    
    try {
        const response = await axios.get(url, { 
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
        });
        res.json(response.data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. INICIO DEL SERVIDOR
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor Power CRM Monitor corriendo en puerto ${PORT}`);
});