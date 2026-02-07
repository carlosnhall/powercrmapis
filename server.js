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
app.get('/api/discover-fields', async (req, res) => {
    // Usamos el endpoint de 'entities' que es el que te funcionó antes
    // pero filtrando por el nombre de tu API de perfilado
    const url = `https://${DT_DOMAIN}/api/v2/entities?entitySelector=type(SERVICE),name.count("perfilado-customer-account-api")`;
    
    try {
        const response = await axios.get(url, { 
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
        });
        
        // Esto nos confirmará si Dynatrace ve el servicio y cuál es su ID exacto
        res.json(response.data);
    } catch (e) {
        console.error(`[❌] Error: ${e.message}`);
        res.status(e.response?.status || 500).json({ 
            error: e.message, 
            detalle: e.response?.data 
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