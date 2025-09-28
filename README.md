# Codenection---Team-SCDS
Track 1: Student Lifestyle 
Problem Statement: Mental Health Support For Students

UniMate – User Guide for Testers

Welcome to UniMate! This guide will walk you through installing, logging in, and trying out the main features of our app.

1. Installation

Install Expo Go

On Android: Open Google Play → search for Expo Go → Install.

On iOS: Open App Store → search for Expo Go → Install.

Scan the QR Code (From Camera)

<img width="287" height="285" alt="image" src="https://github.com/user-attachments/assets/500d9099-f6ae-4fd1-a6a1-c48cc2e1f523" />

Open the Expo Go app on your phone.

Use the built-in scanner to scan the QR code we provide (from our Expo project page).

The UniMate app will load inside Expo Go.

✅ You don’t need to install anything else—the app runs directly from our published code.

2. Sign Up / Log In

Open the app, tap Sign Up.

Enter your details:

Name

Student Email

Password (and confirm)

Submit → your account will be created.

Next time, use Log In with your email & password.

ℹ️ If you already have an account, skip sign-up and just log in.

3. Main Features to Test
🏝 Island Home

This is your main hub.

At the top right, you’ll see your total coins (earned from challenges, tasks, and login streaks).

Tap different buildings to enter feature areas:

Reward Market

My Rewards

Challenge Gym

Profile

Lighthouse (Emergency)

🎁 Reward Market

Shows your total coins and today’s earnings.

Two tabs:

Earn → shows actions you can complete (e.g., Login the app, Add a task, Add a reminder, Set mood today, Complete daily challenges).

Redeem → spend your coins on vouchers.

Actions completed turn light purple with a strike-through to indicate you already earned them for today.

🎟 My Rewards

See vouchers you have redeemed.

Each voucher shows a “Use Now” button.

After using, your voucher count decreases and Today’s Redeems increases.

🏋 Challenge Gym

Complete daily challenges to earn coins:

1 daily challenge = +5 coins

3 daily challenges = +10 coins

Coins are added automatically to your balance in Reward Market.

Completed challenges can only reward coins once per day.

📅 Calendar

Create tasks and reminders.

Add a task → you’ll see coins rewarded in Reward Market.

Add a reminder → also earns coins once per day.

😊 Profile

View and edit your details:

Name, phone number, address (editable)

Student email (view only)

Upload or update your avatar.

Select your mood (Thriving, Good, Okay, Stressed, Tired, Down, SOS).

Saving your mood once per day gives +5 coins.

At the top of your profile you’ll see:

Day streak → how many consecutive days you’ve logged in.

Coins → synced with Reward Market.

Challenges completed → shows your gym progress.

🚨 Lighthouse (Emergency)

Choose the type of emergency (Accident, Chest pain, Fire, etc.).

View your Trusted Contacts list.

Each contact has:

WhatsApp button → opens WhatsApp with a prefilled emergency message.

Call button → starts a direct phone call.


Prototype Figma Link:
https://www.figma.com/design/DxEMn6baoYMZQhTvCTKq6r/Code-Nections?node-id=0-1&t=Hpn5lPMdNR5LKFyM-1

UniMate - Mental Health Support App

Our Vision: 
No stigma, More fun, Real support, built into everyday student life.

Problems to Address:
University students face immense pressure from Academic deadlines, Financial burdens, Future uncertainty

UniMate Features:

Tab 1 — Home (Calendar & Smart Reminders):
Purpose: proactive planning to reduce stress.
Calendar Schedule: month header, today pill, list of upcoming items (assignment, exam, club).
Smart Reminders: medicines, bedtime, meeting.

Tab 2 — Island (Main Map Navigation):
Full-screen island map with roads and tap-able buildings (wood plaque labels). Top-right Coins total (user points). Buildings → Features:
Challenge Gym → Daily Challenges (micro tasks: 1-3 min breath/grounding games).
Lighthouse → Hotline Call (Emergency); show campus/local numbers and resource links.
Reward Market → Rewards (redeem vouchers & “how to earn” tasks). 
Diary Cabin (Coming Soon) → Journal (emoji mood + short note, Mood Calendar Review).
Community Cafe (Coming Soon) → Community (Friends Streaks rings, Community Wall with tags).
Meditation Store (Coming Soon) → Meditation Music with different kind of themes.

Tab 3 — Profile:
Avatar, mood, name, university email.
Summary & View Market
Profile Settings
Log out

4 Unique Selling Points (USPs):
1. Student-first Gamified Design:
UniMate uses an island interface with buildings as features. This reduces stigma, feels playful, and encourages students to come back daily, not out of obligation but curiosity and fun.
2. On-Chain Support Token Economy:
Every healthy action earns tokens. These can be redeemed for real campus perks like café vouchers, and even counselling passes. We turn self-care into tangible rewards, building a cycle of positive reinforcement
3. Complete Mental-Health Toolkit:
From trusted contacts, to SOS call, UniMate offers a full spectrum of support in one place.
4. Feelings Hub (Coming Soon):
Here, students can privately journal, share anonymously in Communities, and send Quick Pings to friends. Everything is moderated, safe, and stigma-free — making it easy for students to both express and receive support.

Tech Stack (Implement Phase):

Frontend (Mobile):
React Native (Expo) — cross-platform UI
TypeScript — typed app code
React Navigation — stacks, tabs, deep links
React Native Reanimated — smooth interactions
Storage: AsyncStorage 
Realtime: WebSocket (Supabase Realtime where applicable)
Theming & Icons: Expo vector icons, custom font loading
Build/Dev: Expo CLI, EAS Build/Submit/Updates

Backend:
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

Data & Platform Services (Supabase):
Postgres: users, events, reminders, journal, posts, coins_ledger, rewards, redemptions, hotlines
Realtime: community feed/likes
Storage: audio files + covers
Auth: session tokens verified by FastAPI

Deployment / Hosting:
Mobile: Expo EAS Build → TestFlight / Play Console
Backend: Railway / Render (containerized FastAPI)
Supabase: DB / Realtime / Storage / Auth
CD/CI: GitHub Actions (mobile & API pipelines)
Observability: Sentry (mobile & server), structured API logs
