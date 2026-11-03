# ddllpp

AI agent that clones any Solana wallet's trading style.

https://ddllpp.cc · https://x.com/ddllppcc

## MCP

```
claude mcp add ddllpp -- npx -y github:ddllppcc/ddllpp
```

Tools: `spawn`, `status`. Doubles wake at release; until then every call answers "soon".

## site

Static, no build step. Serve `site/` with any static server:

```
cd site && python3 -m http.server 8080
```

- `site/index.html` — the page
- `site/engine/mirror.js` — the mirror, the ink and the double
- `site/ca.json` — `{"ca":""}`; the contract address shows on the seam once it is set
