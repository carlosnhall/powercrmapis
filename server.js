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
        
        // Buscamos en el historial de logs de los servicios
        // Cambiamos el query para que sea bien amplio: cualquier log que mencione tu API
        const logQuery = encodeURIComponent('customer-account-profiling');
        const url = `${DT_BASE_URL}/logs/search?query=${logQuery}&from=now-2h`;
        
        console.log("📡 Rastreando logs de actividad...");
        
        const response = await axios.get(url, { 
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` } 
        });

        // Dynatrace v2 Logs devuelve un array 'results'
        const eventos = response.data.results || [];
        let nuevos = 0;

        for (const evento of eventos) {
            const logContent = evento.content || evento.message || "";
            
            // Buscamos el teléfono en el texto del log
            const phoneMatch = logContent.match(/phone-numbers\/(\d+)/);
            const usuarioId = phoneMatch ? phoneMatch[1] : "Usuario-Activo";

            const result = await client.query(`
                INSERT INTO monitor_usuarios (trace_id, timestamp_evento, usuario_id, status_code, endpoint)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (trace_id) DO NOTHING
            `, [
                evento.id || `L-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                evento.timestamp || new Date().toISOString(),
                usuarioId,
                200,
                logContent.substring(0, 200) // Guardamos el fragmento del log
            ]);
            
            if (result.rowCount > 0) nuevos++;
        }

        res.json({ 
            success: true, 
            logs_encontrados: eventos.length, 
            nuevos_usuarios: nuevos 
        });

    } catch (e) {
        // Si el endpoint de logs falla por permisos, intentamos el modo "v1" o reportamos
        console.error("Error en logs:", e.message);
        res.status(500).json({ 
            error: "El Token no tiene permiso de lectura de logs (LogExport)", 
            detalle: e.response?.data || e.message 
        });
    } finally {
        if (client) client.release();
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor Power CRM Monitor corriendo en puerto ${PORT}`);
});