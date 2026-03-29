import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { JobForm } from "@/components/JobForm";

export default async function NewJobPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/");
  }

  return <JobForm />;
}
