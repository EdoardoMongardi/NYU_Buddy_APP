# Notification Troubleshooting Guide

## 🔴 Current Issues:

### Issue 1: "VAPID key not configured" error on Mac
**Status:** ❌ Not working
**Cause:** Dev server not restarted after adding VAPID key
**Solution:** See below ⬇️

### Issue 2: Badge not showing on mobile
**Status:** ❌ Not showing
**Cause:** Mobile browser limitations or notification support
**Solution:** See below ⬇️

---

## ✅ Fix for Mac/Desktop:

### Step-by-Step:

1. **Stop the dev server:**
   ```bash
   # In terminal, press Ctrl+C
   ```

2. **Verify .env.local exists and has VAPID key:**
   ```bash
   # Open .env.local and verify this line exists:
   NEXT_PUBLIC_FIREBASE_VAPID_KEY=BA6OV0Xz8vvZRC-of98b...
   ```

3. **Restart dev server:**
   ```bash
   npm run dev
   ```

4. **Clear browser cache:**
   - Chrome: Open DevTools (F12) → Right-click refresh button → "Empty Cache and Hard Reload"
   - Or go to `chrome://settings/clearBrowserData` and clear cached files

5. **Test:**
   - Go to `http://localhost:3000/notifications-debug`
   - VAPID Key should show "Yes"
   - Click "Send Test Notification" button
   - You should see a notification!

---

## ✅ Fix for Mobile:

### For Android:

1. **Use Chrome Browser** (not Chrome in iOS, actual Android Chrome)

2. **Check browser console:**
   - On Android Chrome:
     - Connect phone to computer
     - Open Chrome DevTools → More tools → Remote devices
     - Inspect your phone's browser tab
     - Check console for `[NotificationPrompt]` logs

3. **Enable notifications:**
   - The badge SHOULD show on Android Chrome
   - If it doesn't, check console logs

### For iPhone (iOS):

**⚠️ iOS Limitations:**
- Web Push Notifications only work on iOS 16.4+
- Only work in production (HTTPS), not on localhost
- Not supported in Private Browsing
- Chrome on iOS uses Safari engine (same limitations)

**Solution for iOS:**
1. **Deploy to production first:**
   ```bash
   npm run build
   firebase deploy --only hosting
   ```

2. **Test on production URL** (not localhost)

3. **Or skip mobile testing for now** and test on desktop only

---

## 🧪 Testing Checklist:

### Desktop (Mac) - After Restart:

- [ ] Dev server restarted
- [ ] Browser cache cleared
- [ ] Go to `/notifications-debug`
- [ ] VAPID Key shows "Yes"
- [ ] Permission shows "granted"
- [ ] FCM Token shows "Stored"
- [ ] Click "Send Test Notification" → notification appears
- [ ] Open console (F12) → No VAPID errors

### Mobile:

- [ ] Using Android Chrome OR iOS 16.4+ Safari
- [ ] On production HTTPS URL (not localhost for iOS)
- [ ] Banner shows up
- [ ] Click "Enable" → permission prompt appears
- [ ] Check `/notifications-debug` → all green checkmarks

---

## 🔍 Debug Commands:

### Check if VAPID key is loaded:
```bash
# In browser console:
console.log(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY)
# Should print: BA6OV0Xz8vvZRC-of98b...
```

### Check backend logs:
```bash
firebase functions:log --limit 20
```

Look for:
```
[Notification] Successfully sent to user...
```

### Check if notification was sent:
Create an offer from another account, then check backend logs immediately.

---

## ✅ When Everything Works:

You should see:
1. ✅ No VAPID errors in console
2. ✅ Badge shows on desktop
3. ✅ "Enable" button works
4. ✅ Test notification appears
5. ✅ Offer/match notifications arrive

---

## 🆘 Still Not Working?

### Quick Diagnostics:

1. **Open `/notifications-debug`**
2. **Screenshot the status page**
3. **Check browser console for errors**
4. **Share the console output**

Common issues:
- "VAPID key not configured" → Server not restarted
- "Permission denied" → Browser blocked notifications
- "Token not stored" → Firebase rules or auth issue
- Badge not showing → Mobile browser not supported

---

**Last Updated:** 2026-02-08
**Next Step:** Restart dev server and test on Mac first, then worry about mobile later.