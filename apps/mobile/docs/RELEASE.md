# Release Workflow — Goberna Territorio

## Two paths: OTA update vs. full build

### Path A — JS/asset-only change (no native code touched)

Use EAS Update to ship the bundle over-the-air. No App Store submission needed.

```bash
# Target the production channel (live users)
eas update --branch production --message "fix: descripcion del cambio"

# Or target preview for internal testers
eas update --branch preview --message "chore: prueba interna"
```

Changes that qualify for Path A:
- Business logic, UI, navigation changes (pure JS/TS)
- Asset swaps (images, fonts) that don't require a new native build
- Dependency upgrades that are JS-only (no native module added)

### Path B — Native change (requires new binary)

Use this path when any of the following occurs:
- A new native dependency is added (e.g., a library with native code)
- `app.json` native configuration is modified (permissions, deep-link schemes, entitlements, `infoPlist`, plugin config)
- Expo SDK version is bumped
- `ios.buildNumber` or `android.versionCode` must be incremented

```bash
# 1. Build the new binary
eas build -p ios --profile production
# (android equivalent: eas build -p android --profile production)

# 2. Submit to App Store / Google Play
eas submit -p ios
```

After the binary is approved and released, any subsequent JS-only changes can again use Path A against the same `version`.

---

## Channels (defined in eas.json)

| Channel | Purpose |
|---|---|
| `production` | Live App Store / Play Store users |
| `preview` | Internal distribution (TestFlight / APK) |
| `development` | Local dev client builds |

---

## runtimeVersion policy: appVersion

`app.json` has:

```json
"runtimeVersion": { "policy": "appVersion" }
```

This means EAS Update computes the runtime version from the `version` field (e.g. `"1.3.0"`). An OTA JS bundle is **only delivered to installed binaries that share the same `version`**.

Practical implication: if you bump `version` in `app.json` (e.g. `1.3.0` → `1.4.0`) you **must** do a full Path B build first. Until that binary reaches users, any `eas update --branch production` targeting `1.4.0` has zero eligible devices. Never bump `version` without following Path B.

---

## Quick checklist before releasing

- [ ] JS-only change? Use Path A.
- [ ] New native dep / SDK bump / `app.json` native config changed? Use Path B.
- [ ] Bumping `version`? Path B required. OTA for the new version only applies after the binary ships.
- [ ] Always include a descriptive `--message` with `eas update` so the EAS dashboard is readable.
