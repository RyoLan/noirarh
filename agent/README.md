# Noira

A self-hosted AI agent that runs on your own computer or server. One gateway, a CLI and a control panel. It asks before it acts, and it keeps working on a schedule while you sleep.

```bash
npm install -g noira          # Windows PowerShell: npm.cmd install -g noira
noira onboard                 # pick Claude, an OpenAI-compatible model, or Ollama
noira start                   # the gateway, in the background
noira                         # chat with it
```

Needs Node 22 or newer.

## What it does

- **Works in a workspace** (`~/.noira/workspace`): reads and writes files, runs shell commands, fetches web pages.
- **Asks first.** Writing files, running commands, fetching URLs, scheduling jobs and building sites wait for your yes in the terminal or the panel. Set each tool to *Always allow*, *Ask me* or *Blocked*.
- **Runs jobs on a schedule** with cron expressions (`noira jobs add "0 8 * * 1-5" "Summarize my notes into report.md"`).
- **Remembers** what you tell it to keep, across conversations.
- **Noira tools**: `scan_launches` reads the Noira launch feed; `build_site` writes a whole single-file website from one sentence.
- **Any model**: Claude (default `claude-opus-5-5`), any OpenAI-compatible endpoint, or a local model through Ollama so prompts never leave the machine.

## Commands

| | |
|---|---|
| `noira onboard` | pick a model and save the key |
| `noira start [--remote]` · `noira stop` · `noira status` | the gateway |
| `noira` · `noira chat` · `noira run "<task>"` | talk to the agent |
| `noira approvals` · `noira approve <id> [--always]` · `noira deny <id>` | what waits for you |
| `noira jobs [add "<cron>" "<task>" \| rm <id> \| run <id> \| on\|off <id>]` | scheduled jobs |
| `noira memory [add "<text>" \| rm <id>]` | memory |
| `noira build "<site idea>" [--out dir]` | vibecode a page into a folder |
| `noira scan [--signal]` | latest launches |
| `noira panel` | open the control panel (installable as an app) |
| `noira pair` | details for the Android app |

## Security

- The gateway listens on `127.0.0.1:18790` only. Every API call needs the token in `~/.noira/config.json`, and requests for any other host name are refused.
- `noira start --remote` listens on every interface for the phone app. Use it only on a private network such as Tailscale; never expose the port to the internet.
- Keys, memory, jobs, run history and the workspace all live in `~/.noira` (override with `NOIRA_HOME`). `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` override the saved key.
- Shell commands run with your user's permissions once you approve them. Read what you approve.

## Apps

Windows (.exe) and macOS (.dmg) run the gateway for you and keep it in the tray or menu bar. The Android app (.apk) connects to a gateway you run elsewhere. They are built from the same source as this package; see the project's Releases.

MIT licensed.
