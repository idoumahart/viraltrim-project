export const securityHeadersPlugin = async (c: any, next: any) => {
  await next();
  c.header(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'", 
      "style-src 'self' 'unsafe-inline' https://api.fontshare.com",
      "font-src 'self' https://api.fontshare.com data:",
      "img-src 'self' data: blob: https://img.youtube.com https://i.ytimg.com https://raw.githubusercontent.com",
      "media-src 'self' blob: https:",
      "connect-src 'self' https://generativelanguage.googleapis.com https://api.stripe.com",
      "frame-src https://www.youtube.com https://js.stripe.com",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self' https://checkout.stripe.com",
      "upgrade-insecure-requests",
    ].join("; ")
  );
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
};
