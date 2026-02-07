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
    // Buscamos directamente en las peticiones HTTP (Web Requests)
    // Esto es más preciso para encontrar APIs que no son "Servicios" formales
    const url = `https://${DT_DOMAIN}/api/v2/metrics/query?metricSelector=builtin:service.keyRequest.count.total:filter(and(or(contains("http.url","perfilado"),contains("http.url","customer"))))&from=now-2h&pageSize=100`;
    
    try {
        const response = await axios.get(url, { 
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
        });

        const resultados = response.data.result[0]?.data || [];

        if (resultados.length === 0) {
            return res.json({ 
                message: "No se encontraron URLs con 'perfilado' o 'customer'.",
                sugerencia: "Probemos listando todas las URLs que pasan por el proceso de Power CRM." 
            });
        }

        res.json({
            mensaje: "¡Encontré estas rutas activas!",
            data: resultados
        });
    } catch (e) {
        res.status(500).json({ 
            error: "Error al buscar por URL", 
            detalle: e.response?.data || e.message 
        });
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