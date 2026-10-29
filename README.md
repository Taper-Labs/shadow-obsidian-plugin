# Shadow Meetings

**Requires the [Shadow](https://www.shadow.do) Mac app (Apple Silicon, macOS 14.2 or later), which records meetings without a bot and transcribes them on your Mac. This plugin only reads the meeting pages Shadow has already saved in your vault.**

Shadow captures your Mac's system audio and microphone, so nothing joins the Zoom, Google Meet, Teams or Slack call. It transcribes on device and saves each meeting as Markdown in a folder you choose, such as a folder in this vault. Shadow Meetings gives those pages a home in Obsidian: a sidebar list of your meetings, newest first and grouped by day, and quick commands to jump to today's meetings or switch to the Shadow app.

![The Shadow meetings list in the right sidebar, next to an open meeting page](docs/screenshot.png)

## Features

- **Meetings list.** A sidebar view of every Shadow meeting in the vault, newest first, grouped under Today, Yesterday and earlier dates. Each row shows the title, start time, length and attendees. Select a row to open the meeting page; hold Cmd to open it in a new tab. The list updates as soon as Shadow saves a new meeting.
- **Open today's meetings.** One command opens today's meeting page, or lets you choose when there were several.
- **Open Shadow.** A command and a ribbon button that bring the Shadow app to the front through its `shadow-v23://` link.
- **Finds the Shadow folder for you.** The plugin looks for the folder that holds Shadow's `SHADOW.md`. You can also set the folder yourself.

## Requirements and disclosures

- **The Shadow Mac app is required.** The plugin records and transcribes nothing itself. Shadow runs on Apple Silicon Macs with macOS 14.2 or later. Download it at [shadow.do/download](https://www.shadow.do/download).
- **A Shadow account is required.** You sign in to the Shadow app with a link sent to your email.
- **Payment is optional.** The Free plan includes unlimited recording and transcription. AI notes need Shadow Plus, $12/month or $8/month billed yearly. The plugin itself is free and works the same on every plan.
- **No network use.** The plugin makes no network requests and has no telemetry. It reads meeting pages from Obsidian's own index of the vault, never writes to the vault, and never reads files outside it. "Open Shadow" hands a `shadow-v23://open` link to macOS, which opens the app on your Mac.
- **Desktop only.** The Shadow app runs on macOS, so the plugin is marked desktop only.

## Setup

1. Install Shadow and sign in.
2. In Shadow, open **Settings → Meeting → Vault location** and choose this Obsidian vault, or a folder inside it.
3. In Obsidian, install and enable **Shadow Meetings** from **Settings → Community plugins**.
4. The meetings list opens in the right sidebar. To open it later, run **Shadow Meetings: Show meetings list** from the command palette.

## Commands

| Command | What it does |
| --- | --- |
| Show meetings list | Opens the meetings list in the right sidebar. |
| Open today's meetings | Opens today's meeting page, or asks which one when there are several. |
| Open Shadow | Brings the Shadow app to the front. Also on the ribbon. |

The plugin sets no hotkeys. Add your own in **Settings → Hotkeys**.

## Settings

**Shadow folder.** The folder that holds `SHADOW.md`, `Meetings` and `People`, relative to the vault root. Leave it empty to find it automatically. Use `/` when the whole vault is the Shadow folder. Select **Detect** to fill in the folder the plugin found.

## How Shadow lays out the folder

The plugin reads the layout Shadow documents in `SHADOW.md`:

```
<Shadow folder>/
  SHADOW.md
  Meetings/<year>/<month>/<YYYY-MM-DD title>/
    <title>.md          meeting page
    Transcript.md
    Meeting Notes.md, Meeting Outline.md, audio and screenshots
  People/<name> (<email>).md
```

A meeting page has these properties, and the plugin lists every page in `Meetings/` with `type: meeting`:

```yaml
type: meeting
title: "Weekly product sync"
date: 2026-10-29
createdAt: "2026-10-29 00:30 UTC"
startedAt: "2026-10-29 00:30 UTC"
endedAt: "2026-10-29 01:15 UTC"
```

The day comes from `date`, which is the local day the meeting started. Attendees come from the page's `## Attendees` table. Copies that Shadow sets aside under `Unsynced Files/` or `Archived Vaults/` are not listed.

## Development

```bash
npm install
npm run dev      # watch build
npm run build    # type check and production build
npm test         # unit tests
npm run lint
```

Copy `main.js`, `manifest.json` and `styles.css` to `<vault>/.obsidian/plugins/shadow-meetings/` to try a build.

## Support

Questions and bug reports: open an issue in this repository or email support@shadow.do.

## License

[MIT](LICENSE)
