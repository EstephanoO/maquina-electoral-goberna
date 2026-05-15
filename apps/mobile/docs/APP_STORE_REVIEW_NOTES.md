# Goberna Territorio — App Store Review Notes

## App Purpose
Field canvassing app for political campaigns in Peru. Agents record contacts, track outreach, and coordinate with campaign managers.

## Demo Credentials
- Phone: +51 999 000 001
- OTP code: 123456
- Campaign code: TEST (if prompted to join a campaign)

## Key Flows to Test
1. Login: Enter phone → receive OTP → enter 123456 → access contacts screen
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
- Map tiles are served from gobernakarte.com (our own tile server)
- Campaign data is fictional/demo data for review purposes
