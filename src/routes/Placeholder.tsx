import { Construction } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/States";

/** Temporary screen for routes whose milestone has not landed yet. */
export default function Placeholder({ title, milestone }: { title: string; milestone: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState icon={<Construction />} title="Not built yet">
        This screen arrives in {milestone} of the v1.0 build.
      </EmptyState>
    </>
  );
}
