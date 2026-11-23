require('dotenv').config();
const { Pool } = require('pg');

const poolConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'conectfield',
        password: process.env.DB_PASS || 'admin',
        port: Number(process.env.DB_PORT) || 5432
    };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
    console.error('Erro inesperado no PostgreSQL:', err);
});

module.exports = pool;
