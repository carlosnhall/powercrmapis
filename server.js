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
        
        // 1. Usamos la métrica de recuento que no requiere permisos de trazas
        // Consultamos el tráfico del último tiempo desglosado por el nombre del método (URL)
        const metricSelector = 'builtin:service.requestCount.total:splitBy("dt.entity.service.keyRequest")';
        const url = `${DT_BASE_URL}/metrics/query?metricSelector=${metricSelector}&from=now-1h&resolution=1m`;
        
        console.log("📡 Consultando historial de tráfico (Métricas)...");
        
        const response = await axios.get(url, { 
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
        });

        const data = response.data.result[0]?.data || [];
        let nuevos = 0;

        for (const item of data) {
            const requestPath = item.dimensionMap["dt.entity.service.keyRequest"] || "";
            
            // Solo procesamos si es tu API de Power CRM
            if (requestPath.toLowerCase().includes("customer-account-profiling")) {
                
                // Las métricas traen una serie de puntos (timestamps y valores)
                for (const valuePair of item.values) {
                    const count = valuePair[1];
                    const timestamp = new Date(valuePair[0]).toISOString();

                    if (count > 0) {
                        // Intentamos extraer el teléfono si viene en la URL de la métrica
                        const phoneMatch = requestPath.match(/phone-numbers\/(\d+)/);
                        const usuarioId = phoneMatch ? phoneMatch[1] : "Usuario-Activo";

                        // Insertamos: usamos el timestamp + path como clave única para no duplicar
                        const result = await client.query(`
                            INSERT INTO monitor_usuarios (trace_id, timestamp_evento, usuario_id, status_code, endpoint)
                            VALUES ($1, $2, $3, $4, $5)
                            ON CONFLICT (trace_id) DO NOTHING
                        `, [
                            `METRIC-${valuePair[0]}-${requestPath.slice(-10)}`, // ID único basado en tiempo
                            timestamp,
                            usuarioId,
                            200,
                            requestPath
                        ]);
                        
                        if (result.rowCount > 0) nuevos++;
                    }
                }
            }
        }

        res.json({ 
            success: true, 
            puntos_de_trafico_capturados: nuevos,
            mensaje: "Sincronización por métricas completada" 
        });

    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (client) client.release();
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor Power CRM Monitor corriendo en puerto ${PORT}`);
});