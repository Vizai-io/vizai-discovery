import { handleRunControl } from "@/lib/registry-intelligence/run-control-route";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleRunControl(params, "resume");
}
