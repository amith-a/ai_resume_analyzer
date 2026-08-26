import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import pg from 'pg';

const { Pool } = pg;

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@postgres:5432/resume_db';
const pool = new Pool({
  connectionString: dbUrl,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

// GET /health - API process liveness
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// GET /health/db - PostgreSQL connectivity check
app.get('/health/db', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({
      status: 'ok',
      database: 'connected',
    });
  } catch (error) {
    console.error('Database health check failed:', error);
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
    });
  }
});

// GET /health/ollama - Ollama reachability check
app.get('/health/ollama', async (_req: Request, res: Response) => {
  const ollamaHost = process.env.OLLAMA_HOST || 'http://ollama:11434';
  try {
    const response = await fetch(ollamaHost);
    if (response.ok || response.status < 500) {
      res.status(200).json({
        status: 'ok',
        ollama: 'reachable',
      });
    } else {
      res.status(500).json({
        status: 'error',
        ollama: 'unreachable',
      });
    }
  } catch (error) {
    console.error('Ollama health check failed:', error);
    res.status(500).json({
      status: 'error',
      ollama: 'unreachable',
    });
  }
});

const server = app.listen(port, () => {
  console.log(`Server listening on port ${port} in ${process.env.NODE_ENV || 'development'} mode`);
});

const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}. Starting graceful shutdown...`);
  server.close(async () => {
    console.log('HTTP server closed.');
    try {
      await pool.end();
      console.log('PostgreSQL connection pool drained.');
      process.exit(0);
    } catch (err) {
      console.error('Error closing PostgreSQL pool:', err);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
