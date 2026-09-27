'use strict';
/* Pintu masuk Vercel: semua /api/* diarahkan ke sini oleh vercel.json. */
const { handle } = require('../lib/router');
module.exports = (req, res) => handle(req, res);
