package com.abdallah.savemind;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Retrieves permitted public page text and metadata with bounded size, timeouts and
 * private-network protection (PRD FR-04 and section 12). Never invents content: what could
 * not be retrieved is reported through {@link Result#level}.
 */
final class Extractor {

    static final String FULL = "FULL";
    static final String PARTIAL = "PARTIAL";
    static final String UNAVAILABLE = "UNAVAILABLE";

    private static final int MAX_BYTES = 1_500_000;
    private static final int MAX_TEXT = 12_000;
    private static final int MAX_REDIRECTS = 5;
    private static final String USER_AGENT =
            "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) "
                    + "Chrome/126.0 Mobile Safari/537.36 SaveMind/1.0";

    private static final Pattern META = Pattern.compile("<meta\\s[^>]*>", Pattern.CASE_INSENSITIVE);
    private static final Pattern ATTR = Pattern.compile(
            "([a-zA-Z_:][-a-zA-Z0-9_:.]*)\\s*=\\s*(\"([^\"]*)\"|'([^']*)'|([^\\s\"'>]+))");
    private static final Pattern TITLE = Pattern.compile("<title[^>]*>(.*?)</title>",
            Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern CHARSET = Pattern.compile("charset\\s*=\\s*[\"']?([-\\w]+)",
            Pattern.CASE_INSENSITIVE);

    /** What was retrieved for a link. Empty fields mean "not available". */
    static final class Result {
        String finalUrl;
        String title = "";
        String description = "";
        String siteName = "";
        String ogType = "";
        String author = "";
        String published = "";
        String image = "";
        String text = "";
        String contentType = "";
        String note = "";
        String level = UNAVAILABLE;
    }

    static final class BlockedException extends IOException {
        BlockedException(String msg) {
            super(msg);
        }
    }

    private Extractor() {}

    static Result extract(String url, String sharedText) {
        Result r = new Result();
        r.finalUrl = url;
        String domain = UrlUtil.domain(url);

        oembed(url, domain, r);

        try {
            Response resp = fetch(url, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5");
            r.finalUrl = resp.finalUrl;
            r.contentType = resp.contentType;
            if (resp.code >= 400) {
                r.note = "The site answered with HTTP " + resp.code + ".";
            } else if (resp.contentType.contains("html") || resp.contentType.isEmpty()) {
                parseHtml(new String(resp.body, resp.charset), r, domain);
            } else {
                r.note = "Linked file of type " + resp.contentType + "; content is not read.";
            }
        } catch (BlockedException e) {
            r.note = e.getMessage();
        } catch (Exception | StackOverflowError e) {
            if (r.note.isEmpty()) r.note = "The page could not be retrieved (" + e.getClass().getSimpleName() + ").";
        }

        r.title = clean(r.title, 300);
        r.description = clean(r.description, 1200);
        r.text = r.text.length() > MAX_TEXT ? r.text.substring(0, MAX_TEXT) : r.text;

        int textLen = r.text.length();
        int metaLen = r.title.length() + r.description.length()
                + (sharedText == null ? 0 : sharedText.trim().length());
        if (textLen >= 400) {
            r.level = FULL;
        } else if (metaLen >= 20 || textLen >= 80) {
            r.level = PARTIAL;
        } else {
            r.level = UNAVAILABLE;
        }
        return r;
    }

    // --------------------------------------------------------------- oEmbed

    private static void oembed(String url, String domain, Result r) {
        String endpoint = null;
        String enc;
        try {
            enc = URLEncoder.encode(url, "UTF-8");
        } catch (Exception e) {
            return;
        }
        if (domain.endsWith("youtube.com") || domain.equals("youtu.be")) {
            endpoint = "https://www.youtube.com/oembed?format=json&url=" + enc;
        } else if (domain.endsWith("tiktok.com")) {
            endpoint = "https://www.tiktok.com/oembed?url=" + enc;
        } else if (domain.equals("x.com") || domain.equals("twitter.com")) {
            endpoint = "https://publish.twitter.com/oembed?omit_script=1&url=" + enc;
        } else if (domain.endsWith("vimeo.com")) {
            endpoint = "https://vimeo.com/api/oembed.json?url=" + enc;
        }
        if (endpoint == null) return;
        try {
            Response resp = fetch(endpoint, "application/json");
            if (resp.code != 200) return;
            JSONObject o = new JSONObject(new String(resp.body, StandardCharsets.UTF_8));
            String title = o.optString("title", "");
            if (!title.isEmpty()) r.title = title;
            String author = o.optString("author_name", "");
            if (!author.isEmpty()) r.author = author;
            String provider = o.optString("provider_name", "");
            if (!provider.isEmpty()) r.siteName = provider;
            String thumb = o.optString("thumbnail_url", "");
            if (thumb.startsWith("https://")) r.image = thumb;
            String html = o.optString("html", "");
            if (domain.equals("x.com") || domain.equals("twitter.com")) {
                String post = htmlToText(html);
                if (!post.isEmpty()) {
                    r.text = post;
                    r.ogType = "social post";
                }
            }
            if (domain.endsWith("vimeo.com")) {
                String desc = o.optString("description", "");
                if (!desc.isEmpty()) r.description = desc;
            }
        } catch (Exception ignored) {
            // oEmbed is best effort; the page fetch still runs
        }
    }

    // ----------------------------------------------------------------- HTML

    private static void parseHtml(String html, Result r, String domain) {
        Map<String, String> meta = new HashMap<>();
        Matcher m = META.matcher(html);
        int scanned = 0;
        while (m.find() && scanned++ < 400) {
            Map<String, String> attrs = attrs(m.group());
            String key = attrs.get("property");
            if (key == null) key = attrs.get("name");
            if (key == null) key = attrs.get("itemprop");
            String content = attrs.get("content");
            if (key == null || content == null) continue;
            key = key.toLowerCase(Locale.ROOT);
            if (!meta.containsKey(key)) meta.put(key, decodeEntities(content));
        }

        String ogTitle = first(meta, "og:title", "twitter:title");
        if (r.title.isEmpty()) {
            if (!ogTitle.isEmpty()) {
                r.title = ogTitle;
            } else {
                Matcher t = TITLE.matcher(html);
                if (t.find()) r.title = decodeEntities(stripTags(t.group(1)));
            }
        }
        if (r.description.isEmpty()) {
            r.description = first(meta, "og:description", "description", "twitter:description");
        }
        if (r.siteName.isEmpty()) r.siteName = first(meta, "og:site_name", "application-name");
        if (r.ogType.isEmpty()) r.ogType = first(meta, "og:type");
        if (r.author.isEmpty()) r.author = first(meta, "author", "article:author", "twitter:creator");
        r.published = first(meta, "article:published_time", "datepublished", "date", "og:updated_time");
        if (r.image.isEmpty()) {
            String img = first(meta, "og:image", "og:image:url", "twitter:image");
            if (img.startsWith("https://")) r.image = img;
        }

        if (domain.endsWith("youtube.com") || domain.equals("youtu.be")) {
            String raw = jsonStringValue(html, "shortDescription");
            if (raw != null) {
                String desc = unescapeJson(raw);
                if (desc.length() > r.description.length()) r.description = desc;
                if (r.text.isEmpty()) r.text = desc.length() >= 400 ? desc : "";
            }
            return;
        }

        if (r.text.isEmpty()) r.text = mainText(html);
    }

    private static String mainText(String html) {
        String h = html;
        h = h.replaceAll("(?is)<head\\b.*?</head>", " ");
        h = h.replaceAll("(?is)<(script|style|noscript|svg|template|iframe|canvas|select)\\b.*?</\\1>", " ");
        h = h.replaceAll("(?is)<!--.*?-->", " ");

        String scope = section(h, "article");
        if (scope.length() < 600) {
            String main = section(h, "main");
            if (main.length() > scope.length()) scope = main;
        }
        if (scope.length() < 600) scope = h;
        scope = scope.replaceAll("(?is)<(nav|header|footer|aside|form|button)\\b.*?</\\1>", " ");
        return htmlToText(scope);
    }

    private static String section(String html, String tag) {
        Matcher m = Pattern.compile("(?is)<" + tag + "\\b[^>]*>(.*)</" + tag + ">").matcher(html);
        return m.find() ? m.group(1) : "";
    }

    static String htmlToText(String html) {
        if (html == null || html.isEmpty()) return "";
        String s = html.replaceAll("(?i)<br\\s*/?>", "\n");
        s = s.replaceAll("(?i)</(p|div|li|h[1-6]|tr|blockquote|section|article|pre)>", "\n");
        s = stripTags(s);
        s = decodeEntities(s);
        s = s.replaceAll("[ \\t\\x0B\\f\\r\\u00A0]+", " ");
        s = s.replaceAll(" *\\n[ \\n]*", "\n");
        return s.trim();
    }

    private static String stripTags(String s) {
        return s.replaceAll("(?s)<[^>]*>", " ");
    }

    private static Map<String, String> attrs(String tag) {
        Map<String, String> out = new HashMap<>();
        Matcher a = ATTR.matcher(tag);
        while (a.find()) {
            String v = a.group(3) != null ? a.group(3) : a.group(4) != null ? a.group(4) : a.group(5);
            out.put(a.group(1).toLowerCase(Locale.ROOT), v);
        }
        return out;
    }

    private static String first(Map<String, String> meta, String... keys) {
        for (String k : keys) {
            String v = meta.get(k);
            if (v != null && !v.trim().isEmpty()) return v.trim();
        }
        return "";
    }

    private static String clean(String s, int max) {
        if (s == null) return "";
        String t = s.replaceAll("\\s+", " ").trim();
        return t.length() > max ? t.substring(0, max) + "…" : t;
    }

    static String decodeEntities(String s) {
        if (s.indexOf('&') < 0) return s;
        StringBuilder out = new StringBuilder(s.length());
        int i = 0;
        while (i < s.length()) {
            char c = s.charAt(i);
            if (c == '&') {
                int semi = s.indexOf(';', i);
                if (semi > i && semi - i <= 10) {
                    String ent = s.substring(i + 1, semi);
                    String rep = entity(ent);
                    if (rep != null) {
                        out.append(rep);
                        i = semi + 1;
                        continue;
                    }
                }
            }
            out.append(c);
            i++;
        }
        return out.toString();
    }

    private static String entity(String e) {
        try {
            if (e.startsWith("#x") || e.startsWith("#X")) {
                return new String(Character.toChars(Integer.parseInt(e.substring(2), 16)));
            }
            if (e.startsWith("#")) return new String(Character.toChars(Integer.parseInt(e.substring(1))));
        } catch (Exception ex) {
            return null;
        }
        switch (e) {
            case "amp": return "&";
            case "lt": return "<";
            case "gt": return ">";
            case "quot": return "\"";
            case "apos": return "'";
            case "nbsp": return " ";
            case "ndash": return "–";
            case "mdash": return "—";
            case "hellip": return "…";
            case "rsquo": return "’";
            case "lsquo": return "‘";
            case "rdquo": return "”";
            case "ldquo": return "“";
            case "copy": return "©";
            case "middot": return "·";
            default: return null;
        }
    }

    /** Raw (still escaped) value of the first {@code "key":"..."} in a page, scanned linearly. */
    private static String jsonStringValue(String html, String key) {
        String marker = "\"" + key + "\":\"";
        int start = html.indexOf(marker);
        if (start < 0) return null;
        start += marker.length();
        int limit = Math.min(html.length(), start + 20_000);
        for (int i = start; i < limit; i++) {
            char c = html.charAt(i);
            if (c == '\\') {
                i++;
            } else if (c == '"') {
                return html.substring(start, i);
            }
        }
        return null;
    }

    private static String unescapeJson(String s) {
        try {
            return new JSONObject("{\"v\":\"" + s + "\"}").getString("v");
        } catch (Exception e) {
            return s.replace("\\n", "\n");
        }
    }

    // ---------------------------------------------------------------- fetch

    static final class Response {
        int code;
        String finalUrl;
        String contentType = "";
        Charset charset = StandardCharsets.UTF_8;
        byte[] body = new byte[0];
    }

    /** GET with manual, re-validated redirects, a size cap and no access to private networks. */
    static Response fetch(String startUrl, String accept) throws IOException {
        String current = startUrl;
        for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
            URL u = new URL(current);
            String scheme = u.getProtocol().toLowerCase(Locale.ROOT);
            if (!scheme.equals("http") && !scheme.equals("https")) {
                throw new BlockedException("Unsupported link type.");
            }
            checkHost(u.getHost());
            HttpURLConnection c = (HttpURLConnection) u.openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(10_000);
            c.setReadTimeout(15_000);
            c.setRequestProperty("User-Agent", USER_AGENT);
            c.setRequestProperty("Accept", accept);
            c.setRequestProperty("Accept-Language", "en,ar;q=0.8");
            try {
                int code = c.getResponseCode();
                if (code >= 300 && code < 400) {
                    String loc = c.getHeaderField("Location");
                    if (loc == null) throw new IOException("Redirect without location");
                    current = new URL(u, loc).toString();
                    continue;
                }
                Response r = new Response();
                r.code = code;
                r.finalUrl = current;
                String ct = c.getContentType();
                r.contentType = ct == null ? "" : ct.toLowerCase(Locale.ROOT).split(";")[0].trim();
                InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                if (in != null) {
                    try {
                        r.body = readCapped(in);
                    } finally {
                        in.close();
                    }
                }
                r.charset = charset(ct, r.body);
                return r;
            } finally {
                c.disconnect();
            }
        }
        throw new IOException("Too many redirects");
    }

    private static byte[] readCapped(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16 * 1024];
        int n;
        while ((n = in.read(buf)) != -1) {
            int room = MAX_BYTES - out.size();
            if (room <= 0) break;
            out.write(buf, 0, Math.min(n, room));
        }
        return out.toByteArray();
    }

    private static Charset charset(String contentType, byte[] body) {
        String name = null;
        if (contentType != null) {
            Matcher m = CHARSET.matcher(contentType);
            if (m.find()) name = m.group(1);
        }
        if (name == null && body.length > 0) {
            String head = new String(body, 0, Math.min(body.length, 4096), StandardCharsets.ISO_8859_1);
            Matcher m = CHARSET.matcher(head);
            if (m.find()) name = m.group(1);
        }
        try {
            if (name != null) return Charset.forName(name);
        } catch (Exception ignored) {
            // fall through to UTF-8
        }
        return StandardCharsets.UTF_8;
    }

    private static void checkHost(String host) throws IOException {
        if (host == null || host.isEmpty()) throw new BlockedException("Link has no host.");
        String h = host.toLowerCase(Locale.ROOT);
        if (h.equals("localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
            throw new BlockedException("Links to local network addresses are not fetched.");
        }
        for (InetAddress a : InetAddress.getAllByName(host)) {
            if (isPrivate(a)) throw new BlockedException("Links to local network addresses are not fetched.");
        }
    }

    private static boolean isPrivate(InetAddress a) {
        if (a.isAnyLocalAddress() || a.isLoopbackAddress() || a.isLinkLocalAddress()
                || a.isSiteLocalAddress() || a.isMulticastAddress()) {
            return true;
        }
        byte[] b = a.getAddress();
        if (a instanceof Inet4Address) {
            int b0 = b[0] & 0xff;
            int b1 = b[1] & 0xff;
            if (b0 == 0 || b0 >= 224) return true;
            if (b0 == 100 && b1 >= 64 && b1 <= 127) return true; // carrier-grade NAT
            if (b0 == 192 && b1 == 0 && (b[2] & 0xff) == 0) return true;
            if (b0 == 198 && (b1 == 18 || b1 == 19)) return true;
        } else if (a instanceof Inet6Address) {
            if ((b[0] & 0xfe) == 0xfc) return true; // unique local fc00::/7
        }
        return false;
    }
}
