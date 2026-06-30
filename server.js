const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cron = require('node-cron');

const app = express();
const PORT = 3005;

// 1. Crear carpeta oculta para guardar los PDFs físicamente
const dirUploads = path.join(__dirname, 'boletas_ocultas');
if (!fs.existsSync(dirUploads)) fs.mkdirSync(dirUploads, { recursive: true });

// Configurar Multer para recibir el archivo físico
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dirUploads),
    filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

app.use(express.json());

// 2. Conectar a la Base de Datos actual
const dbPath = path.join(__dirname, 'enlaces.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (!err) {
        // Mantenemos intacta tu tabla vieja ("urls")
        // Y creamos una NUEVA tabla ("boletas_locales") para la nueva arquitectura
        db.run(`CREATE TABLE IF NOT EXISTS boletas_locales (
            codigo TEXT PRIMARY KEY,
            ruta_archivo TEXT NOT NULL,
            fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        console.log('Base de datos bilingüe lista.');
    }
});

// 3. ENDPOINT RECEPCIÓN: Ahora guardamos en la tabla NUEVA
app.post('/api/upload', upload.single('archivo'), (req, res) => {
    const { codigo } = req.body;
    const archivo = req.file;

    if (!codigo || !archivo) {
        return res.status(400).json({ error: 'Faltan parámetros' });
    }

    const query = `INSERT OR REPLACE INTO boletas_locales (codigo, ruta_archivo) VALUES (?, ?)`;
    db.run(query, [codigo, archivo.filename], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Archivo guardado en VPS' });
    });
});

// 4. ENDPOINT REDIRECCIÓN: El cerebro de la migración suave
app.get('/b/:codigo', (req, res) => {
    const { codigo } = req.params;

    // A. Buscar primero en la arquitectura NUEVA (Archivos físicos)
    db.get(`SELECT ruta_archivo, fecha_creacion FROM boletas_locales WHERE codigo = ?`, [codigo], (err, rowLocal) => {
        
        if (rowLocal) {
            // ==========================================
            // FLUJO NUEVO: Archivo físico con 90 días
            // ==========================================
            const fechaCreacion = new Date(rowLocal.fecha_creacion + 'Z'); 
            const ahora = new Date();
            const diffDias = (ahora - fechaCreacion) / (1000 * 60 * 60 * 24);

            if (diffDias > 90) {
                return res.status(410).send('<h2 style="text-align:center; margin-top:50px; font-family:Arial;">Su enlace ha expirado por políticas de seguridad (90 días).</h2>');
            }

            const rutaCompleta = path.join(dirUploads, rowLocal.ruta_archivo);
            if (fs.existsSync(rutaCompleta)) {
                res.sendFile(rutaCompleta);
            } else {
                res.status(404).send('<h2 style="text-align:center; margin-top:50px; font-family:Arial;">Archivo físico no encontrado.</h2>');
            }

        } else {
            // ==========================================
            // B. FLUJO VIEJO: Si no está en lo nuevo, buscar en Google Cloud
            // ==========================================
            db.get(`SELECT url_larga FROM urls WHERE codigo = ?`, [codigo], (err, rowGcp) => {
                if (rowGcp) {
                    // Si existe de la quincena pasada, lo mandamos a Google Cloud
                    res.redirect(302, rowGcp.url_larga);
                } else {
                    // Si definitivamente no está en ninguna de las dos tablas
                    res.status(404).send('<h2 style="text-align:center; margin-top:50px; font-family:Arial;">La boleta no existe o fue eliminada.</h2>');
                }
            });
        }
    });
});

// 5. CRON JOB: Autolimpieza de los archivos locales (Solo afecta lo nuevo)
cron.schedule('0 2 * * *', () => {
    console.log('Iniciando limpieza de archivos expirados...');
    const query = `SELECT codigo, ruta_archivo FROM boletas_locales WHERE (julianday('now') - julianday(fecha_creacion)) > 90`;
    
    db.all(query, [], (err, rows) => {
        if (err || !rows) return;
        
        rows.forEach(row => {
            const rutaCompleta = path.join(dirUploads, row.ruta_archivo);
            if (fs.existsSync(rutaCompleta)) {
                fs.unlinkSync(rutaCompleta); 
            }
            db.run(`DELETE FROM boletas_locales WHERE codigo = ?`, [row.codigo]); 
            console.log(`Eliminado por antigüedad: ${row.ruta_archivo}`);
        });
    });
});

// Catch-all: Mandar a la página de Santa Ana
app.use((req, res) => {
    res.redirect(301, 'https://www.santaana.com.gt/');
});

app.listen(PORT, () => {
    console.log(`Servidor de archivos corriendo internamente en el puerto ${PORT}`);
});