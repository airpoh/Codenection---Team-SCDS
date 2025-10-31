"""
Seed voucher master data into database
Run this script to populate available vouchers for the reward market
"""

import sys
sys.path.insert(0, '/Users/quanpin/Desktop/UniMate-hackathon/UniMate/backend')

from models import VouchersCatalog, SessionLocal
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Voucher master data (matches rewards.py voucher list)
VOUCHERS = [
    # Food & Beverages
    {
        "id": "food_starbucks_10",
        "title": "Starbucks Malaysia RM10 Voucher",
        "description": "Enjoy premium coffee and beverages at any Starbucks Malaysia outlet",
        "points_required": 500,
        "category": "food",
        "image_url": "https://1000logos.net/wp-content/uploads/2020/05/Starbucks-Logo.png",
        "terms_conditions": "Valid for 30 days from redemption. Cannot be combined with other promotions.",
        "is_active": True
    },
    {
        "id": "food_kfc_15",
        "title": "KFC Malaysia RM15 Voucher",
        "description": "Finger lickin' good! Valid at all KFC Malaysia restaurants",
        "points_required": 750,
        "category": "food",
        "image_url": "https://logos-world.net/wp-content/uploads/2020/04/KFC-Logo.png",
        "terms_conditions": "Valid for 30 days. Not applicable for delivery charges.",
        "is_active": True
    },
    {
        "id": "food_mcd_12",
        "title": "McDonald's Malaysia RM12 Voucher",
        "description": "I'm lovin' it! Use at any McDonald's Malaysia outlet",
        "points_required": 600,
        "category": "food",
        "image_url": "https://logos-world.net/wp-content/uploads/2020/04/McDonalds-Logo.png",
        "terms_conditions": "Valid for 30 days from redemption.",
        "is_active": True
    },

    # Health & Wellness
    {
        "id": "wellness_guardian_20",
        "title": "Guardian Malaysia RM20 Voucher",
        "description": "Health, beauty and wellness products at Guardian pharmacies",
        "points_required": 1000,
        "category": "wellness",
        "image_url": "https://www.guardian.com.my/images/guardian-logo.png",
        "terms_conditions": "Valid for health and beauty products only. Prescription medicines excluded.",
        "is_active": True
    },
    {
        "id": "wellness_fitness_first_trial",
        "title": "Fitness First - 3 Day Trial Pass",
        "description": "Experience premium fitness facilities with a 3-day trial membership",
        "points_required": 400,
        "category": "wellness",
        "image_url": "https://www.fitnessfirst.com.my/images/ff-logo.png",
        "terms_conditions": "New members only. Valid for 7 days from redemption.",
        "is_active": True
    },
    {
        "id": "wellness_yoga_class",
        "title": "Pure Yoga - Single Class Pass",
        "description": "Join a yoga session at Pure Yoga studios across Malaysia",
        "points_required": 350,
        "category": "wellness",
        "image_url": "https://pureyoga.com.my/images/pure-yoga-logo.png",
        "terms_conditions": "Valid for 14 days from redemption. Booking required.",
        "is_active": True
    },

    # Shopping & Services
    {
        "id": "shopping_grab_10",
        "title": "Grab Malaysia RM10 Credit",
        "description": "Use for GrabFood, GrabCar or GrabMart services",
        "points_required": 500,
        "category": "shopping",
        "image_url": "https://logos-world.net/wp-content/uploads/2020/11/Grab-Logo.png",
        "terms_conditions": "Valid for 60 days from redemption date.",
        "is_active": True
    },
    {
        "id": "shopping_shopee_15",
        "title": "Shopee Malaysia RM15 Voucher",
        "description": "Shop online with Malaysia's leading e-commerce platform",
        "points_required": 750,
        "category": "shopping",
        "image_url": "https://logos-world.net/wp-content/uploads/2020/11/Shopee-Logo.png",
        "terms_conditions": "Minimum spend RM30. Valid for 30 days.",
        "is_active": True
    },
    {
        "id": "shopping_lazada_12",
        "title": "Lazada Malaysia RM12 Voucher",
        "description": "Discover millions of products on Lazada Malaysia",
        "points_required": 600,
        "category": "shopping",
        "image_url": "https://logos-world.net/wp-content/uploads/2020/11/Lazada-Logo.png",
        "terms_conditions": "Valid for 30 days. Terms and conditions apply.",
        "is_active": True
    },

    # Education & Learning
    {
        "id": "education_coursera_month",
        "title": "Coursera Plus - 1 Month Free",
        "description": "Access thousands of courses from top universities and companies",
        "points_required": 800,
        "category": "education",
        "image_url": "https://logos-world.net/wp-content/uploads/2021/11/Coursera-Logo.png",
        "terms_conditions": "New subscribers only. Auto-renewal can be cancelled anytime.",
        "is_active": True
    },
    {
        "id": "education_udemy_discount",
        "title": "Udemy - 50% Discount Coupon",
        "description": "Learn new skills with 50% off any Udemy course",
        "points_required": 300,
        "category": "education",
        "image_url": "https://logos-world.net/wp-content/uploads/2021/11/Udemy-Logo.png",
        "terms_conditions": "Valid for 30 days. One coupon per user.",
        "is_active": True
    },

    # Entertainment & Media
    {
        "id": "entertainment_tgv_ticket",
        "title": "TGV Cinemas - Movie Ticket",
        "description": "Enjoy the latest movies at TGV Cinemas nationwide",
        "points_required": 900,
        "category": "entertainment",
        "image_url": "https://www.tgv.com.my/images/tgv-logo.png",
        "terms_conditions": "Valid for regular 2D movies only. Surcharge applies for 3D/IMAX.",
        "is_active": True
    },
    {
        "id": "entertainment_spotify_premium",
        "title": "Spotify Premium - 1 Month",
        "description": "Enjoy ad-free music streaming with Spotify Premium",
        "points_required": 450,
        "category": "entertainment",
        "image_url": "https://logos-world.net/wp-content/uploads/2020/06/Spotify-Logo.png",
        "terms_conditions": "New subscribers only. Auto-renews unless cancelled.",
        "is_active": True
    }
]


def seed_vouchers():
    """Insert voucher master data using SQLAlchemy ORM"""
    session = SessionLocal()
    try:
        logger.info("🔍 Seeding vouchers to vouchers_catalog table...")

        # Upsert each voucher (merge handles insert or update)
        for voucher_data in VOUCHERS:
            try:
                # Check if voucher exists
                existing = session.query(VouchersCatalog).filter(
                    VouchersCatalog.id == voucher_data["id"]
                ).first()

                if existing:
                    # Update existing voucher
                    for key, value in voucher_data.items():
                        setattr(existing, key, value)
                    logger.info(f"📝 Updated: {voucher_data['id']} - {voucher_data['title']}")
                else:
                    # Insert new voucher
                    voucher = VouchersCatalog(**voucher_data)
                    session.add(voucher)
                    logger.info(f"✅ Inserted: {voucher_data['id']} - {voucher_data['title']}")

            except Exception as e:
                logger.error(f"❌ Failed to seed {voucher_data['id']}: {e}")
                session.rollback()
                continue

        # Commit all changes
        session.commit()
        logger.info(f"\n✅ Successfully seeded {len(VOUCHERS)} vouchers to database!")
        logger.info("📋 Vouchers are now available in the Reward Market")

    except Exception as e:
        session.rollback()
        logger.error(f"❌ Failed to seed vouchers: {e}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    logger.info("🌱 Starting voucher seed script...")
    seed_vouchers()
