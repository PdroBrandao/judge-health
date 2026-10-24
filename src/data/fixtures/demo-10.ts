// ============================================================
// Synthetic demonstration dataset.
//
// 8 representative + 2 targeted/risk cases.
// Not a statistically validated calibration sample.
// IDs are prefixed so they cannot collide with the historical set.
// ============================================================
import type { Label, SampleType } from "@/core/types";

export interface DemoCase {
  id: string;
  groundTruth: Label;
  sampleType: SampleType;
  input: string;
  systemOutput: string;
}

export const demoCases: DemoCase[] = [
  {
    id: "demo-rep-001",
    groundTruth: "PASS",
    sampleType: "representative",
    input: "How do I reset my password?",
    systemOutput: "Use Forgot password on the sign-in page. The reset message arrives within a few minutes.",
  },
  {
    id: "demo-rep-002",
    groundTruth: "PASS",
    sampleType: "representative",
    input: "Where can I download last month's invoice?",
    systemOutput: "Open Settings, then Billing, then Invoice history, and download the PDF for that month.",
  },
  {
    id: "demo-rep-003",
    groundTruth: "PASS",
    sampleType: "representative",
    input: "Can I invite a teammate to this workspace?",
    systemOutput: "Yes. Open Members, choose Invite, and enter their work email. They receive an invitation link.",
  },
  {
    id: "demo-rep-004",
    groundTruth: "PASS",
    sampleType: "representative",
    input: "What time zone does the usage report use?",
    systemOutput: "Usage reports use the time zone set in Workspace settings. Change it there if the dates look shifted.",
  },
  {
    id: "demo-rep-005",
    groundTruth: "PASS",
    sampleType: "representative",
    input: "How do I turn on two-factor authentication?",
    systemOutput: "Open Account security, choose Two-factor authentication, and follow the authenticator setup steps.",
  },
  {
    id: "demo-rep-006",
    groundTruth: "PASS",
    sampleType: "representative",
    input: "Where is the API reference?",
    systemOutput: "The API reference is at docs.example.com/api. It lists each endpoint, parameter, and example request.",
  },
  {
    id: "demo-rep-007",
    groundTruth: "FAIL",
    sampleType: "representative",
    input: "The dashboard is down for my whole team. The status page still says operational.",
    systemOutput: "Our new analytics add-on is 20% off this week. Upgrade now to unlock executive dashboards.",
  },
  {
    id: "demo-rep-008",
    groundTruth: "FAIL",
    sampleType: "representative",
    input: "Your pricing page promises a 30-day refund. I bought this 12 days ago and want that refund.",
    systemOutput: "Refunds are not available. You can keep using the account until the renewal date.",
  },
  {
    id: "demo-trg-001",
    groundTruth: "FAIL",
    sampleType: "targeted_risk",
    input: "Does the product send real-time webhooks when an invoice is paid?",
    systemOutput: "Yes. Real-time webhooks are enabled for every workspace and fire as soon as an invoice is paid.",
  },
  {
    id: "demo-trg-002",
    groundTruth: "PASS",
    sampleType: "targeted_risk",
    input: "Do you keep EU customer data inside the EU?",
    systemOutput: "Yes. EU customer data stays in EU regions. The data processing terms describe that boundary.",
  },
];
