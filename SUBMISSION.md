# Submitting Shadow Meetings to the Obsidian community directory

Prepared 2026-10-29. Jay does every step below that publishes something.

## How submission works now

Obsidian no longer takes new plugins as pull requests to `obsidianmd/obsidian-releases`. Plugins are added at **community.obsidian.md**, and review is automatic. The `community-plugins.json` file in `obsidian-releases` is now mirrored every hour from `https://community.obsidian.md/assets/community-plugins.json`, so the entry below is created by the directory from our `manifest.json`, not typed in by hand. Sources: [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin) and the `mirror-community-json.yml` workflow in `obsidian-releases`.

If the directory ever asks for the entry, or Obsidian switches back to pull requests, this is it.

## `community-plugins.json` entry

```json
{
	"id": "shadow-meetings",
	"name": "Shadow Meetings",
	"author": "Taper Labs",
	"description": "Turn Shadow meeting notes into Bases tables of meetings and people, see every past meeting with a person, and link today's meetings in your daily note. Requires the Shadow Mac app (Apple Silicon, macOS 14.2+). Never edits Shadow's pages.",
	"repo": "Taper-Labs/shadow-obsidian-plugin"
}
```

Checked on 2026-10-29: `shadow-meetings` and "Shadow Meetings" are not taken in the directory. The description is 237 characters (limit 250) and ends with a period. It leads with the Bases views and the person context because the directory listing is the text AI answers quote; the Shadow requirement stays in the same description. The longer "bot-free, on-device" wording did not fit in 250 characters, so it is in the first paragraph of the README, which the listing page shows. The id has no "obsidian" and does not end in "plugin".

Recently listed plugins show " - This plugin has not been manually reviewed by Obsidian staff." after the description. The directory adds that suffix itself; do not add it to `manifest.json`.

## Release steps

1. **Create the public GitHub repo** `Taper-Labs/shadow-obsidian-plugin` (public, default branch `main`) and push this repository:

   ```bash
   git remote add origin https://github.com/Taper-Labs/shadow-obsidian-plugin.git
   git push -u origin main
   ```

   The repo must be public. The directory reads `README.md`, `LICENSE` and `manifest.json` from the head of `main`.

2. **Check the build** on a clean checkout:

   ```bash
   npm ci
   npm run build
   npm test
   npm run lint
   ```

3. **Tag and release `1.0.0`.** The tag must equal `version` in `manifest.json` exactly, with no `v` prefix (`.npmrc` already sets `tag-version-prefix=""`).

   ```bash
   git tag 1.0.0
   git push origin 1.0.0
   ```

   The `Release Obsidian plugin` workflow (`.github/workflows/release.yml`, from the official sample plugin) builds and creates a **draft** release with `main.js`, `manifest.json` and `styles.css` attached as separate files. Open the draft on GitHub, check the three files are there, and publish it.

   Without Actions, do it by hand:

   ```bash
   npm run build
   gh release create 1.0.0 main.js manifest.json styles.css --title "1.0.0" --notes "First release."
   ```

4. **Submit in the directory.**
   1. Sign in at https://community.obsidian.md with Jay's Obsidian account.
   2. Link the GitHub account that can see `Taper-Labs/shadow-obsidian-plugin`, so the directory can confirm we own the repo.
   3. Choose **Add a plugin** and pick the repo.
   4. Wait for the automated review. If it lists problems, fix them, raise `version` (for example `npm version patch`, which also updates `versions.json`), push, and publish a new release with the same tag as the new version.

5. **After it is live,** post the forum announcement below and update the plugin row in `analysis/aeo-2026-10-29/AEO-FIX.md`.

### Later releases

```bash
npm version patch          # or minor; updates manifest.json, versions.json, package.json
git push origin main --follow-tags
```

Then publish the draft release the workflow creates.

## Known review notes

- `minAppVersion` is 1.10.0, the release whose API first documents Bases views (`@since 1.10.0` in `obsidian.d.ts`). The `.base` file and every feature were tested on Obsidian 1.14.5 only. If someone on 1.10 to 1.13 reports a formula cell error in the Bases views, the likely cause is an older Bases formula engine; raising `minAppVersion` is the quick fix.
- `npm run lint` uses Obsidian's `eslint-plugin-obsidianmd` rules and reports 0 errors. It shows 2 warnings: the settings tab uses `display()`, which Obsidian 1.13 deprecated in favor of `getSettingDefinitions()`. `display()` is kept because the plugin supports Obsidian 1.10 and later, and 1.13+ still calls it. The settings simply won't appear in the 1.13 settings search. If the automated review asks for it, add `getSettingDefinitions()` and raise `minAppVersion` to 1.13.0.
- The plugin writes only a new `Shadow meetings.base` (never overwrites an existing one) and links in today's daily note, both from a command. It never edits a page Shadow manages; the test run checked all 60 files in the Shadow folder were byte-identical afterwards.
- The lint config tells the sentence-case rule that "Shadow", "Mac" and "Bases" are proper nouns. The directory's own check may still flag strings like "Open Shadow"; these are correct as written (Obsidian's style guide keeps proper nouns capitalized).
- `shadow-v23://` is the Shadow app's URL scheme today (`electron-builder.yml`, `APP_DEEP_LINK_SCHEME` in `shadow-frontend`). If the app ever renames it, update `SHADOW_APP_URL` in `src/constants.ts` and release a new version.

## Forum announcement draft (Share & showcase)

Post in https://forum.obsidian.md/c/share-showcase/9 only after the plugin is installable from **Community plugins**. Jay edits it into his own voice.

> **Title:** New plugin: Shadow Meetings, Bases views and person context for meeting notes recorded without a bot
>
> Disclosure: I'm Jay, a co-founder of Shadow, the Mac app this plugin works with. The plugin is free and MIT licensed.
>
> Shadow records meetings on the Mac from system audio and your mic, so no bot joins the Zoom, Meet, Teams or Slack call. It transcribes on device and saves every meeting in your vault in Obsidian's own format: a meeting page with properties (type, title, date, startedAt, endedAt), a page per person, links between meetings and people, and the transcript, notes, audio and Skill results next to each meeting.
>
> Shadow Meetings builds on those files:
> - "Create Shadow meeting views" writes one .base file with three Bases views: all meetings, this week, and people (meeting count, last met, links to each meeting)
> - a context panel: on a person page, every meeting with them and when you last met; on a meeting page, the last earlier meeting with each attendee and one-click buttons for the transcript, notes, audio and Skill results
> - an opt-in command that links today's meetings in your daily note
> - a sidebar list of meetings by day
>
> People are matched the way Shadow matches them: email first, name only when there is no email.
>
> It never edits the pages Shadow manages, makes no network requests and has no telemetry. It writes only the .base file and your daily note, and only when you run those commands.
>
> Requirements: the Shadow app on an Apple Silicon Mac with macOS 14.2 or later, and a Shadow account. The Free plan has unlimited recording and transcription. AI notes need Plus, $12/month or $8/month billed yearly. The Bases views need the Bases core plugin.
>
> Install: Settings → Community plugins → Browse → "Shadow Meetings".
> Source: https://github.com/Taper-Labs/shadow-obsidian-plugin
> Shadow: https://www.shadow.do/obsidian?utm_source=obsidian_forum&utm_medium=post&utm_campaign=plugin_launch
>
> I'd love feedback: which other Bases views would you want for meetings, for example by company or by project?
