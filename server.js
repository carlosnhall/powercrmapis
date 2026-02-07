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
    // Buscamos SERVICE_METHOD, que es donde Dynatrace guarda los endpoints individuales
    const entitySelector = encodeURIComponent('type(SERVICE_METHOD),entityName.contains("perfilado")');
    const url = `https://${DT_DOMAIN}/api/v2/entities?entitySelector=${entitySelector}&pageSize=50`;
    
    try {
        const response = await axios.get(url, { 
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
        });

        if (!response.data.entities || response.data.entities.length === 0) {
            return res.json({ 
                message: "No se encontraron métodos con 'perfilado'. Intentando con 'customer'...",
                ayuda: "Cambiá el filtro en el código a .contains('customer') si este falla."
            });
        }
        
        res.json({
            total: response.data.totalCount,
            apis_encontradas: response.data.entities.map(e => ({
                id: e.entityId,
                nombre_api: e.displayName
            }))
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