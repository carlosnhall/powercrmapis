const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const DT_DOMAIN = 'ftr18515.live.dynatrace.com';
const DT_TOKEN = process.env.DT_TOKEN;
const DT_BASE_URL = `https://${DT_DOMAIN}/api/v2`;

app.get('/', (req, res) => {
    res.send('🚀 Power CRM Monitor Activo');
});

app.get('/api/sync-users', async (req, res) => {
    let client;
    try {
        client = await pgPool.connect();
        
        // CAMBIO CLAVE: Usamos requestCount (general) en lugar de keyRequest (específica)
        // Agregamos splitBy("dt.entity.service") para identificar el origen
        const metricSelector = 'builtin:service.requestCount.total:splitBy("dt.entity.service")';
        const url = `${DT_BASE_URL}/metrics/query?metricSelector=${metricSelector}&from=now-2h`;
        
        console.log("📡 Consultando tráfico global a Dynatrace...");
        
        const response = await axios.get(url, { 
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
        });

        // Si la respuesta está vacía, intentamos con una métrica de procesos
        const dataPoints = response.data.result[0]?.data || [];
        
        if (dataPoints.length === 0) {
            return res.json({ 
                success: true, 
                mensaje: "Dynatrace no reportó métricas en las últimas 2 horas. ¿Hay tráfico en la API?",
                procesados: 0 
            });
        }

        let nuevos = 0;
        for (const item of dataPoints) {
            // Buscamos cualquier rastro de la entidad
            const entityId = item.dimensionMap["dt.entity.service"] || "unknown";
            
            // Log para debuggear en Render
            console.log(`🔍 Detectado tráfico en servicio: ${entityId}`);

            // Aquí es donde mañana vincularemos el SERVICE-ID con los logs de Kibana
            // Por ahora, intentamos guardar el rastro si es un servicio activo
            const result = await client.query(`
                INSERT INTO monitor_usuarios (trace_id, timestamp_evento, usuario_id, status_code, endpoint)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (trace_id) DO NOTHING
            `, [
                `TR-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                new Date().toISOString(),
                "Pendiente-Identificar", 
                200,
                entityId
            ]);
            
            if (result.rowCount > 0) nuevos++;
        }

        res.json({ 
            success: true, 
            procesados: dataPoints.length,
            nuevos_en_db: nuevos 
        });

    } catch (e) {
        res.status(500).json({ error: e.message, detalle: e.response?.data });
    } finally {
        if (client) client.release();
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Puerto ${PORT}`));