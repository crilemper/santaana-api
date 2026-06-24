const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3005; // Puerto interno aislado para esta API

app.use(express.json());

// 1. Inicializar la Base de Datos SQLite local en la VPS
const dbPath = path.join(__dirname, 'enlaces.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error al abrir la base de datos interna:', err);
    } else {
        db.run(`CREATE TABLE IF NOT EXISTS urls (
            codigo TEXT PRIMARY KEY,
            url_larga TEXT NOT NULL,
            fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        console.log('Base de datos interna SQLite lista.');
    }
});

// 2. ENDPOINT RECEPCIÓN: Tu script local llamará aquí para guardar la URL gigante
app.post('/api/guardar', (req, res) => {
    const { codigo, urlLarga } = req.body;

    if (!codigo || !urlLarga) {
        return res.status(400).json({ error: 'Faltan parámetros requeridos.' });
    }

    const query = `INSERT OR REPLACE INTO urls (codigo, url_larga) VALUES (?, ?)`;
    db.run(query, [codigo, urlLarga], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: 'Enlace registrado correctamente.' });
    });
});

// 3. ENDPOINT REDIRECCIÓN: Cuando el empleado haga clic en el link corto de WhatsApp
app.get('/b/:codigo', (req, res) => {
    const { codigo } = req.params;

    const query = `SELECT url_larga FROM urls WHERE codigo = ?`;
    db.get(query, [codigo], (err, row) => {
        if (err || !row) {
            // Si no existe el código o ya expiró en GCP, le muestra un HTML limpio al usuario
            return res.status(404).send(`
                <div style="text-align:center; margin-top:50px; font-family:Arial,sans-serif;">
                    <h2>Lo sentimos</h2>
                    <p>El enlace de la boleta no se encuentra disponible o ha expirado.</p>
                </div>
            `);
        }
        
        // Redirección directa y transparente al PDF firmado en Google Cloud
        res.redirect(302, row.url_larga);
    });
});

// 4. ENDPOINT CATCH-ALL: Redirigir cualquier otra ruta (incluyendo la raíz) al sitio principal
app.use((req, res) => {
    res.redirect(301, 'https://www.santaana.com.gt/');
});

app.listen(PORT, () => {
    console.log(`Microservicio Santa Ana corriendo internamente en el puerto ${PORT}`);
});