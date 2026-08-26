import { get } from "@vercel/blob";
import { isPrivateCatIconPath } from "@/lib/cat-icon";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const pathname = path.join("/");

  // The Blob store remains private. Only generated cat-icon paths are exposed
  // through this intentionally public avatar endpoint.
  if (!isPrivateCatIconPath(pathname)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const result = await get(pathname, { access: "private" });
    if (!result || result.statusCode === 304) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        ETag: result.blob.etag,
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
