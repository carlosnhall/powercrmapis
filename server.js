const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// 1. CONFIGURACIÓN DE BASE DE DATOS (Neon)
// Render usa la variable DATABASE_URL para conectarse a use-monitor-db
const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 2. CONFIGURACIÓN DE DYNATRACE
// Definimos el dominio fijo para evitar errores de 404 por variables faltantes
const DT_DOMAIN = 'ftr18515.live.dynatrace.com';
const DT_TOKEN = process.env.DT_TOKEN;
const DT_QUERY_URL = `https://${DT_DOMAIN}/api/v2/v1/query/execute`;

// --- ENDPOINT DE BIENVENIDA (Para evitar el "Cannot GET /") ---
app.get('/', (req, res) => {
    res.send('🚀 Monitor de Usuarios Activo. Usa /api/discover-fields para explorar o /api/sync-users para sincronizar.');
});

// --- ENDPOINT 1: DESCUBRIMIENTO ---
// Ejecuta esto para ver qué campos (attributes) está capturando Dynatrace
app.get('/api/discover-fields', async (req, res) => {
    try {
        const dqlQuery = {
            query: `fetch spans
                    | filter contains(http.url, "perfilado-customer-account-api")
                    | limit 1`
        };

        const response = await axios.post(DT_QUERY_URL, dqlQuery, {
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` }
        });

        if (!response.data.results || response.data.results.length === 0) {
            return res.status(404).json({ 
                error: "Sin datos", 
                mensaje: "No se encontró actividad reciente para 'perfilado-customer-account-api'." 
            });
        }

        res.json(response.data.results[0]);
    } catch (error) {
        const status = error.response?.status || 500;
        res.status(status).json({ 
            error: "Error en la comunicación con Dynatrace",
            detalle: error.response?.data || error.message
        });
    }
});

// --- ENDPOINT 2: SINCRONIZACIÓN ---
// Busca trazas y las guarda en la tabla 'monitor_usuarios' en Neon
app.get('/api/sync-users', async (req, res) => {
    let client;
    try {
        client = await pgPool.connect();
        
        // Query para traer trazas que tengan un usuario identificado
        // NOTA: Ajustaremos "http.user_id" una vez que lo confirmes con discover-fields
        const dqlQuery = {
            query: `fetch spans
                    | filter contains(http.url, "perfilado-customer-account-api")
                    | fields timestamp, 
                             trace_id,
                             user = attributes["http.user_id"], 
                             status = http.status_code, 
                             duration,
                             url = http.url
                    | filter isNotNull(user)
                    | sort timestamp desc
                    | limit 100`
        };

        const dtRes = await axios.post(DT_QUERY_URL, dqlQuery, {
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` }
        });

        const eventos = dtRes.data.results || [];
        let nuevosRegistros = 0;

        for (const ev of eventos) {
            const result = await client.query(`
                INSERT INTO monitor_usuarios (trace_id, timestamp_evento, usuario_id, status_code, latencia_ms, endpoint)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (trace_id) DO NOTHING
            `, [
                ev.trace_id, 
                ev.timestamp, 
                ev.user, 
                ev.status, 
                (ev.duration / 1000000).toFixed(2), 
                ev.url
            ]);
            
            if (result.rowCount > 0) nuevosRegistros++;
        }

        res.json({ 
            success: true, 
            procesados: eventos.length,
            nuevos_en_db: nuevosRegistros 
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (client) client.release();
    }
});

// 3. INICIO DEL SERVIDOR
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});