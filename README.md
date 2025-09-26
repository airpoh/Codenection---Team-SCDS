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

Tab 1 — Home (Calendar & Smart Reminders):
Purpose: proactive planning to reduce stress.
Calendar Schedule: month header, today pill, list of upcoming items (assignment, exam, club).
Smart Reminders: medicines, bedtime, meeting.

Tab 2 — Island (Main Map Navigation):
Full-screen island map with roads and tap-able buildings (wood plaque labels). Top-right Coins total (user points). Buildings → Features:
Diary Cabin → Journal (emoji mood + short note, Mood Calendar Review).
Community Cafe → Community (Friends Streaks rings, Community Wall with tags).
Challenge Gym → Daily Challenges (micro tasks: 1-3 min breath/grounding games).
Lighthouse → Hotline Call (Emergency); show campus/local numbers and resource links.
Meditation Store → Meditation Music with different kind of themes
Reward Market → Rewards (redeem vouchers & “how to earn” tasks). 

Tab 3 — Profile:
Avatar, mood, name, university email.
Summary & View Market
Profile Settings
Notifications and Live Location 
Log out

4 Unique Selling Points (USPs):
1. Student-first Gamified Design:
UniMate uses an island interface with buildings as features. This reduces stigma, feels playful, and encourages students to come back daily, not out of obligation but curiosity and fun.
2. Off-Chain Support Token Economy:
Every healthy action earns tokens. These can be redeemed for real campus perks like café vouchers, and even counselling passes. We turn self-care into tangible rewards, building a cycle of positive reinforcement
3. Complete Mental-Health Toolkit:
From guided meditation and first-aid guides, to SOS safety alerts, mood journaling, and peer communities, UniMate offers a full spectrum of support in one place
4. Feelings Hub (Reflect & Connect):
Here, students can privately journal, share anonymously in Communities, and send Quick Pings to friends. Everything is moderated, safe, and stigma-free — making it easy for students to both express and receive support.

Tech Stack (Implement Phase):

Frontend (Mobile)
React Native (Expo) — cross-platform UI
TypeScript — typed app code
React Navigation — stacks, tabs, deep links
React Native Reanimated — smooth interactions
Storage: AsyncStorage 
Realtime: WebSocket (Supabase Realtime where applicable)
Theming & Icons: Expo vector icons, custom font loading
Build/Dev: Expo CLI, EAS Build/Submit/Updates

Backend
FastAPI (Python 3.11+) — REST & WebSocket
Pydantic — request/response models & validation
Uvicorn — ASGI server
Task Queue (optional): Celery/RQ
Auth: Supabase Auth tokens verified by FastAPI (no custom JWT)

Blockchain
Network: Polygon Amoy testnet (EVM)
Smart Contracts: Solidity 0.8.x
Frameworks: Hardhat, TypeChain
Libraries: OpenZeppelin Contracts
Relayer/Automation: OpenZeppelin Defender Relayer (gasless UX)
Client: web3.py (backend) 
Standards: ERC-20 (WELL token), ERC-1155 (achievements/rewards)

Data & Platform Services (Supabase)
Postgres: users, events, reminders, journal, posts, coins_ledger, rewards, redemptions, hotlines
Realtime: community feed/likes
Storage: audio files + covers
Auth: session tokens verified by FastAPI

Deployment / Hosting
Mobile: Expo EAS Build → TestFlight / Play Console
Backend: Railway / Render (containerized FastAPI)
Supabase: DB / Realtime / Storage / Auth
CD/CI: GitHub Actions (mobile & API pipelines)
Observability: Sentry (mobile & server), structured API logs
