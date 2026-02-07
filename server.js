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
        
        // 1. Buscamos todas las entidades de tipo SERVICE_METHOD
        // Filtramos por el nombre de la API que ya confirmamos que existe
        // Agregamos 'from=now-2h' para forzar a Dynatrace a buscar actividad reciente
        const entitySelector = encodeURIComponent('type(SERVICE_METHOD),entityName.contains("customer-account-profiling")');
        const url = `${DT_BASE_URL}/entities?entitySelector=${entitySelector}&pageSize=100&from=now-2h`;
        
        console.log("📡 Escaneando inventario de actividad reciente...");
        
        const response = await axios.get(url, { 
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
        });

        const entidades = response.data.entities || [];
        let nuevos = 0;

        for (const entidad of entidades) {
            const requestPath = entidad.displayName;
            
            // Extraemos el teléfono si existe en el nombre de la entidad
            const phoneMatch = requestPath.match(/phone-numbers\/(\d+)/);
            const usuarioId = phoneMatch ? phoneMatch[1] : "Usuario-Activo";

            // Insertamos usando el entityId como clave única para no duplicar lo que ya existe
            const result = await client.query(`
                INSERT INTO monitor_usuarios (trace_id, timestamp_evento, usuario_id, status_code, endpoint)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (trace_id) DO NOTHING
            `, [
                entidad.entityId, // Usamos el ID de Dynatrace como clave única
                new Date().toISOString(),
                usuarioId,
                200,
                requestPath
            ]);
            
            if (result.rowCount > 0) nuevos++;
        }

        res.json({ 
            success: true, 
            total_encontrados: entidades.length,
            nuevos_en_base: nuevos,
            mensaje: "Sincronización por Inventario de Actividad"
        });

    } catch (e) {
        console.error("Error:", e.message);
        res.status(500).json({ error: e.message });
    } finally {
        if (client) client.release();
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor Power CRM Monitor corriendo en puerto ${PORT}`);
});