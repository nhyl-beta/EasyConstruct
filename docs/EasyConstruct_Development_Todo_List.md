# EasyConstruct — Development To-Do List

A phase-by-phase checklist for building the EasyConstruct Cloud-Based Construction Operations Management System (PERN stack), organized by the module scope defined for each of the nine user roles.

> **Guiding limitation to keep in mind throughout:** AI-driven features are decision-support only (recommendations, validation, summaries). They must never replace expert assessment, managerial authority, or professional/legal decision-making — every AI output needs a human approval step.

---

## Phase 0 — Project Setup & Preparation

- [✓] Install core tools: VS Code, Node.js, PostgreSQL, Git, GitHub, Postman, Docker
- [✓] Set up cloud services: Neon (or equivalent) database, Supabase/Cloudinary storage
- [✓] Initialize monorepo or client/server repo structure
- [✓] Set up `.env` structure and secrets management
- [✓] Set up ESLint/Prettier and a shared coding standard
- [✓] Create project board (Trello/Jira/GitHub Projects) mapped to this list
- [✓] Assign team roles (Frontend Lead, Backend Lead, Database & API Lead, AI & Documentation Lead)

---

## Phase 1 — Database Architecture

- [✓] Define core entities: Users, Roles, Projects, Attendance, Payroll, Documents, Workflow, Notifications, Audit Logs, AI Reports
- [✓] Define primary/foreign keys and relationships (1:1, 1:N, M:N) for each entity
- [✓] Design ERD covering all 9 roles' data needs
- [✓] Normalize schema (3NF) and add constraints
- [✓] Write migration scripts and seed data for testing

---

## Phase 2 — Authentication & Access Control (foundation for all roles)

- [✓] Build `POST /login`, `POST /logout`, `POST /refresh-token`
- [✓] Implement password hashing (bcrypt)
- [✓] Implement JWT-based session handling
- [✓] Implement Role-Based Access Control (RBAC) for all 9 roles: Owner, IT Designer, Project Manager, HR, Finance Manager, Architect, Engineer, Site Personnel, Consultant
- [✓] Build protected route middleware (frontend + backend)
- [ ] Build Fail-Safe Account Recovery flow (Owner can recover Super Admin access)

---

## Phase 3 — Role Module Development

### 3.1 Owner Module
- [✓] Log in
- [ ] Executive Dashboard
- [ ] System Oversight & Audit Trail Viewing
- [ ] Fail-Safe Account Recovery (recover Super Admin if compromised/inaccessible)

### 3.2 IT Designer Module
- [ ] Log in
- [ ] System-wide Dashboard
- [ ] User Account Management (create/edit/deactivate accounts, assign permissions)
- [ ] System Monitoring & Maintenance tools
- [ ] Security activity oversight
- [ ] Cloud-based Security Monitoring

### 3.3 Project Manager Module
- [ ] Log in
- [ ] Project Oversight views
- [ ] Workflow Initiation
- [ ] System Configuration (permissions & approval hierarchies)
- [ ] Operational Dashboard
- [ ] Document Oversight
- [ ] User Support tools

### 3.4 Human Resources Module
- [✓] Log in
- [ ] Employee Record Management (CRUD)
- [ ] Attendance Monitoring
- [ ] Payroll generation (tracksheet, gross labor, gross tracking modules)
- [ ] Workforce Reporting

### 3.5 Finance Manager Module
- [ ] Log in
- [ ] Payroll Review
- [ ] Budget Monitoring
- [ ] AI Impact-Awareness Review (budget/schedule adjustments — human-reviewed)
- [ ] Financial Approval participation in workflows

### 3.6 Architects Module
- [✓] Log in
- [✓] Design & Plan Submission (file upload)
- [✓] Proposal Submission
- [ ] AI Validation & Impact-Awareness results viewing
- [ ] Project Monitoring

### 3.7 Engineers Module
- [ ] Log in
- [ ] Technical Progress Updating
- [ ] AI-assisted Requirement Drafting
- [ ] Issue Reporting
- [ ] AI-supported Resolution Suggestions review
- [ ] Project Monitoring/documentation

### 3.8 Site Personnel Module
- [ ] Log in
- [ ] Attendance Recording (geofencing + photo-capture authentication)
- [ ] Task Status Updating
- [ ] Field Documentation Upload
- [ ] Issue Reporting

### 3.9 Consultant Module
- [ ] Log in
- [ ] Proposal Review (incl. AI-generated validation summaries)
- [ ] Advisory Document Upload
- [ ] Workflow Participation (approvals)
- [ ] Project Viewing Access

---

## Phase 4 — Cross-Cutting Modules

- [ ] **Workflow Automation** — approval chains across PM, Finance, Consultant roles
- [ ] **Document Management** — versioning, secure storage, access control
- [ ] **Dashboards** — role-specific views (Owner, IT Designer, PM, Finance, etc.)
- [ ] **Audit Logs** — track all critical actions system-wide (for Owner oversight)
- [ ] **Notifications** — workflow, task, and approval alerts
- [ ] **Reporting** — payroll, workforce, project, and financial reports

---

## Phase 5 — AI Decision-Support Features

For each, build as **assistive, human-reviewed** functionality only:

- [ ] **AI Proposal Validation** — inputs (submitted design/proposal docs), processing (standards/historical/data comparison), output (validation summary for Architect/Consultant review)
- [ ] **AI Requirement Drafting** — inputs (project context), processing (draft generation), output (editable draft for Engineer approval)
- [ ] **AI Issue Resolution Suggestions** — inputs (reported issue), processing (recommendation generation), output (suggestions for Engineer to accept/reject)
- [ ] **AI Impact Awareness** — inputs (budget/schedule data), processing (impact analysis), output (summary for Finance Manager/PM review — never auto-applied)
- [ ] Add explicit UI indicators that all AI outputs are "recommendations" requiring human sign-off

---

## Phase 6 — Security Hardening

- [ ] Rate limiting on auth and sensitive endpoints
- [ ] Input validation & sanitization on all forms/APIs
- [ ] Secure file upload handling (type/size checks, storage isolation)
- [ ] Full audit logging tied to Owner's oversight module
- [ ] Review RBAC coverage against all 9 roles

---

## Phase 7 — Testing

- [ ] Unit tests (backend services, DB queries)
- [ ] Integration tests (API + DB)
- [ ] Role-based access tests (verify each of the 9 roles sees only permitted modules)
- [ ] AI output review-flow tests (confirm nothing bypasses human approval)
- [ ] End-to-end testing per module
- [ ] User acceptance testing with sample role accounts

---

## Phase 8 — Deployment

- [ ] Deploy frontend (e.g., Vercel/Netlify)
- [ ] Deploy backend (e.g., Render/Railway/Docker container)
- [ ] Configure production database (Neon)
- [ ] Configure storage (Supabase/Cloudinary) for documents & photos
- [ ] Set up monitoring, logging, and backups
- [ ] Separate Dev / Testing / Production environments

---

## Phase 9 — Documentation & Defense Prep

- [ ] Full system documentation (per module: purpose, features, DB tables, APIs)
- [ ] ERD and architecture diagrams
- [ ] User manuals per role
- [ ] Scope & Limitations statement included in final documentation
- [ ] Capstone defense slide deck and live-demo script covering all 9 roles + AI features

---

*Ordering rationale: Auth/RBAC must exist before any role module (Phase 2), since every module in Phase 3 depends on identity and permissions. Cross-cutting modules (Phase 4) depend on multiple roles' modules already existing (e.g., Workflow Automation needs PM + Finance + Consultant flows). AI features (Phase 5) are layered on top of validated core workflows so their human-review gates have something real to attach to.*
