# Node Version Requirements

## ⚠️ CRITICAL: Use Node 20

**Required:** Node 20.x
**Not Supported:** Node 25+

---

## Why Node 20?

1. **Firebase Official Support:** Firebase Functions officially support Node 20
2. **Runtime Issues:** Node 25 has compatibility issues with `firebase-admin@13.6.0`
   - `admin.firestore.Timestamp` is undefined at runtime
   - Workarounds exist but are not production-safe
3. **Emulator Warnings:** Firebase emulator will warn when using unsupported versions

---

## Setup Instructions

### Using nvm (Recommended)

```bash
# Install Node 20
nvm install 20

# Use Node 20 for this project (reads .nvmrc)
nvm use

# Verify
node -v  # Should show v20.x.x
```

### Using fnm

```bash
# Install Node 20
fnm install 20

# Use Node 20
fnm use 20

# Verify
node -v  # Should show v20.x.x
```

### Using Volta

```bash
# Install Node 20
volta install node@20

# Verify
node -v  # Should show v20.x.x
```

---

## CI/CD Configuration

### GitHub Actions

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20'
```

### Vercel (Frontend)

Vercel automatically uses Node 20 for Next.js 14.2.35.

### Firebase Functions (Backend)

Specified in `functions/package.json`:
```json
"engines": {
  "node": "20"
}
```

---

## Troubleshooting

### Emulator Warning

If you see:
```
⚠️  Your requested "node" version "20" doesn't match your global version "25"
```

**Solution:** Use `nvm exec 20 firebase emulators:start` to force Node 20.

### Timestamp Undefined Error

If you see:
```
TypeError: Cannot read properties of undefined (reading 'fromDate')
```

**Cause:** Using Node 25 instead of Node 20.

**Solution:** Switch to Node 20:
```bash
nvm use 20  # or fnm use 20
```

---

## Technical Details

### The Node 25 Issue

In `firebase-admin@13.6.0` with Node 25:
- `admin.firestore.Timestamp` returns `undefined`
- Root cause: Module initialization order changed in Node 25
- Workaround: Import from `firebase-admin/firestore` submodule

**Example of affected code:**
```typescript
// ❌ FAILS in Node 25
const now = admin.firestore.Timestamp.now();

// ✅ WORKS (but not recommended for production)
import { Timestamp } from 'firebase-admin/firestore';
const now = Timestamp.now();
```

**Why the workaround is not recommended:**
- Relies on internal module structure
- May break in future firebase-admin versions
- Not officially supported by Firebase
- Better to use the officially supported Node 20

---

## Enforcement

### Package.json Engines

**Root package.json:**
```json
"engines": {
  "node": ">=20.0.0 <21.0.0",
  "npm": ">=10.0.0"
}
```

**Functions package.json:**
```json
"engines": {
  "node": "20"
}
```

### .nvmrc File

The repository includes `.nvmrc` with `20` to automatically use the correct version.

---

## Quick Check

Run this command to verify your Node version:

```bash
node -v && echo "✅ Using Node $(node -v | cut -c 2-3)" || echo "❌ Node version check failed"
```

Expected output:
```
v20.x.x
✅ Using Node 20
```

---

**Last Updated:** 2026-02-08
**Status:** Enforced in all environments