import { Link } from "react-router";
import { dateFormat } from "@/lib/locale";
import { useLedger } from "@/lib/queries/ledger";

const money = (n: number) => (n === 0 ? "$0" : n < 0.01 ? "under 1¢" : `$${n.toFixed(2)}`);
const monthName = (iso: string) => dateFormat({ month: "long", year: "numeric" }).format(new Date(`${iso}T12:00:00`));

/** The real monthly ledger: AI costs from the usage log, hosting and funding as entered, nothing estimated. */
export function FundingLedger({ donateLink = true }: { donateLink?: boolean }) {
  const ledger = useLedger();
  if (ledger.isPending) return <div className="skeleton h-40" />;
  if (ledger.isError || !ledger.data) return <p className="text-muted">The ledger couldn't load right now.</p>;
  const months = ledger.data;
  const now = months[0];
  return (
    <div className="flex flex-col gap-5">
      {now && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="eyebrow">{monthName(now.month)} so far</p>
            <p className="big-num mt-1 text-[2.5rem]">{money(now.aiCost + now.otherCosts)}</p>
            <p className="text-[0.875rem] text-muted">to run Stoga.study</p>
          </div>
          <div>
            <p className="eyebrow">Students helped</p>
            <p className="big-num mt-1 text-[2.5rem]">{now.students}</p>
            <p className="text-[0.875rem] text-muted">used the AI this month</p>
          </div>
          <div>
            <p className="eyebrow">Funding</p>
            <p className="big-num mt-1 text-[2.5rem]">{money(now.funding)}</p>
            <p className="text-[0.875rem] text-muted">{now.funding ? "from donations and plans" : "Covered by the team for now"}</p>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-left text-[0.9375rem]">
          <caption className="sr-only">Costs and funding by month</caption>
          <thead>
            <tr className="border-b border-line text-[0.8125rem] text-muted">
              <th scope="col" className="py-2 pr-3 font-medium">Month</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">AI</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Hosting and other</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Funding</th>
              <th scope="col" className="py-2 text-right font-medium">Students</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {months.map((m) => (
              <tr key={m.month} className="border-b border-line last:border-b-0">
                <th scope="row" className="py-2.5 pr-3 font-medium">{monthName(m.month)}</th>
                <td className="py-2.5 pr-3 text-right">{money(m.aiCost)}</td>
                <td className="py-2.5 pr-3 text-right" title={m.items.filter((i) => i.kind === "cost").map((i) => `${i.label}: $${Number(i.amount).toFixed(2)}`).join(", ") || undefined}>{money(m.otherCosts)}</td>
                <td className="py-2.5 pr-3 text-right">{money(m.funding)}</td>
                <td className="py-2.5 text-right">{m.students}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[0.8125rem] text-muted">
        AI costs are worked out from every request at the provider's listed price, and include testing. Students who use their own key pay their provider, so that isn't counted. Hosting and funding are added as the bills and donations come in.{donateLink && <> <Link to="/donate" className="underline">About donating</Link>.</>}
      </p>
    </div>
  );
}
