import { execSync } from "node:child_process";

const steps = [
  {
    label: "Client contract smoke",
    command: "npm run test:finance:payment-v2",
  },
  {
    label: "Build sanity",
    command: "npm run build",
  },
  {
    label: "Payment Cut 1 SQL validation",
    command: "npx supabase db query --linked --file supabase/supabase-test-finance-wallet-payment-sprint9b1.sql",
  },
  {
    label: "Payment reversal Cut 2 SQL validation",
    command: "npx supabase db query --linked --file supabase/supabase-test-finance-wallet-payment-reversal-sprint9b1.sql",
  },
  {
    label: "Payment Cut 3 hardening SQL validation",
    command: "npx supabase db query --linked --file supabase/supabase-test-finance-wallet-payment-hardening-sprint9b1.sql",
  },
  {
    label: "Payment execution audit",
    command: "npx supabase db query --linked --file supabase/supabase-audit-finance-wallet-payment-sprint9b1.sql",
  },
  {
    label: "Payment reversal audit",
    command: "npx supabase db query --linked --file supabase/supabase-audit-finance-wallet-payment-reversal-sprint9b1.sql",
  },
];

for (const step of steps) {
  console.log(`\n[9B.1 Suite] ${step.label}`);
  execSync(step.command, {
    stdio: "inherit",
    shell: true,
  });
}

console.log("\nSprint 9B.1 Payment V2 suite completed successfully.");
