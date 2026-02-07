const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// 1. CONFIGURACIÓN DE IDENTIDAD (Siguiendo tu script original)
const DT_DOMAIN = 'ftr18515.live.dynatrace.com';
const DT_TOKEN = process.env.DT_TOKEN;

// 2. CONFIGURACIÓN DE CONEXIÓN (Usando DATABASE_URL de Render)
const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- ENDPOINT DE DESCUBRIMIENTO (Versión v2 compatible) ---
app.get('/api/discover-fields', async (req, res) => {
    // Usamos la ruta de 'traces' que suele ser más compatible que Grail en algunos tenants
    const url = `https://${DT_DOMAIN}/api/v2/traces?filter=contains(http.url, "perfilado-customer-account-api")&pageSize=1`;
    
    try {
        const response = await axios.get(url, { 
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
        });

        if (!response.data.traces || response.data.traces.length === 0) {
            return res.json({ message: "No se encontraron trazas recientes." });
        }

        // Devolvemos la primera traza para ver sus atributos
        res.json(response.data.traces[0]);
    } catch (e) {
        console.error(`[❌] Error: ${e.message}`);
        res.status(500).json({ error: e.message, detalle: e.response?.data });
    }
});

// --- ENDPOINT DE SINCRONIZACIÓN ---
app.get('/api/discover-fields', async (req, res) => {
    // Cambiamos a USQL (User Sessions Query Language)
    // Buscamos las últimas acciones que contengan el nombre de tu API
    const usqlQuery = encodeURIComponent("SELECT userId, userType, ip, userAgent, city FROM userSession WHERE userAction.name LIKE '*perfilado-customer-account-api*' LIMIT 1");
    const url = `https://${DT_DOMAIN}/api/v2/userSessions/query?query=${usqlQuery}`;

    try {
        const response = await axios.get(url, { 
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
        });

        if (!response.data.values || response.data.results.length === 0) {
            return res.json({ 
                message: "No se encontraron sesiones de usuario para esta API.",
                ayuda: "Asegurate de que el Token tenga el permiso 'UserSessionQueryRequest' (v1 o v2)" 
            });
        }

        res.json({
            columnas: response.data.columnNames,
            datos: response.data.values[0]
        });
    } catch (e) {
        console.error(`[❌] Error: ${e.message}`);
        res.status(e.response?.status || 500).json({ 
            error: e.message, 
            detalle: e.response?.data,
            url_intentada: `https://${DT_DOMAIN}/api/v2/userSessions/query`
        });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Corriendo en puerto ${PORT}`));