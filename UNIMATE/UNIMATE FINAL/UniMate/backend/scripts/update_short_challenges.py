"""
Update wellness challenges to short boosters (1-2 minutes each)
Replaces long challenges with quick, campus-life focused wellness activities
"""

import sys
sys.path.insert(0, '/Users/quanpin/Desktop/UniMate-hackathon/UniMate/backend')

from models import SessionLocal, Challenge
import time

# Define new short challenges (1-2 minutes each)
SHORT_CHALLENGES = [
    {
        "id": 1,
        "name": "Deep Breathing",
        "description": "Take 1 minute for box breathing: inhale 4 counts, hold 4, exhale 4, hold 4",
        "duration_minutes": 1,
        "points_reward": 50,
        "is_active": True
    },
    {
        "id": 2,
        "name": "Gratitude Moment",
        "description": "Write down 3 things you're grateful for today",
        "duration_minutes": 2,
        "points_reward": 60,
        "is_active": True
    },
    {
        "id": 3,
        "name": "Desk Stretch",
        "description": "Quick shoulder rolls, neck stretches, and wrist rotations",
        "duration_minutes": 2,
        "points_reward": 40,
        "is_active": True
    },
    {
        "id": 4,
        "name": "Mindful Pause",
        "description": "Close your eyes and focus on your breathing for 1 minute",
        "duration_minutes": 1,
        "points_reward": 50,
        "is_active": True
    },
    {
        "id": 5,
        "name": "Desk Organize",
        "description": "Clear and organize your study space for better focus",
        "duration_minutes": 2,
        "points_reward": 50,
        "is_active": True
    },
    {
        "id": 6,
        "name": "Goal Setting",
        "description": "Set 3 priorities for your study session or day",
        "duration_minutes": 2,
        "points_reward": 60,
        "is_active": True
    },
    {
        "id": 7,
        "name": "Brain Break Walk",
        "description": "Take a 2-minute walk around campus or your room",
        "duration_minutes": 2,
        "points_reward": 70,
        "is_active": True
    },
    {
        "id": 8,
        "name": "Hydration Check",
        "description": "Drink a full glass of water right now",
        "duration_minutes": 1,
        "points_reward": 30,
        "is_active": True
    },
    {
        "id": 9,
        "name": "Eye Care Break",
        "description": "20-20-20 rule: Look at something 20 feet away for 20 seconds",
        "duration_minutes": 1,
        "points_reward": 40,
        "is_active": True
    },
    {
        "id": 10,
        "name": "Posture Reset",
        "description": "Check and adjust your sitting posture, feet flat on floor",
        "duration_minutes": 1,
        "points_reward": 30,
        "is_active": True
    }
]

def update_challenges():
    """Replace existing challenges with short boosters"""
    session = SessionLocal()

    try:
        print("=== BEFORE UPDATE ===")
        old_challenges = session.query(Challenge).all()
        for ch in old_challenges:
            print(f"  {ch.id}. {ch.name} ({ch.duration_minutes} min, {ch.points_reward} points)")

        print(f"\n🗑️  Deleting {len(old_challenges)} old challenges...")

        # Delete all existing challenges
        session.query(Challenge).delete()
        session.commit()

        print(f"✅ Deleted all old challenges\n")

        print("=== ADDING NEW SHORT CHALLENGES ===")

        # Add new short challenges
        current_time = int(time.time())

        for challenge_data in SHORT_CHALLENGES:
            challenge = Challenge(
                id=challenge_data["id"],
                name=challenge_data["name"],
                description=challenge_data["description"],
                duration_minutes=challenge_data["duration_minutes"],
                points_reward=challenge_data["points_reward"],
                is_active=challenge_data["is_active"],
                created_at=current_time
            )
            session.add(challenge)
            print(f"  ✅ {challenge.name} ({challenge.duration_minutes} min, {challenge.points_reward} points)")

        session.commit()

        print(f"\n✅ Successfully added {len(SHORT_CHALLENGES)} short challenges!")

        # Verify
        print("\n=== AFTER UPDATE ===")
        new_challenges = session.query(Challenge).all()
        for ch in new_challenges:
            print(f"  {ch.id}. {ch.name} ({ch.duration_minutes} min, {ch.points_reward} points)")

        print(f"\n🎯 Total challenges: {len(new_challenges)}")
        print("⏱️  All challenges are now 1-2 minutes (short boosters)")

    except Exception as e:
        session.rollback()
        print(f"❌ Error: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    print("🔄 Updating wellness challenges to short boosters...\n")
    update_challenges()
    print("\n✅ Update complete!")
