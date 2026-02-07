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
// Usamos el dominio que me pasaste antes
const DT_DOMAIN = 'ftr18515.live.dynatrace.com';
const DT_URL = `https://${DT_DOMAIN}/api/v2/v1/query/execute`;
const DT_TOKEN = process.env.DT_TOKEN;

// --- ENDPOINT 1: DESCUBRIMIENTO ---
// Usalo para ver qué atributos captura Dynatrace de tu API
app.get('/api/discover-fields', async (req, res) => {
    try {
        const dqlQuery = {
            query: `fetch spans
                    | filter contains(http.url, "perfilado-customer-account-api")
                    | limit 1`
        };

        const response = await axios.post(DT_URL, dqlQuery, {
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` }
        });

        if (response.data.results.length === 0) {
            return res.json({ message: "No se encontraron trazas. Asegurate de que la API tenga tráfico." });
        }

        res.json(response.data.results[0]);
    } catch (error) {
        console.error('Error en descubrimiento:', error.response?.data || error.message);
        res.status(500).json({ error: 'Error al explorar atributos' });
    }
});

// --- ENDPOINT 2: SINCRONIZACIÓN ---
// Este es el que busca los datos y los mete en la tabla 'monitor_usuarios'
app.get('/api/sync-users', async (req, res) => {
    let client;
    try {
        client = await pgPool.connect();
        
        // NOTA: Una vez que sepas el nombre del atributo del usuario, 
        // cambialo abajo donde dice: attributes["http.user_id"]
        const dqlQuery = {
            query: `fetch spans
                    | filter contains(http.url, "perfilado-customer-account-api")
                    | fields timestamp, 
                             trace_id,
                             user = attributes["http.user_id"], 
                             status = http.status_code, 
                             duration,
                             http.url
                    | filter isNotNull(user)
                    | sort timestamp desc
                    | limit 100`
        };

        const dtRes = await axios.post(DT_URL, dqlQuery, {
            headers: { 'Authorization': `Api-Token ${DT_TOKEN}` }
        });

        const eventos = dtRes.data.results || [];
        let nuevosRegistros = 0;

        for (const ev of eventos) {
            // Insertamos evitando duplicados gracias al trace_id
            const result = await client.query(`
                INSERT INTO monitor_usuarios (trace_id, timestamp_evento, usuario_id, status_code, latencia_ms, endpoint)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (trace_id) DO NOTHING
            `, [
                ev.trace_id, 
                ev.timestamp, 
                ev.user, 
                ev.status, 
                (ev.duration / 1000000).toFixed(2), // Convertimos a milisegundos
                ev['http.url']
            ]);
            
            if (result.rowCount > 0) nuevosRegistros++;
        }

        res.json({ 
            success: true, 
            message: `Sincronización finalizada`, 
            procesados: eventos.length,
            nuevos_en_db: nuevosRegistros 
        });

    } catch (error) {
        console.error('Error en sincronización:', error.message);
        res.status(500).json({ error: error.message });
    } finally {
        if (client) client.release();
    }
});

// Inicio del servidor
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Monitor de Usuarios corriendo en puerto ${PORT}`);
});