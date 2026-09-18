import 'server-only';

export type GoogleReview = { rating: number; comment: string; name: string; publishedAt: string | null; mapsUrl: string | null };
type GooglePlaceResponse = { googleMapsUri?: string; reviews?: Array<{ rating?: number; text?: { text?: string }; authorAttribution?: { displayName?: string }; relativePublishTimeDescription?: string }> };

export async function getGooglePlaceReviews(placeId: string | null | undefined): Promise<{ reviews: GoogleReview[]; mapsUrl: string | null }> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  const normalizedPlaceId = placeId?.trim();
  if (!apiKey || !normalizedPlaceId) return { reviews: [], mapsUrl: null };
  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(normalizedPlaceId)}?languageCode=pt-PT`, { headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'googleMapsUri,reviews.rating,reviews.text,reviews.authorAttribution,reviews.relativePublishTimeDescription' }, next: { revalidate: 3600 } });
    if (!response.ok) return { reviews: [], mapsUrl: null };
    const place = await response.json() as GooglePlaceResponse;
    return { mapsUrl: place.googleMapsUri ?? null, reviews: (place.reviews ?? []).map((review) => ({ rating: Math.max(1, Math.min(5, Number(review.rating) || 5)), comment: review.text?.text?.trim() ?? '', name: review.authorAttribution?.displayName?.trim() || 'Cliente Google', publishedAt: review.relativePublishTimeDescription ?? null, mapsUrl: place.googleMapsUri ?? null })).filter((review) => review.comment) };
  } catch { return { reviews: [], mapsUrl: null }; }
}
