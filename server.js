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
    // Probamos con SERVICE y PROCESS_GROUP_INSTANCE en una sola consulta o rotando el filtro
    // Usamos entityName que es el predicado correcto para v2
    const entitySelector = encodeURIComponent('type(SERVICE),entityName.contains("customer")');
    const url = `https://${DT_DOMAIN}/api/v2/entities?entitySelector=${entitySelector}&pageSize=50`;
    
    try {
        const response = await axios.get(url, { 
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
        });

        if (!response.data.entities || response.data.entities.length === 0) {
            return res.json({ 
                message: "No se encontró nada con 'customer'. Intentá cambiando el filtro a 'perfilado' o 'account' en el código.",
                totalCount: response.data.totalCount
            });
        }
        
        res.json({
            count: response.data.totalCount,
            resultados: response.data.entities.map(e => ({
                id: e.entityId,
                nombre: e.displayName
            }))
        });
    } catch (e) {
        res.status(e.response?.status || 500).json({ 
            error: "Error de sintaxis o conexión",
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