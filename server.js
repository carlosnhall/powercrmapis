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
    // Corregimos el selector: usamos entityName con contains para evitar errores de sintaxis
    const entitySelector = encodeURIComponent('type(SERVICE),entityName.contains("perfilado-customer-account-api")');
    const url = `https://${DT_DOMAIN}/api/v2/entities?entitySelector=${entitySelector}`;
    
    try {
        const response = await axios.get(url, { 
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
        });
        
        // Si encuentra la entidad, nos dará el entityId (ej: SERVICE-12345)
        res.json(response.data);
    } catch (e) {
        console.error(`[❌] Error: ${e.message}`);
        res.status(e.response?.status || 500).json({ 
            error: "Error en la consulta a Dynatrace",
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