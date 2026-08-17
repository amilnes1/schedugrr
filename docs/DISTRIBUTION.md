# Desktop distribution

ScheduGrr packages the existing React UI and dependency-free Node API inside an
Electron application. There is no hosted backend: each desktop install runs the
API on `127.0.0.1:8787` and keeps board data in the current user's application-
data directory.

## Build locally

Install dependencies, run the complete test suite, then package for the current
platform:

```bash
npm install
npm test
npm run desktop:dist
```

On macOS this produces:

- `release/ScheduGrr-<version>-<arch>.dmg`
- `release/ScheduGrr-<version>-<arch>-mac.zip`
- `release/mac-<arch>/ScheduGrr.app`

On Windows, `npm run desktop:dist:win` produces:

- `release/ScheduGrr-<version>-x64-setup.exe`
- `release/ScheduGrr-<version>-x64.zip`
- `release/win-unpacked/ScheduGrr.exe`

On macOS, with no explicit signing credentials, the packaging script creates a
valid ad-hoc signature for local QA. Ad-hoc builds are not suitable for a public
macOS download because Gatekeeper expects a Developer ID signature and
notarization. Windows builds remain unsigned until Windows signing is supplied.

## Public macOS release

For public direct downloads, use Developer ID signing and Apple notarization.
Ad-hoc signatures are useful only for local QA and force users through a
Gatekeeper override.

1. Join the [Apple Developer Program](https://developer.apple.com/programs/)
   and complete identity verification. Apple currently charges US$99 per year
   in most regions.
2. In Xcode's Accounts settings or the Apple Developer portal, create a
   **Developer ID Application** certificate. A DMG/ZIP does not need the
   separate Developer ID Installer certificate used for `.pkg` installers.
3. Keep the certificate in the login keychain for local builds, or export it as
   a password-protected `.p12` for CI.
4. Create an App Store Connect API key for notarization and retain its Key ID,
   Issuer ID, Team ID, and one-time-download `.p8` private key.
5. Build with the signing and notarization values below. electron-builder signs
   the hardened app, submits it to Apple's notary service, waits for approval,
   and staples the returned ticket before creating release artifacts.

Provide an explicit Developer ID identity through `CSC_NAME`, or a certificate
through `CSC_LINK` and `CSC_KEY_PASSWORD`, before running
`npm run desktop:dist:universal`.
For notarization, electron-builder can use App Store Connect API credentials:

```bash
export CSC_NAME="Developer ID Application: Your Name (TEAMID)"
export APPLE_API_KEY="$(base64 < /absolute/path/to/AuthKey_XXXXXXXXXX.p8 | tr -d '\n')"
export APPLE_API_KEY_ID="XXXXXXXXXX"
export APPLE_API_ISSUER="00000000-0000-0000-0000-000000000000"
export APPLE_TEAM_ID="TEAMID1234"
npm run desktop:dist:universal
```

Never commit certificates, API keys, passwords, or notarization credentials.

After building, verify the public artifact rather than relying on a successful
exit code alone:

```bash
codesign --verify --deep --strict --verbose=2 release/mac-universal/ScheduGrr.app
spctl --assess --verbose --type exec release/mac-universal/ScheduGrr.app
xcrun stapler validate release/mac-universal/ScheduGrr.app
hdiutil verify release/ScheduGrr-<version>-universal.dmg
```

The Gatekeeper assessment should report `accepted` with a notarized Developer
ID source, and stapler validation should succeed.

## Public Windows release

Build Windows installers on Windows using `npm run desktop:dist:win`; the
checked-in GitHub Actions workflow provides that environment. The NSIS build is
per-user and does not require administrator rights by default. See
`docs/WINDOWS.md` for feature parity and packaged-app QA.

Windows installers do not use Apple notarization. They should eventually be
Authenticode-signed to avoid Unknown Publisher and reduce SmartScreen friction.
Until signing is configured, label Windows artifacts as unsigned previews and
publish their SHA-256 checksums. Microsoft Azure Artifact Signing is the
preferred CI-friendly option where available; a cloud- or hardware-backed EV
certificate is the traditional alternative.

## Platform notes

- Build macOS artifacts on macOS, Windows installers on Windows, and Linux
  packages on Linux so native signing and platform tooling are available.
- `npm run desktop:dist:universal` creates a universal macOS distribution when
  the Electron toolchain supports both architectures. The EventKit bridge is
  compiled before packaging and included as a signed native resource.
- The renderer has no Node access. Native responsibilities remain in
  `desktop/main.mjs` and the local API modules under `server/`.
- The desktop app requires exclusive use of port `8787`. A second ScheduGrr
  launch focuses the existing instance; a different process on that port shows
  a clear startup error.
- Release artifacts are intentionally ignored by Git. Publish them through the
  project's release page rather than checking binaries into source control.

## Release checklist

1. Update the version in `package.json` and user-facing release notes.
2. Run `npm test`, `npm run build`, and `npm audit`.
3. Build the unpacked app and run `npm run test:desktop` against an isolated
   application-data directory.
4. Run `npm run desktop:dist` on each supported platform.
5. Verify the application signature, installer/archive integrity, first launch,
   local API health, import/export, and an edit that survives app restart.
6. On macOS, confirm notarization and Gatekeeper acceptance before publishing.

## GitHub release shape

Publish the source from the maintainer's account and attach the notarized DMG
and ZIP to a signed `v<version>` tag. Keep binaries out of Git history. Each
release should link its changelog, name the supported architecture, include a
SHA-256 checksum, and note any data migration. The repository contains
`AUTHORS.md` and `CITATION.cff` so creator and maintainer attribution remains
unambiguous in source distributions and citations.
