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
    // Eliminamos el filtro de nombre para ver TODO lo que hay disponible
    const entitySelector = encodeURIComponent('type(SERVICE)');
    const url = `https://${DT_DOMAIN}/api/v2/entities?entitySelector=${entitySelector}&pageSize=100`;
    
    try {
        console.log("Consultando todos los servicios en:", url);
        const response = await axios.get(url, { 
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
        });

        if (!response.data.entities || response.data.entities.length === 0) {
            return res.json({ 
                message: "Dynatrace no reporta ningún servicio con este Token.",
                permisos: "Verificá que el Token tenga 'entities.read' v2" 
            });
        }
        
        // Muestra la lista completa para que busquemos la API de perfilado manualmente
        res.json({
            total_en_dynatrace: response.data.totalCount,
            lista_servicios: response.data.entities.map(e => ({
                id: e.entityId,
                nombre: e.displayName
            }))
        });
    } catch (e) {
        res.status(500).json({ 
            error: "Error en el barrido total",
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