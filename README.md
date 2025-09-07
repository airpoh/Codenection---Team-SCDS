# Codenection---Team-SCDS
Track 1: Student Lifestyle 
Problem Statement: Mental Health Support For Students

Prototype Figma Link:
https://www.figma.com/design/DxEMn6baoYMZQhTvCTKq6r/Code-Nections?node-id=0-1&t=Hpn5lPMdNR5LKFyM-1

UniMate - Mental Health Support App

Our Vision: 
No stigma, More fun, Real support, built into everyday student life.

Problems to Address:
University students face immense pressure from Academic deadlines, Financial burdens, Future uncertainty

Prototype Features:
Tab 1 — Home (Calendar & Smart Reminders)

Purpose: proactive planning to reduce stress.
Calendar Schedule: month header, today pill, list of upcoming items (assignment, exam, club).
Smart Reminders: medicines, bedtime, meeting.

Tab 2 — Island (Main Map Navigation)
Full-screen island map with roads and tap-able buildings (wood plaque labels). Top-right Coins total (user points). Buildings → Features:
Diary Cabin → Journal (emoji mood + short note, Mood Calendar Review).
Community Cafe → Community (Friends Streaks rings, Community Wall with tags).
Challenge Gym → Daily Challenges (micro tasks: 1-3 min breath/grounding games).
Lighthouse → Hotline Call (Emergency); show campus/local numbers and resource links.
Meditation Store → Meditation Music with different kind of themes
Reward Market → Rewards (redeem vouchers & “how to earn” tasks). 

Tab 3 — Profile
Avatar, mood, name, university email.
Summary & View Market
Profile Settings
Notifications and Live Location 
Log out

4 Unique Selling Points (USPs):
1. Student-first Gamified Design
UniMate uses an island interface with buildings as features. This reduces stigma, feels playful, and encourages students to come back daily, not out of obligation but curiosity and fun.
2. Off-Chain Support Token Economy
Every healthy action earns tokens. These can be redeemed for real campus perks like café vouchers, and even counselling passes. We turn self-care into tangible rewards, building a cycle of positive reinforcement
3. Complete Mental-Health Toolkit
From guided meditation and first-aid guides, to SOS safety alerts, mood journaling, and peer communities, UniMate offers a full spectrum of support in one place
4. Feelings Hub (Reflect & Connect)
Here, students can privately journal, share anonymously in Communities, and send Quick Pings to friends. Everything is moderated, safe, and stigma-free — making it easy for students to both express and receive support.

Tech Stack (Implement Phase):
1. Flutter (Dart):
Flutter 3 + Riverpod: UI/state for calendar, coins, community, player.
Dio: HTTP to FastAPI/Supabase REST.
supabase_flutter: Auth (email/magic link), Realtime (Community feed), Storage (media), Postgres access.
flutter_local_notifications: local schedule for medicines/bedtime/meetings.
just_audio: meditation playback (background).
url_launcher: tap-to-call campus/national hotlines.
local_auth + flutter_secure_storage: app lock + secure token storage.
2. Backend:
FastAPI + Pydantic:
Coins/Rewards ledger & redemptions
Challenge cooldowns & validation
Rule-based care suggestions (from schedules/journal patterns)
Moderation flags (mark-for-review)
Supabase:
Postgres: users, events, reminders, journal, posts, coins_ledger, rewards, redemptions, hotlines.
Realtime: Community feed/likes.
Storage: audio files, optional covers.
Auth: tokens verified by FastAPI; no custom JWT.
3. Hosting:
Supabase project (DB/Realtime/Storage/Auth).
Render/Railway for FastAPI (containerized).
