import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT || '3100', 10);
const HOST = process.env.HOST || '127.0.0.1';
const AUDIO_DIR = process.env.AUDIO_DIR || resolve(__dirname, '..', 'audio');
const DB_PATH = process.env.DB_PATH || resolve(__dirname, '..', 'zdb.db');

export { PORT, HOST, AUDIO_DIR, DB_PATH };
