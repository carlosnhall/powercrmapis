const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// 1. CONFIGURACIÓN IDÉNTICA A TU SCRIPT FUNCIONAL
const DT_DOMAIN = 'ftr18515.live.dynatrace.com';
const DT_TOKEN = process.env.DT_TOKEN;

const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- ENDPOINT DE DESCUBRIMIENTO ---
// --- ENDPOINT DE DESCUBRIMIENTO CORREGIDO ---
app.get('/api/discover-fields', async (req, res) => {
    // 1. Definimos los servicios de Power CRM que ya vimos en tu lista
    const pcrmServiceId = 'SERVICE-00FFF25CF250FD45'; 
    
    // 2. Buscamos las métricas de las peticiones individuales dentro de ese servicio
    // Esto nos dirá exactamente cómo se llaman los endpoints (las APIs)
    const url = `https://${DT_DOMAIN}/api/v2/metrics/query?metricSelector=builtin:service.keyRequest.count.total:filter(eq("dt.entity.service","${pcrmServiceId}")):splitBy("dt.entity.service.keyRequest")&from=now-2h`;
    
    try {
        const response = await axios.get(url, { 
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
        });

        const data = response.data.result[0]?.data || [];

        if (data.length === 0) {
            return res.json({ 
                message: "No se detectaron operaciones recientes en el servicio de Power CRM.",
                servicio_buscado: pcrmServiceId
            });
        }

        // Mapeamos los nombres de las operaciones encontradas
        const operaciones = data.map(item => ({
            operationId: item.dimensionMap["dt.entity.service.keyRequest"],
            // El nombre suele venir en la metadata o podemos deducirlo
        }));

        res.json({
            mensaje: "Operaciones encontradas en Power CRM",
            data: operaciones
        });
    } catch (e) {
        res.status(500).json({ error: e.message, detalle: e.response?.data });
    }
});

// --- ENDPOINT DE PRUEBA DE BASE DE DATOS ---
app.get('/api/test-db', async (req, res) => {
    try {
        const result = await pgPool.query('SELECT NOW()');
        res.json({ success: true, time: result.rows[0] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));