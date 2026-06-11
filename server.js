const express = require('express');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const basicAuth = require('express-basic-auth');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL. Crea una base de datos de pruebas en Render y copia su Internal Database URL.');
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const seguridadAdmin = basicAuth({
    users: {
        [process.env.ADMIN_USER || 'carlos']: process.env.ADMIN_PASSWORD || 'CarlosNFC2026'
    },
    challenge: true,
    realm: 'Panel Privado'
});

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function inicializarBaseDatos() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS enlaces (
                id SERIAL PRIMARY KEY,
                titulo TEXT NOT NULL,
                url TEXT NOT NULL,
                posicion INTEGER DEFAULT 0
            );
        `);
        await pool.query('ALTER TABLE enlaces ADD COLUMN IF NOT EXISTS posicion INTEGER DEFAULT 0;');
    } catch (e) {
        console.error('Error al preparar la base de datos:', e);
    }
}

inicializarBaseDatos();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'public', 'uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, 'perfil' + path.extname(file.originalname).toLowerCase());
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/'))
});

function obtenerFotoPerfil() {
    const dir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(dir)) return { existe: false };
    const foto = fs.readdirSync(dir).find((f) => f.startsWith('perfil'));
    return foto ? { existe: true, url: `/uploads/${foto}` } : { existe: false };
}

app.get('/api/enlaces', async (req, res) => {
    try {
        const resBD = await pool.query('SELECT id, titulo, url, posicion FROM enlaces ORDER BY posicion ASC, id ASC');
        res.json(resBD.rows);
    } catch (e) {
        console.error('Error al obtener enlaces:', e);
        res.status(500).json([]);
    }
});

app.get('/api/perfil', (req, res) => {
    res.json(obtenerFotoPerfil());
});

app.get('/admin', seguridadAdmin, (req, res) => {
    res.sendFile(path.resolve(__dirname, 'admin.html'));
});

app.post('/api/enlaces', seguridadAdmin, async (req, res) => {
    try {
        const titulo = String(req.body.titulo || '').trim();
        const url = String(req.body.url || '').trim();
        const posicion = Number.parseInt(req.body.posicion, 10) || 0;
        if (titulo && url) {
            await pool.query(
                'INSERT INTO enlaces (titulo, url, posicion) VALUES ($1, $2, $3)',
                [titulo, url, posicion]
            );
        }
        res.redirect('/admin');
    } catch (e) {
        console.error('Error al guardar enlace:', e);
        res.redirect('/admin');
    }
});

app.post('/api/ordenar-enlaces', seguridadAdmin, async (req, res) => {
    try {
        const posiciones = req.body.posiciones || {};
        for (const [id, pos] of Object.entries(posiciones)) {
            await pool.query('UPDATE enlaces SET posicion = $1 WHERE id = $2', [pos, id]);
        }
        res.json({ success: true });
    } catch (e) {
        console.error('Error al ordenar enlaces:', e);
        res.status(500).json({ success: false });
    }
});

app.post('/api/eliminar-enlace', seguridadAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM enlaces WHERE id = $1', [req.body.id]);
        res.redirect('/admin');
    } catch (e) {
        console.error('Error al eliminar enlace:', e);
        res.redirect('/admin');
    }
});

app.post('/api/perfil/subir', seguridadAdmin, upload.single('imagenPerfil'), (req, res) => {
    res.redirect('/admin');
});

app.post('/api/perfil/eliminar', seguridadAdmin, (req, res) => {
    const dir = path.join(__dirname, 'public', 'uploads');
    if (fs.existsSync(dir)) {
        fs.readdirSync(dir).forEach((file) => {
            if (file.startsWith('perfil')) fs.unlinkSync(path.join(dir, file));
        });
    }
    res.redirect('/admin');
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});
