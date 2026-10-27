# 03 - User Guide

| Item | Detail |
|---|---|
| Document | User guide |
| Version | 1.0 draft |
| Date | 24 October 2026 |
| Status | Draft for review (describes app version 0.1.0) |
| Audience | End users and support staff (no technical knowledge needed) |

**Purpose:** To show you, step by step, how to use VantixFit AI today. Each important step ends with a line that says how to check that it worked.

> **Please note.** VantixFit AI is still being built. This guide covers what exists now: your account, your Master Profile, importing a resume, your profile photo and the colour themes. The **Jobs** and **Tracker** tabs only say "Coming soon". Creating tailored resumes and cover letters is planned, not available yet.

> **Our promise.** The AI never invents skills or experience. When something is not found in your resume, it stays empty so that you can fill it in with the truth.

---

## 1. Before you start

You need:

- An email address and a password (at least 6 characters).
- The app, opened in a web browser or on an Android phone, as provided by the project owner.
- An internet connection.
- For resume import: a **PDF** or **Word (.docx)** resume that contains real text (not a photo or scan), smaller than 5 MB.

## 2. Create an account and log in

### 2.1 Create an account

1. Open the app. You will see the login screen.
2. Tap **Sign up** (the switch at the top of the card).
3. Type your **Full name** (optional), your **Email** and a **Password** of at least 6 characters. The eye icon shows or hides the password.
4. Tap **Create account**.

**How to check it worked:** You see the message "Account created. Check your email to confirm, then log in." and the form switches back to **Log in**.

Depending on how the project owner set up the service, you may need to click a link in a confirmation email before you can log in. If you do not see an email, check your spam folder.

### 2.2 Log in

1. On the **Log in** tab, type your email and password.
2. Tap **Log in**.

**How to check it worked:** You arrive on the **Home** screen and see a greeting such as "Good morning, Ada".

If a field is wrong, a short message appears under it (for example "That does not look like an email address.").

### 2.3 Log out

1. On the **Home** screen, tap the **log-out icon** (arrow leaving a door) at the top right.

**How to check it worked:** You are taken back to the login screen. Your profile, photo and any resume draft are cleared from the screen's memory.

## 3. The Home screen

Home is your starting point. From top to bottom it shows:

| Part | What it tells you |
|---|---|
| Greeting | "Good morning / afternoon / evening" and your first name |
| Profile completeness | A ring with a percentage, "x of 8 steps done", and the next thing to add |
| Quick actions | "Paste a job description" (coming soon), "Edit profile", and "Import from resume" (shown only until your profile is complete) |
| Recent activity | Your last 5 logged actions, such as "Resume parsed" |
| System status | Three checks: Supabase login, Profile in database, FastAPI backend. Each should be OK. Tap **Retry** to check again. |

The top bar has the **theme (palette)** icon, your **photo** (tap it to open your profile) and the **log-out** icon. Pull the page down to refresh it.

**How to check it worked:** The System status text says "Everything is working."

At the bottom you will find four tabs: **Home**, **Profile**, **Jobs** (coming soon) and **Tracker** (coming soon).

## 4. Build your Master Profile

Open the **Profile** tab. You will see your photo, name, a completeness ring, a **Import from resume** card and five sections: **Personal info**, **Experience**, **Projects**, **Education** and **Skills**. A green tick appears on a section when it is done.

**How profile completeness is counted.** There are 8 equal steps: full name, headline, summary, phone *or* location, at least one experience, at least one education entry, at least one project, and at least one skill. Each step is worth the same, so the ring moves in equal steps.

### 4.1 Personal info

1. Tap **Personal info**.
2. Fill in **Full name** (required), and if you wish **Headline**, **Phone**, **Location**, your **GitHub**, **LinkedIn** and **Website** links, and a **Short summary** (2 to 4 sentences, real facts only).
3. Tap **Save**.

**How to check it worked:** A message says "Profile saved." and the Profile tab shows your name and headline.

Tips: for links you can type `github.com/yourname`; the app adds `https://` for you. Fields have length limits and the app tells you politely if you go over.

### 4.2 Experience

1. Tap **Experience**, then tap the **+** icon at the top right (or **Add experience** if the list is empty).
2. Enter **Role / job title**, **Company**, optional **Location**, **Start month**, and either an **End month** or switch on **I currently work here**.
3. Add bullet points: short sentences about what you really did. You can add up to 12, move them up or down, or remove them.
4. Save.

**How to check it worked:** A message says "Experience added." and the job appears in the list. The newest or current job is listed first.

To edit, tap an entry. To delete, swipe it to the left and confirm (or use **Delete this experience** inside the edit sheet).

### 4.3 Projects

1. Tap **Projects**, then **+**.
2. Enter the **Project name** (required), an optional description (up to 600 characters), the technologies (type them separated by commas), and an optional link.
3. Save.

**How to check it worked:** "Project added." and the project shows with its technology tags.

### 4.4 Education

1. Tap **Education**, then **+**.
2. Enter the **School** (required) and, if you wish, the degree, honors, start year and end year (4 digits, for example 2021).
3. Save.

**How to check it worked:** "Education added." and the entry appears with the most recent one first.

## 5. Skills and levels

Skills show **what you can really do**. The app never adds a skill for you without your say-so.

### 5.1 Add a skill from the list

1. Open **Profile**, then **Skills**, then tap **+**.
2. Type a skill in the search box, for example "Python". Results come from a shared skills list. Skills you already have are not shown.
3. Tap a skill, then choose your **level** from 1 to 5:

| Level | Meaning |
|---|---|
| 1 | Beginner |
| 2 | Basic |
| 3 | Intermediate |
| 4 | Advanced |
| 5 | Expert |

4. Optionally enter **Years of experience** (0 to 60, one decimal such as 2.5).
5. Save.

**How to check it worked:** "Skill added." and the skill appears with five small bars showing your level.

### 5.2 Add a skill that is not in the list (custom skill)

1. In the search box, type the skill name (2 to 60 characters; letters, digits, spaces and `. + # - / & _` only).
2. If it is not found, tap **Add "your text" as a new skill**.
3. Choose a level, then save.

**How to check it worked:** While you add it, the chosen skill shows a **New** tag. After saving, "Skill added." appears and the skill is in your list like any other.

Please be aware: custom skills are added to a **shared** skills list, so other users of the app may see the skill *name* when they search. Your level and years stay private to you. Please do not type personal information as a skill name.

### 5.3 Change or remove a skill

- **Change level or years:** tap the skill, change the values, save.
- **Remove:** swipe the skill to the left and confirm **Remove**.

### 5.4 Skills "without a level"

Skills added by resume import have **no level**, because the app never guesses it. They show a **Set level** tag. Tap the skill and choose a level from 1 to 5.

## 6. Import your resume

This is the fastest way to fill your profile. You always review the result first. **Nothing is saved until you press "Save to profile".**

### 6.1 What you need to know first

| Topic | Details |
|---|---|
| Supported files | PDF and Word **.docx** |
| Not supported | Old Word **.doc** files (save as .docx or PDF first), scanned or photographed resumes (the text cannot be read), password-protected PDFs |
| File size | Up to 5 MB |
| Length read | The first 30 pages of a PDF; at most 30,000 characters of text are used |
| Your file | Not stored. It is read in the server's memory and discarded |
| Your resume text | Sent to the AI provider you choose so that it can be read (see section 6.4) |

### 6.2 Step by step

1. Open **Profile** and tap the **Import from resume** card (or use the quick action on Home).
2. Under **AI model**, choose a model. Models marked "not set up" are not available and cannot be chosen. Your choice is remembered on this device.
3. Tap **Choose your resume** and pick your file (on a computer you can also drag it onto the box). Choose only one file.
4. Wait while "Reading your resume..." is shown. This can take up to a minute. You can tap **Cancel** at any time.

**How to check it worked:** The title changes to **Review what we found**.

### 6.3 Review, edit and save

The review has five cards. Each card shows how many items were found.

1. **Personal info.** Empty fields in your profile are filled in. If your profile already has a different value, you see "Your profile has: ..." and two buttons: **Keep current** (the default) or **Use imported**. Your email is never imported.
2. **Experience, Education, Projects.** Each item has a tick box and an **Edit** button. Untick what you do not want. Tap **Edit** to correct any field. Items that are missing a required detail (for example a company) open automatically and start unticked.
3. **Skills.** Skills found in the shared list will be added **without a level**. Tap the **x** on a chip to remove one. Skills not in the list appear under "Not in our skill bank yet": nothing is added unless you tick it.
4. Check the line at the bottom, for example "Will save: personal info, 2 experiences, 8 skills".
5. Tap **Save to profile**. If a highlighted field has a problem, fix it or untick the item.

**How to check it worked:** The screen says "Your profile has been updated" with a summary such as "Added 2 experiences, 1 education, 8 skills. Personal info updated." Tap **Go to Profile**; the ring and counts have increased.

### 6.4 Duplicates and what is skipped

The app compares each item with your profile and with the other items in this import.

| Item | Treated as a duplicate when these match (capital letters and extra spaces are ignored) |
|---|---|
| Experience | Company, role and start month |
| Education | School and degree |
| Project | Project name |
| Skill | The skill is already in your profile |

Duplicates are marked **Already in your profile** (or **Same as another item you are importing**), cannot be ticked, and are not saved. This protects you from saving the same thing twice, even if you press Save again after a partial failure.

### 6.5 Discard

Tap **Discard** to throw the draft away. If you changed anything, the app asks you to confirm. Nothing has been saved at that point.

### 6.6 About the AI model and your privacy

When you choose a model, your resume **text** is sent to that provider (Groq, Google or OpenAI) so it can be read. Free plans of some providers may use submitted content to improve their products. If this is a concern, do not import a resume with sensitive details, or type your profile by hand instead. The file itself is not stored by VantixFit AI.

## 7. Profile photo

1. Open the **Profile** tab and tap your round photo (it has a small camera icon).
2. Choose **Choose from gallery** or **Take a photo**. On a computer, "Take a photo" opens the normal file picker.
3. The photo must be JPEG, PNG or WebP and under 10 MB.
4. In **Adjust your photo**, drag to move and use the slider, the **+/-** buttons or two fingers to zoom. Tap **Reset** to start again.
5. Tap **Save photo**.

**How to check it worked:** Your photo replaces your initials on Profile and Home.

To remove it, tap your photo, choose **Remove photo** and confirm. Your initials are shown again and the picture file is deleted.

Your photo is kept in a private folder that only your account can open.

## 8. Change the theme

1. On the login or Home screen, tap the **palette** icon.
2. Choose **Light**, **Dark** or **All**, then tap a theme to try it. It is saved automatically.

**How to check it worked:** The colours change immediately and are still in place the next time you open the app. If you never choose a theme, the app follows your device's light or dark setting.

## 9. Tips and best practice

- Write bullet points about what you really did. The app and its future AI features work only with your real facts.
- Keep the summary to 2 to 4 sentences.
- Use a text-based resume for import. If you can select and copy text in the file, it will work.
- Always check imported dates and names. The AI may misread a layout.
- Set a level for every skill so that your profile is honest and complete.
- Do not put passwords or private documents in any text field.

## 10. Frequently asked questions

| Question | Answer |
|---|---|
| Can I paste a job description and get a resume now? | Not yet. The Jobs tab says "Coming soon". This is planned for a later phase. |
| Will the AI add skills I do not have? | No. That is the core rule of the product. Unfound items stay empty. |
| Is my resume file stored? | No. It is read in memory and discarded. Only the items you review and save are stored. |
| Who can see my profile? | Only you. Other users cannot see your data. The only shared item is the *name* of custom skills. |
| Why were some skills added with no level? | The app never guesses your level. Please set it yourself. |
| Why was an item not saved after I pressed Save? | It was probably a duplicate, unticked, or had an error. Duplicates are marked on the card. |
| Can I import a scanned resume? | Not yet. Please use a text-based PDF or a .docx file. |
| Can I import an old .doc file? | No. Open it in Word and save it as .docx or PDF. |
| Which AI model should I choose? | Any model that is available. If one is busy or out of quota, choose another. |
| Can I delete my account? | There is no screen for this yet. Please contact the project owner. **To be confirmed** whether this will be added. |

## 11. Troubleshooting

| What you see | What it means | What to do |
|---|---|---|
| "That email or password does not look right." | The login details are wrong. | Check spelling and try again. |
| "Please confirm your email first. Check your inbox for the link." | Your email address is not yet confirmed. | Open the confirmation email and click the link, then log in. |
| "An account with this email already exists. Try logging in instead." | You already signed up. | Use the **Log in** tab. |
| "Too many attempts. Please wait a minute and try again." | Too many login attempts in a short time. | Wait one minute. |
| "We could not reach the server. Please check your internet connection and try again." | No internet, or the server is not reachable. | Check your connection and try again. |
| "Your session has ended. Please log in again." | Your login has expired. | Log out and log in again. |
| System status shows "The backend is not reachable. Make sure it is running, then retry." | The app cannot reach the server. | Tap **Retry**. If it continues, tell the project owner. |
| "No AI provider is set up on the server yet. Please try again later." | The server has no AI key configured. | Tell the project owner. Resume import cannot work until this is done. |
| "Resume import is not set up yet on the server." / "AI is not set up on the server" / "Groq is not set up on the server" | The server is missing the key for AI or for that provider. | Choose another model that is available, or tell the project owner. |
| "We could not find readable text in this file. If it is a scanned image, please upload a text-based PDF or DOCX." | The file has no text, or too little (under 50 characters). It is probably a scan or photo. | Export a text-based PDF from your word processor, or use a .docx file. |
| "This PDF is password protected. Please remove the password and try again." | The PDF is locked. | Save an unlocked copy and try again. |
| "We could not read this file. It may be damaged." | The file is corrupt. | Re-save the file and try again. |
| "Old Word files (.doc) cannot be read. Please save the resume as .docx or PDF and try again." | .doc is not supported. | Save as .docx or PDF. |
| "That file is too large (x MB). The limit is 5 MB." | The file is over 5 MB. | Compress the file or remove large images. |
| "The AI service is busy right now. Please wait a minute and try again." | The free AI service is over its rate limit. | Wait a minute, or pick another model. |
| "(Provider) has no credit or quota left on this key. Please pick another model." | The chosen provider's quota is used up. | Pick a model from another provider. |
| "(Provider) could not find this model. Please pick another model." | The provider renamed or removed the model. | Pick another model; tell the project owner. |
| "(Provider) key was rejected. Please check the key on the server." | The server's key for that provider is wrong or expired. | Tell the project owner. |
| "The AI service could not read this resume. Please try again." | The AI answered in an unusable way, or had a problem. | Try again, or choose another model. |
| "We could not find any profile details in that file. Please try another resume." | Nothing usable was found. | Check the file; try another resume. |
| "We could not check what is already in your profile, so saving is paused. Please try again." | The app could not load your current data to detect duplicates. | Tap **Try again**. |
| "Saved 3 of 5 items, 2 failed - try again." | Some items were saved and some failed. | Press **Save to profile** again. Saved items are not duplicated. |
| "Photo upload is not set up yet - run the database update." | The storage for photos has not been prepared. | Tell the project owner (the second database update is missing). |
| "Please choose a JPEG, PNG or WebP photo." / "That photo is larger than 10 MB." | The photo type or size is not allowed. | Choose a different photo. |
| "That photo is too large. Please choose a smaller one." | The processed photo is over the storage limit. | Choose a smaller photo. |
| "We could not save your photo. Please try again." | A general problem while saving. | Try again later. |

## 12. Screenshots to add later

Screenshots are **not included yet**. When the project owner adds them (suggested folder: `document/images/`), please capture the following and link them in this guide.

- [ ] Login screen (Log in and Sign up tabs)
- [ ] Home screen with the completeness ring, quick actions, recent activity, system status
- [ ] Theme picker open (Light, Dark, All)
- [ ] Profile tab with photo, ring and section list
- [ ] Personal info form
- [ ] Experience list and the add/edit sheet
- [ ] Projects and Education screens
- [ ] Skills list with level bars, and a skill with "Set level"
- [ ] Add skill sheet, including "Add ... as a new skill"
- [ ] Import from resume: model list and file box
- [ ] Reading screen with Cancel
- [ ] Review screen: personal info with "Keep current / Use imported", an item flagged "Already in your profile", skills section
- [ ] Done screen with the summary
- [ ] Photo menu and the "Adjust your photo" editor
- [ ] An example error message (for instance, scanned PDF)
- [ ] Jobs and Tracker "Coming soon" screens

Related: [01-product-overview.md](01-product-overview.md), [11-glossary.md](11-glossary.md).
