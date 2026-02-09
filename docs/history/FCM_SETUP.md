# Firebase Cloud Messaging (FCM) Setup Guide

## U16: Push Notifications Implementation

This document provides step-by-step instructions for configuring Firebase Cloud Messaging (FCM) to enable push notifications in NYU Buddy.

---

## 📋 Prerequisites

- Firebase project already configured (✅ You have this)
- Access to Firebase Console
- Node.js and npm installed

---

## 🔧 Setup Steps

### 1. Generate Web Push Certificate (VAPID Key)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **nyu-buddy**
3. Navigate to **Project Settings** (gear icon) → **Cloud Messaging** tab
4. Scroll down to **Web Push certificates** section
5. Click **Generate key pair** button
6. Copy the generated key (starts with `B...`)

### 2. Add VAPID Key to Environment Variables

Add the VAPID key to your `.env.local` file:

```bash
# Firebase Cloud Messaging VAPID Key
NEXT_PUBLIC_FIREBASE_VAPID_KEY=YOUR_VAPID_KEY_HERE
```

**Example:**
```bash
NEXT_PUBLIC_FIREBASE_VAPID_KEY=BKZr8fG...YOUR_ACTUAL_KEY_HERE...kL2pQ
```

### 3. Update Service Worker (Already Done ✅)

The service worker is located at:
- `public/firebase-messaging-sw.js`

This file handles background notifications when the app is not in focus.

### 4. Deploy Backend Functions

The backend notification functions are already implemented:
- `functions/src/utils/notifications.ts` - Notification helper
- `functions/src/offers/create.ts` - Sends "offer received" notification
- `functions/src/offers/respond.ts` - Sends "match created" notification

Deploy the functions:
```bash
cd functions
npm run deploy
```

Or deploy all functions:
```bash
firebase deploy --only functions
```

### 5. Test Notifications

#### Testing Locally:

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Open the app in a browser (Chrome recommended)

3. Sign in with a verified account

4. You should see a notification permission prompt

5. Click "Enable" to grant notification permission

6. Test by:
   - Creating an offer from another account
   - Accepting an offer to create a match

#### Testing in Production:

1. Deploy the frontend:
   ```bash
   npm run build
   firebase deploy --only hosting
   ```

2. Visit your production URL
3. Follow the same testing steps as above

---

## 📱 Notification Types

### 1. Offer Received Notification
**Trigger:** When a user receives an offer from another user

**Format:**
- **Title:** "New Offer Received! 🎉"
- **Body:** "You received an offer from [DisplayName]"
- **Data:** `{ type: 'offer_received', offerId: '...' }`

### 2. Match Created Notification
**Trigger:** When a match is successfully created

**Format:**
- **Title:** "Match Created! 🎊"
- **Body:** "You have successfully matched with [DisplayName]"
- **Data:** `{ type: 'match_created', matchId: '...' }`

---

## 🔍 Troubleshooting

### Issue: "VAPID key not configured" error

**Solution:** Make sure you've added the VAPID key to `.env.local` and restarted the dev server.

### Issue: Notifications not showing in browser

**Possible Causes:**
1. **Permission denied:** User clicked "Block" on the permission prompt
   - Solution: User must manually re-enable in browser settings

2. **Service worker not registered:** Check browser console for errors
   - Solution: Ensure `firebase-messaging-sw.js` is in the `public` folder

3. **Invalid FCM token:** Token expired or invalid
   - Solution: Clear browser cache and request permission again

### Issue: Notifications work locally but not in production

**Possible Causes:**
1. **Environment variable not set:** VAPID key not configured in production
   - Solution: Add the variable to your hosting environment (Vercel, Firebase Hosting, etc.)

2. **Service worker path incorrect:** Service worker not accessible at root
   - Solution: Ensure service worker is at `/firebase-messaging-sw.js`

---

## 🔒 Security Notes

1. **VAPID Key:** Safe to expose in client-side code (it's public by design)
2. **FCM Tokens:** Automatically managed and refreshed by Firebase SDK
3. **Invalid Tokens:** Automatically cleaned up by the backend when detected
4. **Token Storage:** Tokens stored in Firestore `users` collection under `fcmToken` field

---

## 📊 Monitoring

### Check Notification Delivery:

1. **Firebase Console → Cloud Messaging:**
   - View notification history
   - Check delivery rates
   - Monitor errors

2. **Backend Logs:**
   ```bash
   firebase functions:log
   ```

   Look for:
   - `[Notification] Successfully sent to user...`
   - `[Notification] Cleared invalid FCM token...`

3. **Browser Console:**
   - `[Notifications] FCM token obtained`
   - `[Notifications] FCM token saved to Firestore`
   - `[Notifications] Foreground message received`

---

## ✅ Verification Checklist

Before marking U16 as complete, verify:

- [ ] VAPID key generated and added to `.env.local`
- [ ] Service worker file exists at `public/firebase-messaging-sw.js`
- [ ] Backend functions deployed with notification triggers
- [ ] Notification prompt shows to users without permission
- [ ] Clicking "Enable" requests permission successfully
- [ ] Offer notification sent when offer is created
- [ ] Match notification sent when match is created (both users)
- [ ] Notifications show in browser (both foreground and background)
- [ ] Invalid tokens automatically cleaned up
- [ ] Production deployment tested

---

## 📚 Additional Resources

- [Firebase Cloud Messaging Web Guide](https://firebase.google.com/docs/cloud-messaging/js/client)
- [Web Push Notifications Protocol](https://developers.google.com/web/fundamentals/push-notifications)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

---

**Last Updated:** 2026-02-08
**Status:** Ready for configuration and testing