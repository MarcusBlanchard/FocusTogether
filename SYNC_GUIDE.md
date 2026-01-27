# Sync Guide: Cursor ↔ Replit ↔ GitHub

This guide explains how to keep your code synchronized between Cursor (local), Replit (hosted), and GitHub.

## Repository Structure

The repository is organized into three main sections:

```
FocusTogether/
├── src-tauri/     # Desktop App (developed in Cursor)
├── client/        # Frontend Web App (developed in Replit)
└── server/        # Backend API (developed in Replit)
```

## Current Setup

- **GitHub:** https://github.com/MarcusBlanchard/FocusTogether
- **Cursor (Local):** `/Users/mariablanchard/Downloads/FocusTogether`
- **Replit:** Your Replit project

## Sync Workflows

### Option 1: Git-Based Sync (Recommended)

**From Cursor to GitHub:**
```bash
cd /Users/mariablanchard/Downloads/FocusTogether
git add .
git commit -m "Description of changes"
git push origin main
```

**From GitHub to Replit:**
1. In Replit, open the Shell
2. Run:
```bash
git pull origin main
```

**From Replit to GitHub:**
1. In Replit Shell:
```bash
git add .
git commit -m "Description of changes"
git push origin main
```

**From GitHub to Cursor:**
```bash
cd /Users/mariablanchard/Downloads/FocusTogether
git pull origin main
```

### Option 2: Manual Copy-Paste

For quick changes or when Git isn't set up on Replit:

1. **Cursor → Replit:**
   - Copy changed code from Cursor
   - Paste into Replit editor
   - Save and test

2. **Replit → Cursor:**
   - Copy changed code from Replit
   - Paste into Cursor editor
   - Commit to Git

## Detecting Desync

**Signs that files are out of sync:**
- Different line counts (e.g., `server/routes.ts` has 1812 lines locally vs 1690 on Replit)
- Missing endpoints (404 errors)
- Different behavior (features work in one place but not the other)
- TypeScript errors that don't exist in the other environment

**Quick check:**
```bash
# Compare file sizes
wc -l server/routes.ts  # Local
# Check on Replit: same command
```

## Files That Need Regular Syncing

### High Priority (Sync Frequently)
- `server/routes.ts` - API endpoints
- `server/session-manager.ts` - Session logic
- `client/src/pages/*.tsx` - Frontend pages
- `client/src/hooks/*.ts` - React hooks

### Medium Priority (Sync When Changed)
- `server/storage.ts` - Database operations
- `server/river-server.ts` - WebSocket server
- `client/src/components/*.tsx` - UI components
- `shared/*.ts` - Shared types/schemas

### Low Priority (Rarely Changes)
- `package.json` - Dependencies
- `tsconfig.json` - TypeScript config
- `vite.config.ts` - Vite config

## Setting Up Git on Replit

1. **Open Replit Shell**
2. **Configure Git (if not already done):**
```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

3. **Connect to GitHub:**
```bash
git remote add origin https://github.com/MarcusBlanchard/FocusTogether.git
# Or if already exists:
git remote set-url origin https://github.com/MarcusBlanchard/FocusTogether.git
```

4. **Pull latest changes:**
```bash
git pull origin main
```

## Best Practices

1. **Commit frequently** - Small, focused commits are easier to sync
2. **Write clear commit messages** - Helps track what changed
3. **Test before pushing** - Make sure code works before syncing
4. **Pull before making changes** - Always start with latest code
5. **Document breaking changes** - Update `REPLIT_CHANGES.md` when needed

## Troubleshooting

**Merge conflicts:**
```bash
# On Cursor:
git pull origin main
# Resolve conflicts, then:
git add .
git commit -m "Resolve merge conflicts"
git push origin main
```

**Replit won't pull:**
- Check if you have uncommitted changes: `git status`
- Stash changes: `git stash`
- Pull: `git pull origin main`
- Apply stashed changes: `git stash pop`

**Files missing after pull:**
- Check `.gitignore` - files might be excluded
- Verify files exist in GitHub web interface
- Pull again: `git pull origin main --force`

## Quick Reference

| Action | Cursor Command | Replit Command |
|--------|---------------|----------------|
| Check status | `git status` | `git status` |
| Pull latest | `git pull origin main` | `git pull origin main` |
| Commit changes | `git add . && git commit -m "msg"` | Same |
| Push to GitHub | `git push origin main` | Same |
| View history | `git log --oneline` | Same |
