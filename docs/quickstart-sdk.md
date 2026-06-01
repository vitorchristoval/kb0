# Integrating kb0 with your agent

kb0 uses the MCP protocol over stdio. Any MCP client can connect — the agent process spawns kb0 as a subprocess.

## Prerequisites

```bash
npm install -g kb0
kb0 init my-vault
```

---

## Anthropic SDK (Node.js)

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// 1. Connect to vault
const transport = new StdioClientTransport({
  command: 'kb0',
  args: ['serve', '--agent', 'my-agent', '--vault', '/path/to/my-vault'],
  env: { ...process.env },
});

const mcp = new Client({ name: 'my-agent', version: '1.0.0' }, { capabilities: {} });
await mcp.connect(transport);

// 2. Get tools
const { tools } = await mcp.listTools();

// 3. Use with Anthropic (tool_use loop)
const anthropic = new Anthropic();

async function chat(userMessage: string): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage }
  ];

  while (true) {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      tools: tools.map(t => ({
        name: t.name,
        description: t.description ?? '',
        input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
      })),
      messages,
    });

    if (response.stop_reason !== 'tool_use') {
      return response.content
        .filter(b => b.type === 'text')
        .map(b => (b as Anthropic.TextBlock).text)
        .join('');
    }

    // Execute tool calls
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const result = await mcp.callTool({
        name: block.name,
        arguments: block.input as Record<string, unknown>,
      });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: result.content
          .filter(c => c.type === 'text')
          .map(c => (c as { text: string }).text)
          .join(''),
      });
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });
  }
}

// Usage
console.log(await chat('Search for notes about TypeScript'));
console.log(await chat('Write a note: we decided to use Zod for validation'));

await mcp.close();
```

---

## OpenAI SDK (Node.js)

```typescript
import OpenAI from 'openai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'kb0',
  args: ['serve', '--agent', 'gpt-agent', '--vault', '/path/to/my-vault'],
  env: { ...process.env },
});

const mcp = new Client({ name: 'gpt-agent', version: '1.0.0' }, { capabilities: {} });
await mcp.connect(transport);

const { tools } = await mcp.listTools();
const openai = new OpenAI();

const messages: OpenAI.ChatCompletionMessageParam[] = [
  { role: 'user', content: 'Search the vault for architecture notes.' }
];

while (true) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    tools: tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description ?? '',
        parameters: t.inputSchema,
      },
    })),
    messages,
  });

  const choice = response.choices[0];
  if (!choice.message.tool_calls?.length) {
    console.log(choice.message.content);
    break;
  }

  messages.push(choice.message);

  for (const call of choice.message.tool_calls) {
    const result = await mcp.callTool({
      name: call.function.name,
      arguments: JSON.parse(call.function.arguments),
    });
    messages.push({
      role: 'tool',
      tool_call_id: call.id,
      content: result.content
        .filter(c => c.type === 'text')
        .map(c => (c as { text: string }).text)
        .join(''),
    });
  }
}

await mcp.close();
```

---

## LangGraph (Python)

```python
# pip install langchain-mcp-adapters langgraph langchain-anthropic

from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent
from langchain_anthropic import ChatAnthropic

async def main():
    async with MultiServerMCPClient({
        "kb0": {
            "command": "kb0",
            "args": ["serve", "--agent", "langgraph-agent", "--vault", "/path/to/my-vault"],
            "transport": "stdio",
        }
    }) as client:
        tools = client.get_tools()
        model = ChatAnthropic(model="claude-opus-4-8")
        agent = create_react_agent(model, tools)

        result = await agent.ainvoke({
            "messages": [{"role": "user", "content": "What notes do we have about the API design?"}]
        })
        print(result["messages"][-1].content)

import asyncio
asyncio.run(main())
```

---

## Anthropic SDK (Python)

```python
# pip install anthropic mcp

import anthropic
import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main():
    params = StdioServerParameters(
        command="kb0",
        args=["serve", "--agent", "python-agent", "--vault", "/path/to/my-vault"],
    )

    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools_result = await session.list_tools()

            client = anthropic.Anthropic()
            tools = [
                {
                    "name": t.name,
                    "description": t.description or "",
                    "input_schema": t.inputSchema,
                }
                for t in tools_result.tools
            ]

            response = client.messages.create(
                model="claude-opus-4-8",
                max_tokens=1024,
                tools=tools,
                messages=[{"role": "user", "content": "List all notes in the vault."}],
            )

            for block in response.content:
                if block.type == "tool_use":
                    result = await session.call_tool(block.name, block.input)
                    print(result.content[0].text)

asyncio.run(main())
```

---

## Note on stdio vs HTTP

The examples above use stdio transport — kb0 runs as a subprocess spawned by your agent. This works for agents running on the same machine as the vault.

For cloud-hosted agents (Lambda, containers, remote APIs), HTTP transport is planned for a future release. Track progress on [GitHub](https://github.com/vitorchristoval/kb0).
