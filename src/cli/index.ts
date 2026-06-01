#!/usr/bin/env node
import { Command } from 'commander';
import { initVault } from './commands/init.js';
import { reindexVault } from './commands/reindex.js';
import { serveVault } from './commands/serve.js';
import { statusCmd } from './commands/status-cmd.js';

const program = new Command();

program.name('kb0').description('The knowledge base layer for AI agents').version('0.1.0');

program.command('init <name>').description('Initialize a new vault').action(initVault);

program
  .command('reindex')
  .description('Index or reindex notes in the current vault')
  .option('--rebuild', 'rebuild the full index from scratch', false)
  .action(reindexVault);

program
  .command('serve')
  .description('Start the MCP server for a vault')
  .option('--vault <path>', 'vault directory (default: cwd)')
  .option('--agent <name>', 'agent identity for provenance (required)')
  .option('--strict', 'fail if .vault-policy.yaml is absent', false)
  .action(serveVault);

program
  .command('status')
  .description('Show vault status and index health')
  .option('--vault <path>', 'vault directory (default: cwd)')
  .action(statusCmd);

program.parse();
