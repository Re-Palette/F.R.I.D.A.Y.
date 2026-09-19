import { getWeather, weatherPlace } from "@/lib/integrations/weather";

/**
 * The weather panel's feed.
 *
 * Goes through the server rather than straight from the browser so the
 * result can be cached once for every tab rather than once per tab, and so
 * the panel has one shape to handle whichever provider is behind it.
 */
export async function GET() {
  try {
    const report = await getWeather();
    if (!report) return Response.json({ error: "No forecast available." }, { status: 503 });
    return Response.json(report, {
      // Matches the server-side cache: a dashboard left open all day asks
      // for this a few times an hour, not a few times a minute.
      headers: { "Cache-Control": "private, max-age=600" },
    });
  } catch (err) {
    console.error("Weather lookup failed:", err);
    return Response.json({ error: "気象データを取得できませんでした。", place: weatherPlace() }, { status: 502 });
  }
}
