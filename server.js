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
        
        // 1. Buscamos las trazas (eventos individuales) de la última hora
        // Filtramos por la entidad de la API que ya sabemos que existe
        const traceUrl = `${DT_BASE_URL}/traces?pageSize=50&from=now-1h`;
        
        console.log("📡 Pidiendo trazas recientes a Dynatrace...");
        
        const response = await axios.get(traceUrl, { 
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
        });

        const trazas = response.data.traces || [];
        console.log(`📊 Trazas encontradas: ${trazas.length}`);

        let nuevos = 0;
        for (const trace of trazas) {
            // Solo nos interesan las que tengan que ver con perfilado
            // Dynatrace nos da el 'name' de la traza, que suele ser el path
            if (trace.name.toLowerCase().includes("customer-account-profiling")) {
                
                // Extraemos el teléfono de la traza (trace.name)
                const phoneMatch = trace.name.match(/phone-numbers\/(\d+)/);
                const usuarioId = phoneMatch ? phoneMatch[1] : "Sistema/HealthCheck";

                const result = await client.query(`
                    INSERT INTO monitor_usuarios (trace_id, timestamp_evento, usuario_id, status_code, endpoint)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (trace_id) DO NOTHING
                `, [
                    trace.traceId, // Usamos el ID real de la traza de Dynatrace
                    new Date(trace.startTime / 1000).toISOString(),
                    usuarioId,
                    trace.statusCode || 200,
                    trace.name
                ]);
                
                if (result.rowCount > 0) nuevos++;
            }
        }

        res.json({ 
            success: true, 
            trazas_procesadas: trazas.length, 
            nuevos_eventos_en_db: nuevos 
        });

    } catch (e) {
        console.error("Error capturando trazas:", e.message);
        res.status(500).json({ error: e.message, detalle: e.response?.data });
    } finally {
        if (client) client.release();
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor Power CRM Monitor corriendo en puerto ${PORT}`);
});