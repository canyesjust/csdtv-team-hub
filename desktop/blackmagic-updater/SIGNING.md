# Signing the app (removes the security warnings)

The build works right now without signing. Unsigned apps just show a warning on
first launch (right-click → Open on Mac, "More info → Run anyway" on Windows).

To make those warnings disappear, add signing certificates as GitHub repo secrets.
The workflow detects them automatically. No secrets = unsigned build, as today.
Secrets present = signed and (on Mac) notarized build. Nothing else changes.

Add secrets at: GitHub repo → Settings → Secrets and variables → Actions → New repository secret.

## macOS — sign + notarize

You need an Apple Developer account ($99/year) and a "Developer ID Application"
certificate. This is a one-time setup.

1. In the Apple Developer portal, create a **Developer ID Application** certificate
   and install it in Keychain Access on a Mac.
2. In Keychain Access, right-click the certificate → Export → save as a `.p12`
   file and set a password.
3. Turn the `.p12` into base64 text (on a Mac):
   ```
   base64 -i Certificate.p12 | pbcopy
   ```
4. Create an **app-specific password** for notarization at appleid.apple.com
   (Sign-In and Security → App-Specific Passwords).
5. Add these six repo secrets:

   | Secret name | Value |
   |---|---|
   | `MACOS_CERT_P12_BASE64` | the base64 text from step 3 |
   | `MACOS_CERT_PASSWORD` | the password you set on the `.p12` |
   | `MACOS_SIGN_IDENTITY` | e.g. `Developer ID Application: Your Name (TEAMID)` |
   | `APPLE_ID` | your Apple ID email |
   | `APPLE_TEAM_ID` | your 10-character Team ID |
   | `APPLE_APP_PASSWORD` | the app-specific password from step 4 |

   Find `MACOS_SIGN_IDENTITY` and `APPLE_TEAM_ID` by running
   `security find-identity -v -p codesigning` on the Mac where the cert is installed.

## Windows — code sign

You need a code-signing certificate. Two kinds:

- **OV (Organization Validation)** — comes as a `.pfx` file, works directly in this
  workflow. Cheaper, but new OV certs may still trip SmartScreen until the app builds
  reputation. This is the simplest path.
- **EV (Extended Validation)** — clears SmartScreen immediately, but ships on a
  hardware token that can't be used in normal CI. For EV, use a cloud signing service
  (Azure Trusted Signing, DigiCert KeyLocker, SSL.com eSigner) instead of the steps
  below. Tell me which service and I'll adjust the workflow.

For an OV `.pfx`:

1. Base64-encode it:
   - Mac/Linux: `base64 -i cert.pfx | pbcopy`
   - Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx")) | Set-Clipboard`
2. Add two repo secrets:

   | Secret name | Value |
   |---|---|
   | `WINDOWS_CERT_PFX_BASE64` | the base64 text |
   | `WINDOWS_CERT_PASSWORD` | the `.pfx` password |

## After adding secrets

Push any change to `desktop/blackmagic-updater/` (or re-run the workflow). The next
build signs the apps. Download from the release and confirm: on Mac the app opens with
no right-click needed; on Windows the publisher name shows in the UAC/SmartScreen prompt.
