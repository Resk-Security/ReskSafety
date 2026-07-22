# RESK MCP Server

MCP (Model Context Protocol) server for the RESK LLM Firewall.  
Allows AI agents (Claude, etc.) to configure and interact with the platform.

## Usage

```bash
# Start the server over stdio (for Claude Desktop / opencode)
python main.py

# Or with env vars:
RESK_BASE_URL=http://localhost:8000 RESK_ADMIN_USER=admin RESK_ADMIN_PASS=changeme python main.py
```

## Integration with opencode

Add to your opencode.json:

```json
{
  "mcpServers": {
    "resk": {
      "command": "python",
      "args": ["/path/to/resk/mcp-server/main.py"],
      "env": {
        "RESK_BASE_URL": "http://localhost:8000",
        "RESK_ADMIN_USER": "admin",
        "RESK_ADMIN_PASS": "changeme"
      }
    }
  }
}
```

## Tools (65 total)

| Category | # Tools | Prefix |
|----------|---------|--------|
| Auth | 2 | `auth_*` |
| Users | 6 | `users_*` |
| Roles | 5 | `roles_*` |
| Capabilities | 4 | `capabilities_*` |
| Providers | 6 | `providers_*` |
| Policies | 7 | `policies_*` |
| Policy Configs | 5 | `configs_*` |
| Policy Rules | 4 | `rules_*` |
| Firewall | 2 | `chat_completions`, `tokenize` |
| Settings | 3 | `settings_*`, `tokenizer_detect` |
| Admin | 8 | `admin_*` |
| Sessions | 3 | `sessions_*` |
| Use Cases | 6 | `use_cases_*` |
