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
        
        // 1. Buscamos directamente las ENTIDADES (SERVICE_METHOD) 
        // Esto lista todos los endpoints que Dynatrace conoce en el DataPower
        const entitySelector = encodeURIComponent('type(SERVICE_METHOD),entityName.contains("customer-account-profiling")');
        const url = `${DT_BASE_URL}/entities?entitySelector=${entitySelector}&pageSize=100`;
        
        console.log("📡 Buscando entidades de tipo API en el inventario...");
        
        const response = await axios.get(url, { 
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
        });

        const apisEncontradas = response.data.entities || [];
        console.log(`📊 APIs detectadas en el inventario: ${apisEncontradas.length}`);

        let nuevos = 0;
        for (const api of apisEncontradas) {
            const requestPath = api.displayName; // En SERVICE_METHOD, el displayName es la URL o el nombre del método

            console.log(`✅ Procesando: ${requestPath}`);

            // Extraemos el teléfono de la URL
            const phoneMatch = requestPath.match(/phone-numbers\/(\d+)/);
            const usuarioId = phoneMatch ? phoneMatch[1] : "Sistema/Anonimo";

            // Insertamos en Neon
            const result = await client.query(`
                INSERT INTO monitor_usuarios (trace_id, timestamp_evento, usuario_id, status_code, endpoint)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (trace_id) DO NOTHING
            `, [
                `INV-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                new Date().toISOString(),
                usuarioId,
                200,
                requestPath
            ]);
            
            if (result.rowCount > 0) nuevos++;
        }

        res.json({ 
            success: true, 
            procesados: apisEncontradas.length, 
            nuevos_en_db: nuevos,
            metodo: "Inventario de Entidades"
        });

    } catch (e) {
        res.status(500).json({ error: e.message, detalle: e.response?.data });
    } finally {
        if (client) client.release();
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor Power CRM Monitor corriendo en puerto ${PORT}`);
});