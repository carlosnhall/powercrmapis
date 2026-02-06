const express = require('express');
const axios = require('axios');
require('dotenv').config();
const cors = require('cors');

const app = express();
app.use(cors());

const DT_URL = process.env.DT_URL; // Ej: https://abc12345.live.dynatrace.com
const DT_TOKEN = process.env.DT_TOKEN;

app.get('/api/user-trace', async (req, res) => {
    try {
        // Consulta DQL: Buscamos en los 'spans' (peticiones individuales)
        // Ajustamos al endpoint específico que necesitás
        const dqlQuery = `
            fetch spans
            | filter http.url == "TU_API_ESPECIFICA"
            | fields timestamp, 
                     user_id = attributes["request.header.user-id"], 
                     status = http.status_code, 
                     duration
            | sort timestamp desc
            | limit 100
        `;

        const response = await axios.post(
            `${DT_URL}/api/v2/v1/query/execute`, 
            { query: dqlQuery },
            { headers: { Authorization: `Api-Token ${DT_TOKEN}` } }
        );

        res.json(response.data.results);
    } catch (error) {
        console.error('Error en Dynatrace:', error.response?.data || error.message);
        res.status(500).json({ error: 'Error al consultar Dynatrace' });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Monitor corriendo en puerto ${PORT}`));