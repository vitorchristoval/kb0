import type { Tool } from '../tool-base.js';
import { backlinksTool } from './backlinks.js';
import { deleteTool } from './delete.js';
import { linksTool } from './links.js';
import { listTool } from './list.js';
import { readTool } from './read.js';
import { recentTool } from './recent.js';
import { searchTool } from './search.js';
import { updateTool } from './update.js';
import { writeTool } from './write.js';

export const ALL_TOOLS: Tool[] = [
  searchTool,
  readTool,
  listTool,
  writeTool,
  updateTool,
  deleteTool,
  backlinksTool,
  linksTool,
  recentTool,
];
