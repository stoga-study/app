import { Link } from "react-router";
import { FundingLedger } from "@/components/FundingLedger";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { DONATE_URL } from "@/lib/queries/ledger";

/** /donate: optional giving that keeps Stoga.study free. Switched off until payments are set up. */
export default function Donate() {
  return (
    <>
      <PageHeader title="Help keep it free">Stoga.study is free for every Conestoga student. Donations help pay for the AI, so it stays that way.</PageHeader>
      <section className="card flex flex-col gap-4 p-6" aria-labelledby="give">
        <h2 id="give" className="text-[1.375rem]">Giving is optional</h2>
        <ul className="ml-5 list-disc space-y-1 text-ink-2">
          <li>Donating never unlocks anything. Everyone gets the same features and the same quality of answers.</li>
          <li>Every dollar shows up in the ledger below, next to what the app costs to run.</li>
          <li>Paying for anything needs a parent or guardian.</li>
        </ul>
        {DONATE_URL ? (
          <Button asChild className="self-start"><a href={DONATE_URL} target="_blank" rel="noopener">Donate</a></Button>
        ) : (
          <div className="flex flex-col gap-2">
            <Button disabled className="self-start">Donations open soon</Button>
            <p className="field-hint">Payments aren't set up yet. When they are, this button will work.</p>
          </div>
        )}
      </section>
      <section className="card mt-4 flex flex-col gap-4 p-6" aria-labelledby="ledger">
        <h2 id="ledger" className="text-[1.375rem]">Where the money goes</h2>
        <FundingLedger donateLink={false} />
      </section>
      <p className="mt-6 text-[0.875rem] text-muted"><Link to="/plans" className="underline">Back to plans</Link></p>
    </>
  );
}
