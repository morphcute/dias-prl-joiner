import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { JobForm } from "@/components/JobForm";

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/");
  }

  const { id } = await params;

  return <JobForm editJobId={id} />;
}
