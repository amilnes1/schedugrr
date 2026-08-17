# Codex for Open Source — application draft

Official application: <https://openai.com/form/codex-for-oss/>

The current program is aimed at primary or core maintainers of active public
open-source projects, with review signals that include meaningful usage,
ecosystem importance, and evidence of ongoing maintenance. Because OpenAgenda
is new, the strongest application will follow a public tagged release and use
only real adoption evidence—never projected stars, downloads, or contributors.

## Project

**OpenAgenda** is a local-first, privacy-respecting desktop task board and
calendar. It combines visual lists, time-aware daily planning, native calendar
synchronization, and a documented loopback API that lets LLM tools inspect and
update the same tasks a person sees. It requires no hosted account or project
server, and it keeps personal planning data on the user's computer.

Repository: `https://github.com/amilnes1/openagenda`

## Maintainer

**Alec Milnes** is the project creator, core maintainer, and release owner with
write access to the public repository. The project has used both OpenAI Codex
and Anthropic Claude Opus during development; the maintainer directs, reviews,
tests, and accepts the work.

## Why it matters

Most task applications either require a hosted account or expose data through
provider-specific integrations. OpenAgenda explores a smaller open-source
surface: one portable local data model, a native human interface, and an API
that local agents can use without screen scraping or sharing personal tasks
with another service. The same approach can serve as a reference for other
local-first, agent-friendly desktop applications.

## How Codex support would be used

- Maintain and test macOS, Windows, and Linux release workflows.
- Review external pull requests and reproduce contributor-reported bugs.
- Strengthen the native calendar bridge and security boundaries.
- Develop provider-neutral calendar adapters and an optional MCP server.
- Keep API, privacy, and contributor documentation aligned with the code.

## Form-ready draft

**Role:** Primary maintainer

**Why does this repository qualify?** (500-character limit)

> OpenAgenda is an active MIT-licensed local-first desktop planner that pairs a
> humane board and calendar with a documented loopback API for local AI tools.
> It demonstrates a privacy-preserving pattern other agent-friendly desktop
> apps can reuse: one portable data model, no hosted account, sandboxed UI, and
> native Calendar integration. [Add only verified stars, downloads, users,
> issues, or outside contributions before submission.]

**How will you use API credits?** (500-character limit)

> I will use credits for Codex-assisted pull-request review, issue reproduction,
> release QA, security-boundary checks, cross-platform packaging, and maintainer
> automation. Planned open-source work includes provider-neutral calendar
> adapters and an optional MCP server, with tests and documentation kept in sync
> across macOS, Windows, and Linux.

**Anything else we should know?** (500-character limit)

> OpenAgenda keeps personal planning data on the user's own computer and gives
> local tools a narrow, documented API instead of requiring screen scraping or
> a hosted account. The repository discloses AI-assisted development, preserves
> clear human maintainership, and includes contribution, security, citation,
> release, and roadmap documentation.

The form also requires the ChatGPT-account email, public GitHub username, public
repository URL, and OpenAI Organization ID. Add those directly at submission;
do not commit private account identifiers to the repository.

## Evidence to include with the application

- Public MIT-licensed repository and tagged release.
- Signed and notarized macOS installer plus source archive.
- Screenshots or a short demo of Board, Calendar, and Calendar sync.
- Passing UI, API, native-coordination, and packaged-app tests.
- `CONTRIBUTING.md`, `SECURITY.md`, `ROADMAP.md`, and current issues.
- A concise explanation of the loopback API and local-first threat model.
- Any genuine user feedback, downloads, outside issues, or contributions.

This is an application draft, not a claim of eligibility or acceptance. Update
the repository URL, release links, usage evidence, and maintainer contact before
submission through the official Codex for Open Source program page.
