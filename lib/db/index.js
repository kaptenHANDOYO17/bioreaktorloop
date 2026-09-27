'use strict';
/* Memilih penyimpanan: PostgreSQL bila DATABASE_URL/POSTGRES_URL diisi, selain itu berkas JSON lokal. */
const cfg = require('../config');
module.exports = cfg.DATABASE_URL ? require('./pg') : require('./file');
