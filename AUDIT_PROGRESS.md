# Audit Gap Fix Progress

Source: Avadeti_Team_Audit_and_Gap_Analysis.docx

## Phase 1 — Critical Security (12 items)
- [ ] 1. Mask OTP codes; restrict reveal to main_admin with reason
- [ ] 2. Private-task access check on GET /tasks/:id
- [ ] 3. DOMPurify on email HTML rendering
- [ ] 4. Member check on all workspace routes
- [ ] 5. Power check on POST /notifications/send
- [ ] 6. task:updated socket restricted to assignees+watchers
- [ ] 7. Creator/power check on meeting edit/delete
- [ ] 8. Privacy filters on search scopes
- [ ] 9. Regex-escape search input (ReDoS prevention)
- [ ] 10. AI MASTER_SECRET require env var
- [ ] 11. Activation code expiry fix
- [ ] 12. Main-admin protection on force-logout

## Phase 2 — Broken-critical features (15 items)
- [ ] 13-14. Real SMTP/IMAP email
- [ ] 15. Real PDF payslip
- [ ] 16-17. Google Meet / Calendar fix
- [ ] 18. Priority sort fix
- [ ] 19. Salary calc bugs
- [ ] 20. Team picker in Activity/Feed/Announcements
- [ ] 21. Email threadId fix
- [ ] 22. Meeting date filter fix
- [ ] 23. Attendance regex fix
- [ ] 24. Avatar upload
- [ ] 25. Announcement CRUD UI
- [ ] 26. ObjectId .includes() fixes
- [ ] 27. Analysis individual tab fix

## Phase 3 — Cross-cutting gaps (11 items)
## Phase 4 — Missing features
## Phase 5 — New features
