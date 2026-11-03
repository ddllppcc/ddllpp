#!/usr/bin/env node
// ddllpp MCP server (stdio). Tools are listed; doubles wake at release.
import { createInterface } from 'node:readline';

const SOON = 'ddllpp: soon. doubles wake at release — https://ddllpp.cc';
const TOOLS = [
  { name: 'spawn', description: "Spawn the double of a Solana wallet: trained on its whole history, trading its style from your wallet.", inputSchema: { type: 'object', properties: { wallet: { type: 'string', description: 'Solana address to clone' } }, required: ['wallet'] } },
  { name: 'status', description: 'Show your doubles and what they are doing.', inputSchema: { type: 'object', properties: {} } },
];

const send = (m) => process.stdout.write(JSON.stringify(m) + '\n');
createInterface({ input: process.stdin }).on('line', (line) => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.id === undefined) return; // notification
  const ok = (result) => send({ jsonrpc: '2.0', id: m.id, result });
  switch (m.method) {
    case 'initialize': return ok({ protocolVersion: m.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'ddllpp', version: '0.1.0' } });
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: TOOLS });
    case 'tools/call': return ok({ content: [{ type: 'text', text: SOON }] });
    default: return send({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'method not found' } });
  }
});
