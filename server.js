const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// 1. CONFIGURACIÓN DE BASE DE DATOS (Neon)
const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 2. CONFIGURACIÓN DE DYNATRACE
const DT_DOMAIN = 'ftr18515.live.dynatrace.com';
const DT_TOKEN = process.env.DT_TOKEN;
const DT_BASE_URL = `https://${DT_DOMAIN}/api/v2`;

app.get('/', (req, res) => {
    res.send('🚀 Power CRM Monitor - Sincronizador de Datos DataPower Activo');
});

// --- ENDPOINT DE SINCRONIZACIÓN (Versión Robusta) ---
app.get('/api/sync-users', async (req, res) => {
    let client;
    try {
        client = await pgPool.connect();
        console.log("📡 Iniciando consulta de métricas en Dynatrace...");

        // Intentamos primero con la métrica de Key Requests (más precisa si existen)
        let metricSelector = 'builtin:service.keyRequest.count.total:splitBy("dt.entity.service.keyRequest")';
        let url = `${DT_BASE_URL}/metrics/query?metricSelector=${metricSelector}&from=now-2h`;
        
        let response = await axios.get(url, { 
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
        });

        let dataPoints = response.data.result[0]?.data || [];

        // FALLBACK: Si no hay Key Requests, buscamos en el conteo de peticiones generales
        if (dataPoints.length === 0) {
            console.log("⚠️ No se hallaron Key Requests. Buscando en tráfico general del Gateway...");
            metricSelector = 'builtin:service.requestCount.total:splitBy("dt.entity.service.keyRequest")';
            url = `${DT_BASE_URL}/metrics/query?metricSelector=${metricSelector}&from=now-2h`;
            
            response = await axios.get(url, { 
                headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
            });
            dataPoints = response.data.result[0]?.data || [];
        }

        console.log(`📊 Total de rutas procesadas desde Dynatrace: ${dataPoints.length}`);

        let nuevos = 0;
        for (const item of dataPoints) {
            // Extraemos el nombre de la ruta/URL de la dimensión
            const requestPath = item.dimensionMap["dt.entity.service.keyRequest"] || "";

            // Filtro específico para tu API de Perfilado según lo visto en Kibana/Dyna
            if (requestPath.toLowerCase().includes("customer-account-profiling")) {
                
                console.log(`✅ Coincidencia: ${requestPath}`);

                // Extraemos el teléfono (usuario) de la URL
                const phoneMatch = requestPath.match(/phone-numbers\/(\d+)/);
                const usuarioId = phoneMatch ? phoneMatch[1] : "Sistema/Anonimo";

                // Insertamos en Neon (use-monitor-db)
                const result = await client.query(`
                    INSERT INTO monitor_usuarios (trace_id, timestamp_evento, usuario_id, status_code, endpoint)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (trace_id) DO NOTHING
                `, [
                    `DP-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                    new Date().toISOString(),
                    usuarioId,
                    200,
                    requestPath
                ]);
                
                if (result.rowCount > 0) nuevos++;
            }
        }

        res.json({ 
            success: true, 
            procesados: dataPoints.length, 
            nuevos_en_db: nuevos,
            rango: "últimas 2 horas"
        });

    } catch (e) {
        console.error("❌ Error en el proceso:", e.message);
        res.status(500).json({ 
            error: e.message, 
            detalle: e.response?.data || "Error de conexión" 
        });
    } finally {
        if (client) client.release();
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor Power CRM Monitor corriendo en puerto ${PORT}`);
});