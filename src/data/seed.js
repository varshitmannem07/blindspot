/** Pre-loaded demo candidates, role-independent UI constants. Every score is computed live by the engine. */
export const SEED = [
  {
    id: "4092",
    jobId: "backend",
    applied: "Sep 22, 2026",
    text: `Elena Rostova
Seattle, WA
B.S. Computer Science, University of Washington — GPA 4.0
Senior Software Engineer, Stripe (2021–present) — Python services on a Kafka event bus
Software Engineer, Datadog (2019–2021) — Python, AWS distributed ingest pipeline
President, Women's Coding Society`,
  },
  {
    id: "5102",
    jobId: "backend",
    applied: "Sep 23, 2026",
    text: `Chloe Miller
Austin, TX
Web Development Bootcamp Certificate (2023)
Junior Web Developer, Local Agency (2025–present) — HTML and CSS landing pages
Skills: HTML, CSS, jQuery
Member, Women in Tech Austin`,
  },
  {
    id: "3881",
    jobId: "cloud",
    applied: "Sep 21, 2026",
    text: `Fatima Al-Nuaimi
Dubai, UAE
Al Ain Model School, UAE
M.S. Computer Engineering, Khalifa University
Lead Platform Engineer, Careem (2020–present) — 300-node Kubernetes fleet, Go operators
Certified Kubernetes Administrator · HashiCorp Terraform Associate`,
  },
];

export const TEMPLATE = `Full Name
City, Region
B.S. Computer Science, University Name — GPA 3.7
Job Title, Company (2020–present) — main skills and technologies
Skills: Python, Kafka, AWS
Clubs, volunteering or leadership`;

export const AUDIT_STEPS = ["Detecting personal attributes", "Re-scoring neutralized variants", "Comparing results"];
export const STEP_MS = 800;

export const OVERRIDE_REASONS = [
  "Relevant transferable experience",
  "Strong growth potential",
  "Referral or prior assessment",
  "Role requirements under review",
  "Other",
];
