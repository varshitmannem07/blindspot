# BLINDSPOT

**A bias audit console for AI résumé screening.** BLINDSPOT sits next to an automated applicant tracking system (ATS) and checks every rejection: it hides personal attributes such as gender, name and origin, re-scores the résumé on the same model, and flags the decision when the score jumps. The recruiter then makes the final call with the evidence in front of them.

> In 2018 Amazon scrapped an AI recruiting tool that penalized résumés containing the word "women's". BLINDSPOT is built to catch exactly that kind of failure, one decision at a time.

## Try it

**No install needed:** download [`BLINDSPOT.html`](BLINDSPOT.html) and open it in any browser. It is a single self-contained file and works fully offline.

Then drag the files from [`sample-resumes/`](sample-resumes) onto the window, or open one of the three pre-loaded candidates and click **Run Bias Audit**.

| Sample                              | Result                                              |
| ----------------------------------- | --------------------------------------------------- |
| `1_Priya_Raman_Cloud_Architect.pdf` | Bias detected (name + location): 2.1 → 4.9          |
| `2_Jamal_Washington_Backend.pdf`    | Bias detected (name): 2.8 → 4.9                     |
| `3_Sarah_Mitchell_Backend.docx`     | Bias detected ("Girls Who Code"): 2.6 → 4.9         |
| `4_Daniel_Brooks_Backend.pdf`       | No bias: strong candidate, auto-advanced (4.9)      |
| `5_Kevin_Park_Backend.txt`          | No bias: under-qualified, decline recommended (1.4) |

All names and contact details in the samples are fictional.

## How it works

1. **Upload.** PDF, Word (.docx) or text résumés are read entirely in the browser. Nothing is sent to a server.
2. **Screen.** A simulated legacy ATS ("TalentRank") scores the résumé against the role's requirements: years of experience, required skills, GPA. Like models trained on historical hiring data, it has learned penalties for proxy tokens tied to gender and national origin.
3. **Audit.** BLINDSPOT treats the ATS as a black box. It detects personal attributes with its own detector, then runs counterfactual tests: masking each attribute, swapping gendered terms and names, and a sensitivity check that adds missing qualifications. Every variant is re-scored on the unchanged model.
4. **Verdict.** If neutralizing personal attributes moves the score by more than **+1.5**, the decision is flagged as biased and the evidence is shown: original vs adjusted score, which attributes caused it, and whether the role requirements are met.
5. **Decide.** The recruiter advances or declines. Overriding a biased rejection sends a debiasing record to the model's retraining queue. Declining despite a bias finding is flagged for compliance review. Advancing a candidate the audit found no bias against requires a documented reason. Every action is written to the audit log.

The screening model is a **simulation** with deliberately planted biases, so the audit has something real to detect. The audit itself is genuine black-box testing and would work the same way against any scoring model.

## Run from source

Requires [Node.js](https://nodejs.org) 18+.

```bash
npm install
npm run dev      # development server
npm run build    # creates dist/index.html, the single-file offline app
```

| File             | Purpose                                                            |
| ---------------- | ------------------------------------------------------------------ |
| `src/engine.js`  | Simulated ATS scoring model and the BLINDSPOT counterfactual audit |
| `src/extract.js` | In-browser text extraction from PDF (pdf.js) and Word (mammoth)    |
| `src/App.jsx`    | The recruiter console UI (React + Tailwind CSS)                    |

Built with React, Vite, Tailwind CSS, Lucide icons, pdf.js and mammoth.
