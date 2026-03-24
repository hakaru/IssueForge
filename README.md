# IssueForge

A GitHub Action that automatically creates GitHub Issues from App Store Connect feedback — reviews, crash reports, and submission status changes.

## Quick Start

Add the following workflow to your repository at `.github/workflows/issue-forge.yml`:

```yaml
name: IssueForge
on:
  schedule:
    - cron: '0 */12 * * *'
  workflow_dispatch:

jobs:
  issue-forge:
    runs-on: ubuntu-latest
    steps:
      - uses: hakaru/IssueForge@v2
        with:
          app-store-app-id: ${{ vars.APP_STORE_APP_ID }}
          asc-issuer-id: ${{ secrets.ASC_ISSUER_ID }}
          asc-key-id: ${{ secrets.ASC_KEY_ID }}
          asc-private-key: ${{ secrets.ASC_PRIVATE_KEY }}
```

## Inputs

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `app-store-app-id` | Yes | — | App Store Connect Apple ID (numeric, e.g. `1234567890`) |
| `asc-issuer-id` | Yes | — | App Store Connect API Issuer ID (UUID) |
| `asc-key-id` | Yes | — | App Store Connect API Key ID (e.g. `XXXXXXXXXX`) |
| `asc-private-key` | Yes | — | App Store Connect API Private Key (.p8 file contents) |
| `sources` | No | `reviews,crashes,submission` | Comma-separated list of sources to enable |
| `github-token` | No | `${{ github.token }}` | GitHub token for creating issues |
| `interval-hours` | No | `12` | Time window in hours to fetch data for |
| `labels-prefix` | No | `issue-forge` | Prefix for auto-created labels |

## Outputs

| Name | Description |
|------|-------------|
| `issues-created` | Number of new issues created |
| `issues-updated` | Number of existing issues updated with a new comment |
| `issues-skipped` | Number of candidates skipped (duplicate already exists) |

## App Store Connect API Key Setup

1. Sign in to [App Store Connect](https://appstoreconnect.apple.com).
2. Navigate to **Users and Access** > **Integrations** > **App Store Connect API**.
3. Click **+** to generate a new key. Select the **Developer** role (read-only access is sufficient for reviews and crashes).
4. Download the `.p8` private key file — it can only be downloaded once.
5. Note the **Key ID** and **Issuer ID** displayed on the page.
6. In your GitHub repository, add the following secrets and variables:
   - Secret `ASC_ISSUER_ID` — the Issuer ID
   - Secret `ASC_KEY_ID` — the Key ID
   - Secret `ASC_PRIVATE_KEY` — the full contents of the `.p8` file (including the `-----BEGIN PRIVATE KEY-----` header)
   - Variable `APP_STORE_APP_ID` — your app's numeric Apple ID (found in App Store Connect under **App Information**)

## Supported Sources

| Source key | What it tracks |
|------------|----------------|
| `reviews` | New App Store customer reviews |
| `crashes` | App crashes reported via App Store crash reporting |
| `submission` | App submission and review status changes |

Disable a source by omitting it from the `sources` input:

```yaml
sources: 'reviews,crashes'   # submission events will be ignored
```

## How Deduplication Works

Each issue created by IssueForge contains a hidden HTML comment marker in its body:

```
<!-- issue-forge:<source>:<unique-key> -->
```

Before creating a new issue, IssueForge searches open issues in the repository for a matching marker. The behavior depends on the deduplication strategy of each source:

- **merge** (crashes): if an open issue exists, a new comment is appended instead of opening a duplicate issue. The outcome is counted as `issues-updated`.
- **create-once** (reviews): if an open issue with the same key already exists, the candidate is skipped entirely. The outcome is counted as `issues-skipped`.
- **always-new** (submission): no search is performed; a new issue is always created.

## Label Scheme

IssueForge automatically creates the following labels on first run (using the configured prefix):

| Label | Color | Description |
|-------|-------|-------------|
| `issue-forge` | Blue | All issues created by IssueForge |
| `issue-forge:review` | Yellow | App Store review |
| `issue-forge:appstore-crash` | Red | App Store crash |
| `issue-forge:submission` | Purple | App Store submission |

Use a custom prefix via the `labels-prefix` input to avoid conflicts with existing labels.

## License

MIT
