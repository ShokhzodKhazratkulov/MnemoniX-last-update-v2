# MnemoniX Monetization & Security Strategy

This document outlines the step-by-step plan for implementing the monetization strategy and device security for the MnemoniX application.

## Core Strategy
- **7-Day Free Trial:** New users get full access to all features for 7 days.
- **Freemium Mode (Post-Trial):**
    - Max 5 word searches per day.
    - Cannot create posts in the Community section.
    - Can only view the first 5 posts in the Community section.
- **Premium Subscription:** Unlimited access to all features.
- **Device Locking:** One account can only be active on one device at a time.

## Pricing Tiers
- **Starter:** $3 USD / 1 Month
- **Value:** $8 USD / 3 Months
- **Best Deal:** $15 USD / 6 Months

---

## Implementation Steps

### Step 1: Database & Type Preparation
- Update Supabase `profiles` table schema:
    - `trial_ends_at` (Timestamp)
    - `is_pro` (Boolean)
    - `daily_search_count` (Integer)
    - `last_search_date` (Date)
    - `current_device_id` (String/UUID)
- Update `src/types.ts` to reflect these profile changes.

### Step 2: Device Locking System
- Generate a unique `device_id` using `crypto.randomUUID()` or similar, stored in `localStorage`.
- On login/app load, compare local `device_id` with the one in the user's Supabase profile.
- Implement a "Switch Device" flow if a mismatch is detected.

### Step 3: Access Control Logic (The "Gatekeeper")
- Create a helper `hasPremiumAccess(profile)`:
    - Returns `true` if `profile.is_pro === true`.
    - Returns `true` if `new Date(profile.trial_ends_at) > new Date()`.
    - Returns `false` otherwise (Freemium).

### Step 4: Search Limit Implementation
- Modify `handleSearch` in `App.tsx`:
    - If user is "Freemium", check `daily_search_count`.
    - Block search if count >= 5 and show upgrade prompt.
    - Logic to reset `daily_search_count` when `last_search_date` is different from today.

### Step 5: Community Page Restrictions
- **Creation:** Disable the "Create Post" button in `Posts.tsx` for Freemium users.
- **Visibility:** Limit the `filteredPosts` array to 5 items for Freemium users.
- **Upsell:** Add a "Locked" UI element at the bottom of the post list.

### Step 6: Pricing & Subscription UI
- Create a `SubscriptionModal.tsx` component.
- Display the three pricing tiers ($3, $8, $15).
- Include a "Why Upgrade?" benefits list.

### Step 7: Profile & Onboarding Updates
- Update `Profile.tsx` to show trial status or "Pro" badge.
- Ensure the registration flow in `Auth.tsx` initializes the 7-day trial.

---
*Status: Pending Implementation*
