# Goberna Territorio — App Store Review Notes

## App Purpose
Field canvassing app for political campaigns in Peru. Agents record contacts, track outreach, and coordinate with campaign managers.

## Demo Credentials
- Phone field: type `999000001` (the `+51` country prefix is pre-filled and fixed — do not include it)
- OTP code: `123456`
- Campaign code: TEST (if prompted to join a campaign)

## Key Flows to Test
1. Login: Type `999000001` in the phone field (prefix `+51` is already shown) → tap "Recibir código" → enter OTP `123456` → access contacts screen
2. Add contact: Tap (+) → fill name/estado → Save
3. Map: Shows GPS coordinates of contacts on a MapLibre map
4. Follow-ups: Lists contacts with scheduled reminders
5. Profile: Shows user info, logout, delete account

## Permissions Required
- Location: GPS coordinates are captured when adding a field contact (always optional, never required)
- Camera / Photos: Optional photo attached to a contact profile
- Notifications: Scheduled reminders to follow up with contacts

## Data Storage
- Contacts are stored locally on device (SQLite via expo-sqlite)
- Sync to campaign backend happens when online
- Delete Account wipes all local data and deregisters from server

## Notes for Reviewer
- The app requires a valid phone number to receive OTP. Use the demo phone above.
- Map vector tiles are served by the Goberna backend at `https://electoral.goberna.club/api/tiles/{z}/{x}/{y}.vector.pbf`
- Campaign data is fictional/demo data for review purposes

## DEPLOYMENT PREREQUISITE (before submitting the review build)
The demo login bypass is gated by backend environment variables. Before submitting
to App Store review, the production backend MUST have:
- `GOBERNA_DEMO_PHONE=999000001`
- `GOBERNA_DEMO_OTP=123456`
If these are unset, the demo phone falls through to a real WhatsApp OTP send and the
reviewer cannot log in. Verify they are set in the production backend env, then
restart the backend, before submitting.
