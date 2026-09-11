import { Workspace } from "@/components/workspace";
export default async function BrandPage({
  params,
}: {
  params: Promise<{ projectId: string; brandId: string }>;
}) {
  const { projectId, brandId } = await params;
  return <Workspace initialProjectId={projectId} initialBrandId={brandId} />;
}
