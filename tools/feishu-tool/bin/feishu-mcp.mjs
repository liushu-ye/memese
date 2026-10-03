#!/usr/bin/env node
import { startServer, dumpTools } from '../src/mcp.mjs';

if (process.argv.includes('--list')) {
  process.stdout.write(dumpTools() + '\n');
} else {
  startServer();
}
