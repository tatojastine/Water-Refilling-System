# IPT 102 Activity 15 checklist

Use this alongside the course handout. This checklist records what still needs to be proven with the team's real repository, deployment, and screenshots.

## Parts 1–11

| Part | Deliverable | Status and evidence |
| --- | --- | --- |
| 1. Repository | Use your own pre-final project. Keep separate frontend and backend folders, ignore real environment files, and commit templates. | Local AquaRefresh candidate prepared. Confirm eligibility and publish the real team repository. |
| 2. Deploy | Connect Netlify, Render, and Atlas M0. A live order or other saved record must survive refresh. | Pending host setup and verification. Capture S1–S3 and S15. |
| 3. Test | Run B-T1–B-T5 and F-T1–F-T3 with a real framework. Tests use isolated fixtures. | All eight IDs are authored. The supplemental Node HTTP suite passed 19/19. Registry DNS prevented framework runs. Verify the framework totals before S6–S7. |
| 4. Workflow | Run `backend` and `frontend` jobs on pull requests and pushes to main. Prove a deliberately broken test is caught. | Verify the GitHub Actions run and capture S8–S10. |
| 5. Protect and deploy | Require pull requests, one approval, both CI jobs, and a branch up to date with main. Render auto-deploy waits for CI. | Configure repository and host settings, then capture S11–S14. |
| 6. Diagrams | Team creates deployment and pipeline diagrams using an accepted editor, exports PNGs, and includes editable files or links. | Pending real services and diagrams by the two members. Capture S18. |
| 7. UX | Verify the eight UI requirements and the AI-design spot-check below. | Browser proof pending. Capture S3–S5. |
| 8. Bonus | Any optional bonus must be free, live, shown in the diagrams and README, and use the pipeline for full credit. | No bonus claimed. |
| 9. README | Required headings in order, exact commands, fake environment examples, Actions link, and diagram embeds. | Draft present. Replace pending links, names, and counts with verified evidence. |
| 10. Collaboration | Four or more merged PRs, two opened by each member, eight or more commits per member, and substantive partner reviews. | Pending real history and approvals. Capture S16–S17. |
| 11. Submit | One PDF with both members and roles, three links, then captioned S1–S18 in order. | Pending genuine screenshots and student submission. |

## UI/UX checks

| Requirement | What to verify on the deployed app |
| --- | --- |
| Loading | A message says the server may take up to a minute to wake. |
| Error and retry | Interrupt a request, restore connectivity, and confirm **Try again** reloads the API data. |
| Empty state | An empty list explains its state and gives a useful next action. |
| Field messages | A missing or invalid value gives a clear message beside the field. |
| Mobile | At 375 px in Chrome's iPhone SE view, content fits without horizontal scrolling. |
| Contrast | Check body text against its background at 4.5:1 or higher in each offered theme. |
| Browser tab | AquaRefresh appears with its own favicon. |
| Actual content | Labels, messages, and navigation describe the actual water-refilling workflows. |

Check these on the final live build. Emoji used as UI icons are marked for removal in the implementation. Verify the result before capture.

| Code | Inspect for |
| --- | --- |
| AI-1 | Purple, violet, or indigo gradients |
| AI-2 | Gradient-filled text |
| AI-3 | Frosted glass panels |
| AI-4 | Decorative glowing blobs or colored glows |
| AI-5 | Emoji substituting for interface icons |
| AI-6 | Generic pill-badge hero with generic calls to action |
| AI-7 | Empty marketing buzzwords |
| AI-8 | Invented metrics or testimonials |
| AI-9 | Repeated generic feature cards |
| AI-10 | Placeholder content and default tool branding |
| AI-11 | Dead buttons and links |
| AI-12 | Blanket animation without a task purpose |
| AI-13 | Dark-mode body text below 4.5:1 contrast |

## Pull request and deployment evidence

Create one branch for each change. Each member opens at least two merged PRs. The partner approves and leaves at least one substantive comment about a line of code on each PR. Make at least eight meaningful commits per member and verify with `git shortlog -sn`. Use descriptive commit messages and retain actual authorship.

After CI has run once, protect `main` with a required PR, one approval, up-to-date branches, and required `backend` and `frontend` checks. Create the deliberate failure on `test/break-on-purpose`. Capture the red check and blocked merge, repair the expectation on the **same PR**, wait for green, obtain partner approval, then merge and capture its merged status. Get the short main commit from GitHub and find the same commit in both deployment logs.

## Diagrams to create as a team

Use diagrams.net, Excalidraw, Figma, or Lucidchart. The handout requires student-authored diagrams and does not accept hand-drawn or AI-generated pictures. Export `docs/architecture.png` and `docs/pipeline.png`, retain editable files or links in `docs/`, and embed both PNGs under the README's **Diagrams** heading.

- **Deployment architecture (Member A)**. Show browser, frontend, backend, Atlas, and GitHub boxes. Include actual service names and live addresses. Label the browser-to-Netlify page and API traffic, Netlify-to-Render HTTPS JSON proxy (`VITE_API_URL`), Render-to-Atlas database queries (`MONGODB_URI`), and GitHub-to-Netlify and GitHub-to-Render deployments as two distinct arrows. Mark `CLIENT_URL` as the frontend origin the API trusts. Add any claimed bonus service. Show variable names only.
- **CI/CD pipeline (Member B)**. Use ovals for start and end, rectangles for actions, and a diamond for the check decision. Show push to branch, PR to main, two parallel jobs, the failed-check loop, partner review and approval, merge, both deployments, and the updated site.

## S1–S18 in submission order

| ID | Capture |
| --- | --- |
| S1 | Working live frontend with the address bar visible |
| S2 | Backend health page showing `{"status":"ok"}` with the address bar visible |
| S3 | Live frontend open on a real phone using mobile data |
| S4 | Chrome iPhone SE view at 375 px with no sideways scrolling |
| S5 | Loading, error, and empty states side by side |
| S6 | Passing backend tests with the total visible |
| S7 | Passing frontend tests with the total visible |
| S8 | Both Actions jobs green |
| S9 | The intentional test failure on a red pull request |
| S10 | The same pull request green after the fix and marked **Merged** |
| S11 | Main branch protection rule and all required settings |
| S12 | Render **After CI Checks Pass** setting |
| S13 | Latest main commit in GitHub with its short commit code circled |
| S14 | The same commit code in the Render Events and Netlify Deploys logs |
| S15 | Render and Netlify environment dashboards with values hidden |
| S16 | Filter `is:pr is:merged` showing at least four merged PRs |
| S17 | Contributor commit counts with at least eight commits per member |
| S18 | Both final diagrams full-size and readable |

The PDF cover contains both names and roles, project title, GitHub URL, frontend URL, and backend health URL. Add each screenshot with its ID and caption in order. Name the file `IPT102_Act15_[Surname1]_[Surname2].pdf`. Both members submit the same PDF to Google Classroom.

Inspect current files and Git history for passwords, connection strings, and API keys. Mask environment values in evidence. If an Atlas credential is exposed, rotate it immediately and within the handout's 24-hour limit. A secret in Git history zeros Environment and Security. If the exposed credential is an Atlas password, failing to rotate it within 24 hours zeros the activity. If a live URL fails to open after 90 seconds on two checks, Live Deployment scores zero. Copied CI, tests, or diagrams can zero both pairs' work. Fewer than three commits halves that member's score. An unrelated or unchanged template project scores zero. After submission, leave the repository, live sites, and environment variables frozen until scores are released.
