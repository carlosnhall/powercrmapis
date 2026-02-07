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
        
        // Consultamos las métricas de las peticiones que pasan por el DataPower
        // Usamos la métrica de recuento desglosada por el nombre del método (URL completa)
        const metricSelector = 'builtin:service.requestCount.total:splitBy("dt.entity.service.keyRequest")';
        const url = `https://${DT_DOMAIN}/api/v2/metrics/query?metricSelector=${metricSelector}&from=now-1h`;
        
        const response = await axios.get(url, { 
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
        });

        const dataPoints = response.data.result[0]?.data || [];
        let nuevos = 0;

        for (const item of dataPoints) {
            const requestPath = item.dimensionMap["dt.entity.service.keyRequest"] || "";

            // Filtramos solo la API que nos interesa (la que encontraste hoy)
            if (requestPath.includes("customer-account-profiling")) {
                
                // Extraemos el teléfono de la URL: .../phone-numbers/2616570318/...
                const phoneMatch = requestPath.match(/phone-numbers\/(\d+)/);
                const usuarioId = phoneMatch ? phoneMatch[1] : "Sistema";

                // Insertamos en tu base de datos de Neon
                const result = await client.query(`
                    INSERT INTO monitor_usuarios (trace_id, timestamp_evento, usuario_id, status_code, endpoint)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (trace_id) DO NOTHING
                `, [
                    `DP-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                    new Date().toISOString(),
                    usuarioId,
                    200, // En métricas generales asumimos 200, o podemos buscar la métrica de errores
                    requestPath
                ]);
                
                if (result.rowCount > 0) nuevos++;
            }
        }

        res.json({ 
            success: true, 
            procesados: dataPoints.length, 
            nuevos_en_db: nuevos 
        });

    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (client) client.release();
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Puerto ${PORT}`));