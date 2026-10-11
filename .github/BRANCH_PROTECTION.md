# Branch protection / merge gate

This repository runs GitHub Actions workflow **CI** (`.github/workflows/ci.yml`) on every
push and pull request. The final job is named **`CI`**.

To **block merges** when tests fail, require that check on your default branch:

## Via GitHub UI

1. Settings → Branches → Branch protection rules (or Rulesets)
2. Protect `main` (or `master` / `develop`)
3. Enable **Require status checks to pass before merging**
4. Select the status check named **`CI`**
5. Optionally enable **Require branches to be up to date before merging**

## Via GitHub CLI

```bash
gh api repos/{owner}/{repo}/branches/main/protection \
  --method PUT \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["CI"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null
}
EOF
```

Until the check is marked required, failing CI still shows red on the PR but will not
block the merge button.
