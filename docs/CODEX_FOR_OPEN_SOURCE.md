# Codex for Open Source — application draft

Official application: <https://openai.com/form/codex-for-oss/>

The current program is aimed at primary or core maintainers of active public
open-source projects, with review signals that include meaningful usage,
ecosystem importance, and evidence of ongoing maintenance. Because ScheduGrr
is new, the strongest application will follow a public tagged release and use
only real adoption evidence—never projected stars, downloads, or contributors.

## Project

**ScheduGrr** is a local-first, privacy-respecting desktop task board and
calendar. It combines visual lists, time-aware daily planning, native calendar
synchronization, and a documented loopback API that lets LLM tools inspect and
update the same tasks a person sees. It requires no hosted account or project
server, and it keeps personal planning data on the user's computer.

Repository: `https://github.com/amilnes1/schedugrr`

## Maintainer

**Alec Milnes** is the project creator, core maintainer, and release owner with
write access to the public repository. The project has used both OpenAI Codex
and Anthropic Claude Opus during development; the maintainer directs, reviews,
tests, and accepts the work.

## Why it matters

Most task applications either require a hosted account or expose data through
provider-specific integrations. ScheduGrr explores a smaller open-source
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

> ScheduGrr is an MIT-licensed, local-first desktop planner with a documented
> loopback API that lets local AI tools inspect and update the same tasks a
> person sees. It offers a reusable privacy-preserving pattern for
> agent-friendly desktop software: no hosted account, a portable data model,
> sandboxed UI, native calendar integration, cross-platform CI, and a tested
> Windows prerelease.

**Why does your project need Codex Security?** (500-character limit)

> ScheduGrr exposes a loopback API that can change personal planning data and
> packages a sandboxed Electron renderer alongside native calendar integration.
> Codex Security would help review authentication and origin boundaries, IPC
> and native bridge safety, dependency risk, path and import validation, and
> calendar OAuth and token-storage work before releases across Windows, macOS,
> and Linux.

**How will you use API credits?** (500-character limit)

> I will use API credits for Codex-assisted pull-request review, issue
> reproduction, release QA, security-boundary testing, dependency and
> documentation maintenance, and contributor support. Planned work includes
> provider-neutral calendar adapters, an optional MCP server, stronger local API
> authentication and permissions, and reproducible Windows, macOS, and Linux
> packaging with automated end-to-end tests.

**Anything else we should know?** (500-character limit)

> ScheduGrr was built with AI-assisted development under human review and is
> maintained by me as creator and release owner. The repository includes an MIT
> license, contributing guide, security policy, roadmap, OpenAPI contract,
> citation metadata, cross-platform CI, and a checksummed Windows prerelease.
> Personal planning data stays on the user's machine; the local API binds to
> loopback only.

The form also requires the ChatGPT-account email, public GitHub username, public
repository URL, and OpenAI Organization ID. Add those directly at submission;
do not commit private account identifiers to the repository.

## Evidence to include with the application

- Public MIT-licensed repository and tagged release.
- Tested, checksummed Windows prerelease plus source archive.
- Board and Calendar screenshots in the README; add a short demo when available.
- Passing UI, API, native-coordination, and packaged-app tests.
- `CONTRIBUTING.md`, `SECURITY.md`, `ROADMAP.md`, and current issues.
- A concise explanation of the loopback API and local-first threat model.
- Any genuine user feedback, downloads, outside issues, or contributions.

This is an application draft, not a claim of eligibility or acceptance. Update
the repository URL, release links, usage evidence, and maintainer contact before
submission through the official Codex for Open Source program page.
