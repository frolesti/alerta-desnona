import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getDB } from '../db/database';

type BootstrapState = 'idle' | 'running' | 'completed' | 'failed' | 'skipped';

interface BootstrapStatus {
  state: BootstrapState;
  startedAt: string | null;
  finishedAt: string | null;
  message: string;
}

const status: BootstrapStatus = {
  state: 'idle',
  startedAt: null,
  finishedAt: null,
  message: 'Encara no comprovat',
};

let bootProcessStarted = false;

function resolveRuntimeRoot(): string {
  const candidates = [
    path.resolve(__dirname, '..'),
    path.resolve(__dirname, '../..'),
    path.resolve(__dirname, '../../..'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
  }

  return path.resolve(__dirname, '../../..');
}

function buildBootstrapCommand(runtimeRoot: string): { command: string; args: string[] } | null {
  const compiledScript = path.join(runtimeRoot, 'dist', 'server', 'src', 'daily-update.js');
  if (fs.existsSync(compiledScript)) {
    return {
      command: process.execPath,
      args: [compiledScript],
    };
  }

  const tsxCli = path.join(runtimeRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const sourceScript = path.join(runtimeRoot, 'src', 'daily-update.ts');
  if (fs.existsSync(tsxCli) && fs.existsSync(sourceScript)) {
    return {
      command: process.execPath,
      args: [tsxCli, sourceScript],
    };
  }

  return null;
}

export function getBootstrapStatus(): BootstrapStatus {
  return { ...status };
}

export function startInitialBootstrap(): void {
  if (bootProcessStarted) return;

  const db = getDB();
  const counts = db
    .prepare(`
      SELECT
        (SELECT COUNT(*) FROM desnonaments) AS total_desnonaments,
        (SELECT COUNT(*) FROM adreces) AS total_adreces,
        (SELECT COUNT(*) FROM estadistiques_ine) AS total_ine
    `)
    .get() as { total_desnonaments: number; total_adreces: number; total_ine: number };

  if (counts.total_desnonaments > 0 || counts.total_adreces > 0) {
    status.state = 'skipped';
    status.finishedAt = new Date().toISOString();
    status.message = 'Bootstrap inicial omes: la base de dades ja conté dades';
    return;
  }

  const runtimeRoot = resolveRuntimeRoot();
  const bootstrapCommand = buildBootstrapCommand(runtimeRoot);

  if (!bootstrapCommand) {
    status.state = 'failed';
    status.finishedAt = new Date().toISOString();
    status.message = 'No s\'ha trobat el pipeline d\'actualització automàtica';
    console.error('❌ Bootstrap inicial: no s\'ha trobat daily-update.ts/js');
    return;
  }

  bootProcessStarted = true;
  status.state = 'running';
  status.startedAt = new Date().toISOString();
  status.finishedAt = null;
  status.message = 'Sincronitzant dades inicials de desnonaments';

  console.log('🚀 Base de dades buida detectada. Iniciant bootstrap automàtic...');

  const child = spawn(bootstrapCommand.command, bootstrapCommand.args, {
    cwd: runtimeRoot,
    stdio: 'inherit',
    env: process.env,
  });

  child.on('error', (error) => {
    status.state = 'failed';
    status.finishedAt = new Date().toISOString();
    status.message = `Error iniciant el bootstrap: ${error.message}`;
    console.error('❌ Error iniciant bootstrap automàtic:', error);
  });

  child.on('exit', (code) => {
    status.finishedAt = new Date().toISOString();
    if (code === 0) {
      status.state = 'completed';
      status.message = 'Dades inicials sincronitzades correctament';
      console.log('✅ Bootstrap automàtic completat');
      return;
    }

    status.state = 'failed';
    status.message = `Bootstrap finalitzat amb codi ${code ?? 'desconegut'}`;
    console.error(`❌ Bootstrap automàtic fallit amb codi ${code ?? 'desconegut'}`);
  });
}