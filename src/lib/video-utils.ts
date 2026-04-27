/**
 * Utilities for video URL manipulation and transformation.
 */

/**
 * Transforms a standard YouTube or TikTok URL into a platform-specific embed URL.
 * This helps bypass X-Frame-Options or CORS issues in web players.
 */
export function getEmbedUrl(url?: string): string {
  if (!url) return "";

  // 1. YouTube
  // Matches: https://www.youtube.com/watch?v=ID, https://youtu.be/ID, https://m.youtube.com/watch?v=ID
  const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  if (ytMatch && ytMatch[1]) {
    return `https://www.youtube.com/embed/${ytMatch[1]}`;
  }

  // 2. TikTok
  // Matches: https://www.tiktok.com/@user/video/ID, https://vm.tiktok.com/ID
  const ttMatch = url.match(/tiktok\.com\/(?:@[\w.-]+\/video\/|v\/|t\/|[\w.-]+\/)([\d]+)/i);
  if (ttMatch && ttMatch[1]) {
    return `https://www.tiktok.com/embed/v2/${ttMatch[1]}`;
  }

  // 3. Fallback: Return original URL (e.g. for R2 direct links or other platforms)
  return url;
}
