import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(SERVER_ROOT, '..');

export const config = {
  port: Number(process.env.PORT) || 8787,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:8787',
  storeDriver: process.env.STORE_DRIVER || 'sqlite',
  associationThreshold: Number(process.env.ASSOCIATION_THRESHOLD) || 70,
  uploadLimitMb: Number(process.env.UPLOAD_LIMIT_MB) || 25,
  ark: {
    apiKey: process.env.ARK_API_KEY || '',
    modelId: process.env.ARK_MODEL_ID || '',
    timeoutMs: Number(process.env.ARK_TIMEOUT_MS) || 60000,
    maxRetries: Number(process.env.ARK_MAX_RETRIES) || 1,
    baseUrl:
      process.env.ARK_BASE_URL ||
      'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
  },
  asr: {
    appId: process.env.ASR_APP_ID || '',
    accessToken: process.env.ASR_ACCESS_TOKEN || '',
    modelId: process.env.ASR_MODEL_ID || process.env.ARK_MODEL_ID || '',
  },
  paths: {
    serverRoot: SERVER_ROOT,
    projectRoot: PROJECT_ROOT,
    publicDir: path.join(PROJECT_ROOT, 'public'),
    dataDir: path.join(SERVER_ROOT, 'data'),
    audioDir: path.join(SERVER_ROOT, 'data', 'audio'),
    promptsDir: path.join(SERVER_ROOT, 'prompts'),
    dbFile: path.join(SERVER_ROOT, 'data', 'app.db'),
  },
};
