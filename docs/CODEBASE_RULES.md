# Codebase Rules & Business Logic

This document outlines the core business rules, constraints, and system behaviors implemented in the CallQR backend.

## 1. User & Account Rules

### Account Lifecycles

- **Registration**: New users are created with a default `FREE` subscription.
- **Unverified Accounts (Hard Delete)**: Accounts that remain in `pending_verification` for more than **7 days** without any verification (Email or Phone) are **permanently deleted** from the database upon the next login attempt.
- **Deactivated Accounts (Soft Delete)**: When a user or admin deletes an account, it enters a `deleted` status and is recorded with a `deletedAt` timestamp.
  - **Grace Period**: Soft-deleted accounts are held for **7 days**.
  - **Recovery**: Within this window, an admin can use the `/restore` endpoint to reactivate the account.
- **Status Types**:
  - `active`: Fully functional account.
  - `pending_verification`: Registration complete, awaiting phone/email verification.
  - `blocked`: Manually suspended account (no access).
  - `deleted`: Soft-deleted account awaiting permanent purge.

### Authentication & Security

- **Passwords**: Minimum **6 characters**.
- **OTP Expiry**: Phone verification OTPs are valid for **10 minutes**.
- **Reset Token Expiry**: Password reset tokens are valid for **1 hour**.
- **Global Blocking**: Admins can globally block users. Globally blocked users cannot log in or initiate password resets.
- **Self-Blocking**: Users are prohibited from blocking themselves.
- **Self-Deletion**: Users can deactivate their own account via the `DELETE /users/me` endpoint, which initiates the 7-day grace period.

### Data Ownership & Access Control

- **The "Self or Admin" Rule**: Standard users are strictly limited to accessing and modifying their **own data**.
  - Requests for `GET /api/users/:userId`, `PATCH /api/users/:userId`, or `DELETE /api/users/:userId` are validated by comparing the `userId` in the URL with the authenticated `identity.userId`.
  - Unauthorized access attempts result in a `403 Forbidden` error.
- **Admin Privilege**: Administrators (defined by `ADMIN_USER_IDS`) bypass ownership checks and have full CRUD access to all user records.

---

## 2. QR Code Rules

### Ownership & Assignment

- **Claiming**: Users can only claim "unassigned" QR codes.
- **Active Limit**: A user can only have **1 active QR code** at a time (Business requirement).
- **Statuses**:
  - `unassigned`: Freshly generated, waiting to be claimed.
  - `active`: Currently assigned to a user and functional.
  - `revoked`: Permanently disabled by admin or user.
  - `disabled`: Temporarily disabled by the owner.

### Scan & Redirect Logic

- **Unassigned QR**: Redirects to the frontend homepage (`FRONTEND_URL`).
- **Assigned QR (Third-Party App)**: Redirects to the contact page: `${baseUrl}/contact?token=${token}&userId=${user.id}&ownerName=${user.username}`.
- **Assigned QR (Official App)**: Returns JSON payload with QR and user details (no redirect).
- **Disabled/Revoked QR**: Scan fails with a `404` or `400` error.

---

## 3. Subscription & Usage Limits

Subscriptions control daily usage quotas.

| Feature            | FREE      | PRO     | ENTERPRISE |
| :----------------- | :-------- | :------ | :--------- |
| **Daily Calls**    | 50        | 80      | 200        |
| **Daily Messages** | 50        | 500     | Unlimited  |
| **Active Chats**   | 5         | 20      | Unlimited  |
| **Duration**       | Permanent | 30 Days | 30 Days    |
| **Price (INR)**    | ₹0        | ₹499    | ₹1,499     |

### Downgrade Policy

- Users cannot downgrade their plan if their **current usage** exceeds the limits of the target plan (e.g., if you have 10 active chats, you cannot downgrade to FREE which only allows 5).

---

## 4. User Categories (Roles)

### System Roles

- **Admin**: Users whose IDs are listed in the `ADMIN_USER_IDS` environment variable. Can manage all QRs, bulk-create QRs, and globally block users.
- **User**: Standard authenticated account. Can claim/manage their own QR and subscribe to plans.
- **Guest**: Unauthenticated users (e.g., someone scanning a QR). Identified by a unique `guestId` or IP.

### Blocking Categories

- **Global Block**: Applied by Admin; prevents all system access.
- **Peer Block**: Applied by one user to another; prevents communication (calls/messages) between those two specific users.

---

---

## 6. Call Reliability & Reconnection

The system enforces specific timeout and recovery behaviors to handle real-world mobile network conditions.

### Reconnection Window (The "30s Grace Period")

- **Active Call Disconnect**: If a socket disconnects during an active call, the call does not end immediately. The system enters a **30-second grace period**.
- **Cancellation**: If the user re-connects within the 30s window, the call resumes and cleanup is cancelled.
- **Mutual Disconnection**: If BOTH participants are offline, the window is shortened to **10 seconds** to release server resources.

### Wake-up Notifications

- **Delay**: If a user stays disconnected for **3 seconds**, the server automatically triggers a high-priority "wake-up" push notification.
- **Payload**: The notification includes a `reconnect: "true"` flag to instruct the mobile app to force a socket reconnection.

### Termination Reasons

- **Network Lost**: If the 30s window expires without reconnection, the call is ended with the status reason `network_lost`.
- **Missed Call**: If an initiated call is never answered within **60 seconds**, it is ended by the global sweeper with reason `timeout`.

---

## 7. Data Retention & Automated Purging

The system maintains database health through scheduled background tasks.

### Daily Account Purge (Cron Job)

- **Schedule**: Runs every day at **00:00 (Midnight)**.
- **Logic**: Permanently deletes any user record where `status = 'deleted'` AND `deletedAt` is older than **7 days**.
- **Scope**: Includes hard-deletion of the user record and all associated data:
  - Device/Push tokens
  - User-to-user blocks
  - Active/expired subscriptions
