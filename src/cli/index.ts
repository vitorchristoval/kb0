#!/usr/bin/env node
import { Command } from 'commander';
import { initVault } from './commands/init.js';
import { reindexVault } from './commands/reindex.js';

const program = new Command();

program.name('kb0').description('The knowledge base layer for AI agents').version('0.1.0');

program.command('init <name>').description('Initialize a new vault').action(initVault);

program
  .command('reindex')
  .description('Index or reindex notes in the current vault')
  .option('--rebuild', 'rebuild the full index from scratch', false)
  .action(reindexVault);

program.parse();
