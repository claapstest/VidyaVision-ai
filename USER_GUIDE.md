# VidyaVision Voice AI Call Center Platform
## Official Client Onboarding & Comprehensive User Guide

> **Version:** 2.0 Enterprise  
> **Brand:** VidyaVision — *Every Student's Vision*  
> **Target Audience:** College Directors, Admission Heads, IT Administrators & Counseling Teams

---

## Table of Contents
1. [Platform Overview & Architecture](#1-platform-overview--architecture)
2. [Sign In & Session Security](#2-sign-in--session-security)
3. [Page 1: Call Dashboard & Analytics](#3-page-1-call-dashboard--analytics)
4. [Page 2: Call Dialer & Campaign Dispatch](#4-page-2-call-dialer--campaign-dispatch)
5. [Page 3: Recent Calls, Audio & Transcripts](#5-page-3-recent-calls-audio--transcripts)
6. [Page 4: Team & Permissions Management (Admin Only)](#6-page-4-team--permissions-management-admin-only)
7. [University & AI Voice Bot Configuration](#7-university--ai-voice-bot-configuration)
8. [Spreadsheet Formatting & Lead Preparation Guide](#8-spreadsheet-formatting--lead-preparation-guide)
9. [Troubleshooting & Frequently Asked Questions (FAQ)](#9-troubleshooting--frequently-asked-questions-faq)

---

## 1. Platform Overview & Architecture

**VidyaVision Voice AI** is an enterprise-grade automated telephony and student admission intelligence platform. It autonomously dials prospective student leads, conducts intelligent, human-like voice conversations in multiple languages (English, Hindi, Telugu), identifies student course interests, and transfers high-intent inquiries live to admission counselors.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        VIDYAVISION VOICE AI FLOW                       │
└────────────────────────────────────────────────────────────────────────┘
          │
          ├── 1. Counselor uploads Excel/CSV lead spreadsheet (.xlsx/.csv)
          │
          ├── 2. Sequential Calling Engine dials students automatically
          │
          ├── 3. Conversational AI speaks to the student & assesses interest
          │       ├─ If student requests counselor ──> Live Call Transfer to mobile
          │       └─ If call finishes ───────────────> AI extracts profile & notes
          │
          └── 4. Results sync in real-time to Dashboard, Google Sheets & DB
```

### Core Capabilities:
- **Autonomous Outbound Dialing:** High-throughput batch calling with customizable inter-call delays and quiet-hours compliance.
- **Natural Multi-turn Conversations:** Dynamic query handling for fee structures, eligibility criteria, hostel facilities, and application deadlines.
- **Live Counselor Call Transfer:** Seamless bridge forwarding to designated counselor phone numbers when a student requests to speak with an officer.
- **Granular Role-Based Access Control (RBAC):** Strict separation between Administrators and Counselors, with integrated **Data Leak Protection**.
- **Real-Time WebSocket Synchronization:** Live progress updates, immediate permission refreshes, and instant campaign tracking across all users without browser reloads.

---

## 2. Sign In & Session Security

### Accessing the Portal:
1. Open your designated web browser (Google Chrome, Microsoft Edge, or Mozilla Firefox).
2. Navigate to your portal address (e.g., `https://your-domain.com` or local network URL).
3. The official **VidyaVision** secure authentication portal will appear.

```
┌──────────────────────────────────────────────────────────┐
│                   [ VIDYAVISION LOGO ]                   │
│         AI Admission Telephony & Lead Intelligence        │
│                                                          │
│  Work Email Address: [ counselor@vidyavision.com       ] │
│  Password:           [ ••••••••••••••                  ] │
│                                                          │
│              [ Sign In to VidyaVision ]                  │
└──────────────────────────────────────────────────────────┘
```

### User Roles at a Glance:
- **System Administrator:** Unrestricted control across team management, university configurations, dialing batches, and Excel data exports.
- **Admission Counselor:** Focused workspace for uploading lead lists, staging and executing call runs, reviewing recordings/transcripts, updating student follow-up notes, and receiving transferred calls.

### Security Best Practices:
- Passwords must be at least 6 characters in length.
- Sessions are protected via secure tokens.
- **Instant Logout:** Clicking **Logout** in the top navigation bar immediately terminates your active session and wipes in-memory draft queues.

---

## 3. Page 1: Call Dashboard & Analytics

The **Call Dashboard** provides real-time high-level intelligence and lead outcome metrics across all university campaigns.

### 3.1 Key Performance Metric Cards (KPIs)
At the top of the dashboard, five real-time summary cards reflect call performance:
1. **Total Student Calls:** Complete count of call dispatches initiated.
2. **Interested Students (Green):** Students who expressed positive admission intent or requested program details.
3. **Counselor Follow-up Required (Amber):** Students requesting callbacks, fee discussions, or live counselor interactions.
4. **Not Interested (Red):** Students who declined admission or chose another institution.
5. **Calls Not Answered (Rose):** Dispatches where the recipient did not answer, phone was switched off, or went to voicemail.

### 3.2 Granular Filter Bar
Filter data dynamically by:
- **Date Range:** Today, Yesterday, Last 7 Days, Last 30 Days, or Custom Date Picker.
- **University Scope Dropdown:** Select a specific institution (e.g., *VidyaVision AI Assistant*, *MIT WPU*, *KL University*) or view aggregated metrics across **"All Universities"**.
- **Lead Status Pills:** Click any status category to narrow down the table instantaneously.

### 3.3 AI Student Profile & Readiness Signals
The platform analyzes every conversation transcript to extract actionable student signals:
- **Immediate (2026):** Students seeking enrollment in the upcoming intake.
- **Counsellor Req:** Inquiries that explicitly requested a human advisor.
- **Transferred:** Calls that successfully bridged to a counselor's mobile.
- **No Scores Provided:** Students who need counseling regarding qualifying exams.
- **Grad Completed:** Students eligible for postgraduate admissions.

### 3.4 Excel Report Downloading & Data Leak Protection
- **Authorized Users (Admins & Senior Staff):** Click the green **"Download Excel Report (.xlsx)"** button to export comprehensive student contact sheets, durations, recordings, and lead ratings.
- **Standard Counselors:** The button displays a locked indicator (`Download Excel Report (Restricted)`) to prevent bulk student data leakage outside the organization.

---

## 4. Page 2: Call Dialer & Campaign Dispatch

The **Call Dialer** is your primary engine for preparing, staging, and executing sequential Voice AI campaigns.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CALL DIALER WORKFLOW                            │
│                                                                        │
│  [ STEP 1: Upload Leads ] ──> [ STEP 2: Configure ] ──> [ STEP 3: Stage & Dial ]  │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Step 1: Inputting Student Contacts
You have three flexible methods to import numbers:
1. **Excel / CSV File Upload (Recommended):**
   - Drag and drop or browse for `.xlsx`, `.xls`, or `.csv` files.
   - The platform automatically validates Indian telephone numbers, strips invalid characters, extracts names and courses, and ignores duplicate entries.
2. **Bulk Paste Text:**
   - Paste unformatted text containing names and numbers (e.g., copied from WhatsApp or an email). The parser extracts valid 10-digit numbers automatically.
3. **Manual Single Number:**
   - Quick entry for dialing an individual prospective student on demand.

### 4.2 Step 2: Campaign Configuration
- **Target University:** Select which institution's voice profile the AI should represent.
- **Target Course / Program:** Specify whether the campaign focuses on *Engineering, MBA, Medicine, Law*, or *General Admissions*.
  - *UG Courses (B.Tech, BBA, BCA, B.Sc):* Automatically route through the specialized Undergraduate Bot.
  - *PG Courses (MBA, M.Tech, MCA):* Automatically route through the Postgraduate Bot.
- **Inter-Call Delay:** Choose the breathing room between completed calls (e.g., *10 seconds, 15 seconds, 30 seconds*) to allow counselors time to log notes.

### 4.3 Staged Calling Queue (Isolated Workspace)
- Click **"Stage Contacts for Calling"** to move validated numbers into the staging table.
- **Individual Workspace Guarantee:** Your staged calls are private to your login. If an admin stages numbers and logs out, a counselor logging in on the same computer will **never** see the admin's staged calls. Each user has their own dedicated draft queue.

### 4.4 Telecom Compliance & Auto-Cutoff Hours
To comply with telecom regulations and avoid calling students outside acceptable hours:
- **Business Hours Window:** Automatically prevents calls before **09:30 AM** and halts dispatch strictly at **06:30 PM IST**.
- **Duration Timer:** Set a hard stop after a given duration (e.g., stop automatically after 60 minutes).
- **Time Cutoff:** Choose an exact stop time (e.g., 6:00 PM). Uncalled numbers remain safely preserved and can be resumed next morning with one click.

### 4.5 Live Call Transfer Configuration
When enabled, if a student says *"Can I speak to an admission counselor?"* or *"Connect me to the office"*, the AI says:
> *"I'm transferring your call to our admission counselor. Please hold while I connect you."*

- **Counselor Phone Number:** Enter the active mobile/desk phone with country code (e.g., `+91 95730 97810`).
- **Sync to Voice Agent:** Click **"Sync to Voice Agent"** to update the telephony bridge instantly.

### 4.6 Active Campaign Controls
Once a campaign begins, the interactive control banner provides live monitoring:
- **Pause Campaign:** Temporarily halts dialing after the current call completes.
- **Resume Campaign:** Restarts dialing from the exact next uncalled contact.
- **Split Queue:** Divides remaining numbers into sub-campaigns or stages them for re-dialing.
- **Cancel Campaign:** Safely aborts the queue and marks uncalled contacts as canceled.

---

## 5. Page 3: Recent Calls, Audio & Transcripts

The **Recent Calls** tab is your complete operational log of all dialed calls.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Student Profile   │ University    │ Date & Duration │ Lead Outcome    │ Actions        │
├───────────────────┼───────────────┼─────────────────┼─────────────────┼────────────────┤
│ Akash             │ MIT WPU       │ 2 Nov 2026      │ (●) Interested  │ [Detail Report]│
│ +91 86882 68617   │ Admission Bot │ 0:46            │                 │                │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Call Detail Modal
Clicking **Detail Report** on any call opens the comprehensive student inspection card:
1. **Multi-Channel Audio Player:** Listen to the complete call recording directly in the browser with play, pause, seek, and playback speed controls.
2. **Turn-by-Turn Conversation Transcript:** Read the verbatim dialog between the Voice AI and the student, complete with exact timestamps and caller intent badges.
3. **AI Summary:** A concise 2-sentence synopsis summarizing the student's background, eligibility questions, and preferences.

### 5.2 Counselor Follow-Up Actions
Counselors can update student records directly inside the Detail Modal:
- **Update Interest Status:** Adjust the status to *Interested, Callback Requested, Follow-up Needed, Admission Confirmed*, or *Not Interested*.
- **Counselor Notes:** Record key student details (e.g., *"Student scored 88% in 12th; requested scholarship details via WhatsApp"*).
- **Next Follow-Up Date:** Schedule automated calendar reminders for callbacks.
- **1-Click WhatsApp Admission Brochure:** Click **"Send WhatsApp Info"** to automatically deliver official college prospectus links and application forms to the student's mobile number.

---

## 6. Page 4: Team & Permissions Management (Admin Only)

Administrators have access to the **Team Management** portal via the System Admin pill badge in the navigation header.

```
┌────────────────────────────────────────────────────────────────────────┐
│ TOTAL MEMBERS: 2   ACTIVE SEATS: 1   DATA LEAK PROTECTION: 1/1 SHIELDED│
└────────────────────────────────────────────────────────────────────────┘
```

### 6.1 The 7 Granular Permission Flags
Admins can toggle permissions individually for each team member:

| Permission Flag | Description | Recommended for Counselors |
| :--- | :--- | :---: |
| **View Reports** | Access high-level analytics, dashboards, and charts. | **YES** |
| **Audio & Transcripts** | Listen to student call recordings and read dialog transcripts. | **YES** |
| **Notes & Follow-ups** | Save counselor feedback, set callback dates, and send WhatsApp. | **YES** |
| **Upload Lead Sheets** | Import student contact spreadsheets (`.xlsx`, `.csv`) into dialer. | **YES** |
| **Start/Stop Dialing** | Initiate live sequential AI calling campaigns and manage queues. | Optional (Senior) |
| **Manage Colleges & Bots** | Add/edit university profiles, agent IDs, and course catalogs. | **NO (Admin Only)** |
| **Download Excel Sheet** | Export student contact databases and duration sheets to Excel. | **NO (Data Leak Guard)** |

### 6.2 Pre-Configured Permission Presets
- **Standard Counselor (Recommended):** View reports, transcripts, notes & upload lead sheets. Dialing start/stop and Excel downloads are blocked.
- **Senior Counselor / Queue Lead:** Standard privileges + authorization to start, pause, and split calling campaigns.
- **Full Administrator:** Complete unrestricted access across all system features.

### 6.3 Real-Time Account Management
- **Instant Suspension:** Toggling a counselor's status to **Suspended** terminates their session in real-time over WebSockets, immediately returning them to the login screen.
- **Live Permission Updates:** When an Admin edits a counselor's permissions, the counselor's browser updates instantaneously without requiring a page reload or re-login.

---

## 7. University & Voice Bot Configuration

System Administrators can configure the target institutions represented by the AI.

### Adding or Editing a University:
1. In the Dashboard header or University selector, click **"+ Add University"** (or click the edit pencil on an existing college).
2. Configure the following fields:
   - **Institution Name:** Official college name (e.g., *KL University Hyderabad*).
   - **Location / Campus:** City, State (e.g., *Hyderabad, Telangana*).
   - **Supported Languages:** Primary languages spoken by prospective students (e.g., *English, Hindi, Telugu*).
   - **Course Offerings:** Comma-separated list of available programs (e.g., *B.Tech CSE, MBA, Data Science, AI & ML*).
   - **Assigned Voice Agent ID:** Telephony bot identifier configured in the voice engine.
   - **Counselor Transfer Number:** The direct phone number calls will transfer to when a student asks for human guidance.
   - **Website & Brochure URL:** Link sent automatically via WhatsApp.

---

## 8. Spreadsheet Formatting & Lead Preparation Guide

To ensure flawless file uploads, follow these simple spreadsheet guidelines:

### Supported File Formats:
- Microsoft Excel (`.xlsx`, `.xls`)
- Comma-Separated Values (`.csv`)

### Recommended Column Headers:
The file parser is intelligent and recognizes standard variations of column headers:

| Field | Accepted Column Headers | Sample Value | Mandatory? |
| :--- | :--- | :--- | :---: |
| **Phone Number** | `Phone`, `Mobile`, `Contact`, `Phone Number`, `Student Phone` | `9876543210` or `+91 9876543210` | **YES** |
| **Student Name** | `Name`, `Student Name`, `Candidate Name`, `Full Name` | `Akash Sharma` | Optional |
| **Target Course** | `Course`, `Program`, `Stream`, `Branch` | `B.Tech CSE` | Optional |
| **City / State** | `City`, `District`, `State`, `Location` | `Vijayawada` | Optional |

### Best Practices:
1. **Indian Phone Numbers:** 10-digit mobile numbers starting with 6, 7, 8, or 9 are automatically formatted with the `+91` country code.
2. **Duplicate Detection:** If your sheet contains repeated telephone numbers, the system automatically imports the first entry and skips duplicates, alerting you in the summary pill.
3. **Formula Neutralization:** Do not include leading symbols like `=`, `+`, or `-` in student names to prevent spreadsheet calculation issues.

---

## 9. Troubleshooting & Frequently Asked Questions (FAQ)

### Q1: Why am I unable to download the Excel report?
> **Answer:** Your counselor account has **Data Leak Protection** enabled. Contact your VidyaVision Administrator to grant the **"Download Excel Sheet"** permission to your profile.

### Q2: Why did calling stop automatically at 6:30 PM?
> **Answer:** The platform is configured with **Telecom Compliance Window Protection** (09:30 AM – 06:30 PM IST). Calling halts automatically to comply with quiet-hours guidelines. All uncalled numbers are preserved in your queue and can be resumed the next morning.

### Q3: When I stage contacts, does another counselor see them?
> **Answer:** No. Each team member has an isolated, individual dialer workspace. Draft contacts staged by you remain strictly within your account.

### Q4: How does Call Transfer work if the counselor is busy?
> **Answer:** The AI attempts to connect the call to the configured counselor number. If the counselor's line is busy or unanswered, the AI politely informs the student that all counselors are currently assisting other callers and logs a **"Counselor Follow-up Required"** flag with the student's callback time.

### Q5: How do I send admission brochures via WhatsApp?
> **Answer:** Open any call in **Recent Calls** -> Click **Detail Report** -> Verify the student's mobile number and click **"Send WhatsApp Info"**. The official college brochure and application link will be dispatched immediately.

---

### Need Further Assistance?
For technical support, custom bot script modifications, or platform upgrades:
- **Internal Administrator:** Contact your designated VidyaVision Portal Admin.
- **Official Portal:** [www.vidyavision.com](https://www.vidyavision.com/)
- **Document Version:** `2.0-Enterprise (Nov 2026)`
