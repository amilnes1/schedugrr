# Desktop distribution

ScheduGrr packages the compiled React UI and a Rust backend with Tauri 2.
The desktop app embeds its assets and starts the local API in the same process
on `127.0.0.1:8787`. Chromium, Node.js, and npm dependencies are not shipped.

Install stable Rust, Node.js 20+, and Tauri's platform prerequisites:
<https://v2.tauri.app/start/prerequisites/>.

```sh
npm ci
npm test
npm run build
npm run test:native
npm run desktop:dist
```

On macOS the application is at
`src-tauri/target/release/bundle/macos/ScheduGrr.app` and the compressed DMG is
in `src-tauri/target/release/bundle/dmg/`. The packaging wrapper uses `hdiutil`
with an Applications shortcut and requires no Finder automation permission.
For an Intel/Apple Silicon universal build, install both Rust Mac targets and
run `npm run desktop:dist:universal`.

On Windows run `npm run desktop:dist:win` on Windows with the MSVC tools.
The per-user NSIS installer is in
`src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`. The Windows
workflow also creates a portable ZIP and SHA-256 checksums.

Local Mac artifacts use an ad-hoc signature; public distribution still needs
Developer ID signing and notarization. Windows preview artifacts remain
unsigned. Follow Tauri's signing guides when preparing a public release:

- <https://v2.tauri.app/distribute/sign/macos/>
- <https://v2.tauri.app/distribute/sign/windows/>

No publishing or deployment is performed by the local packaging commands.
Do not commit certificates, passwords, or notarization credentials.


## Publishing a cross-platform preview

Tag builds stage the tested Windows installer, ZIP, and checksums in a draft
GitHub release. They do not publish automatically. Add the Mac Apple Silicon
DMG and app ZIP, verify all asset checksums and the tag's CI/native test runs,
and publish the draft only when every required check has passed. State the
supported architectures, shared WebView2 requirement, and signing/notarization
status in the release notes. A rerun refuses to overwrite a published release.
