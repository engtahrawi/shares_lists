package com.abdallah.savemind;

import java.net.URI;
import java.net.URLDecoder;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** URL validation, normalization (for duplicate detection) and display helpers. */
final class UrlUtil {

    private static final Pattern URL_IN_TEXT = Pattern.compile(
            "(https?://[^\\s<>\"]+)|((?<![\\w@.])www\\.[^\\s<>\"]+)", Pattern.CASE_INSENSITIVE);

    private static final Map<String, String> SITE_NAMES = new HashMap<>();
    private static final Map<String, String> APP_NAMES = new HashMap<>();

    static {
        SITE_NAMES.put("youtube.com", "YouTube");
        SITE_NAMES.put("youtu.be", "YouTube");
        SITE_NAMES.put("linkedin.com", "LinkedIn");
        SITE_NAMES.put("lnkd.in", "LinkedIn");
        SITE_NAMES.put("instagram.com", "Instagram");
        SITE_NAMES.put("facebook.com", "Facebook");
        SITE_NAMES.put("fb.watch", "Facebook");
        SITE_NAMES.put("tiktok.com", "TikTok");
        SITE_NAMES.put("x.com", "X");
        SITE_NAMES.put("twitter.com", "X");
        SITE_NAMES.put("github.com", "GitHub");
        SITE_NAMES.put("medium.com", "Medium");
        SITE_NAMES.put("reddit.com", "Reddit");
        SITE_NAMES.put("wikipedia.org", "Wikipedia");
        SITE_NAMES.put("vimeo.com", "Vimeo");
        SITE_NAMES.put("t.me", "Telegram");
        SITE_NAMES.put("wa.me", "WhatsApp");
        SITE_NAMES.put("threads.net", "Threads");
        SITE_NAMES.put("substack.com", "Substack");
        SITE_NAMES.put("spotify.com", "Spotify");
        SITE_NAMES.put("coursera.org", "Coursera");
        SITE_NAMES.put("udemy.com", "Udemy");
        SITE_NAMES.put("docs.google.com", "Google Docs");
        SITE_NAMES.put("drive.google.com", "Google Drive");

        APP_NAMES.put("com.whatsapp", "WhatsApp");
        APP_NAMES.put("com.whatsapp.w4b", "WhatsApp Business");
        APP_NAMES.put("com.linkedin.android", "LinkedIn");
        APP_NAMES.put("com.google.android.youtube", "YouTube");
        APP_NAMES.put("com.instagram.android", "Instagram");
        APP_NAMES.put("com.facebook.katana", "Facebook");
        APP_NAMES.put("com.facebook.orca", "Messenger");
        APP_NAMES.put("com.twitter.android", "X");
        APP_NAMES.put("com.zhiliaoapp.musically", "TikTok");
        APP_NAMES.put("com.ss.android.ugc.trill", "TikTok");
        APP_NAMES.put("org.telegram.messenger", "Telegram");
        APP_NAMES.put("com.android.chrome", "Chrome");
        APP_NAMES.put("org.mozilla.firefox", "Firefox");
        APP_NAMES.put("com.microsoft.emmx", "Edge");
        APP_NAMES.put("com.brave.browser", "Brave");
        APP_NAMES.put("com.opera.browser", "Opera");
        APP_NAMES.put("com.sec.android.app.sbrowser", "Samsung Internet");
        APP_NAMES.put("com.google.android.gm", "Gmail");
        APP_NAMES.put("com.reddit.frontpage", "Reddit");
        APP_NAMES.put("com.google.android.googlequicksearchbox", "Google");
        APP_NAMES.put("com.slack", "Slack");
        APP_NAMES.put("com.microsoft.teams", "Teams");
        APP_NAMES.put("com.instagram.barcelona", "Threads");
        APP_NAMES.put("org.thoughtcrime.securesms", "Signal");
    }

    private UrlUtil() {}

    /** Finds the first web link inside free text, as shared by most apps. */
    static String findUrl(String text) {
        if (text == null) return null;
        Matcher m = URL_IN_TEXT.matcher(text);
        if (!m.find()) return null;
        String url = trimTrailing(m.group());
        if (url.toLowerCase(Locale.ROOT).startsWith("www.")) url = "https://" + url;
        return url;
    }

    private static String trimTrailing(String url) {
        String u = url;
        while (!u.isEmpty()) {
            char c = u.charAt(u.length() - 1);
            if (".,;:!?'\"*".indexOf(c) >= 0) {
                u = u.substring(0, u.length() - 1);
            } else if (c == ')' && count(u, '(') < count(u, ')')) {
                u = u.substring(0, u.length() - 1);
            } else if (c == ']' && count(u, '[') < count(u, ']')) {
                u = u.substring(0, u.length() - 1);
            } else {
                break;
            }
        }
        return u;
    }

    private static int count(String s, char c) {
        int n = 0;
        for (int i = 0; i < s.length(); i++) if (s.charAt(i) == c) n++;
        return n;
    }

    /**
     * Returns a cleaned, absolute http(s) URL, or null when the input is not a valid web link.
     * A bare domain such as "github.com/n8n-io" is accepted and given https.
     */
    static String validate(String input) {
        if (input == null) return null;
        String s = input.trim();
        if (s.isEmpty() || s.contains(" ") || s.contains("\n")) {
            String found = findUrl(s);
            if (found == null) return null;
            s = found;
        }
        String lower = s.toLowerCase(Locale.ROOT);
        if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
            if (lower.contains("://")) return null;
            s = "https://" + s;
        }
        try {
            URI uri = new URI(s);
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if (scheme == null || host == null) return null;
            scheme = scheme.toLowerCase(Locale.ROOT);
            if (!scheme.equals("http") && !scheme.equals("https")) return null;
            if (!host.contains(".") || host.startsWith(".") || host.endsWith(".")) return null;
            return s;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Normalizes safe URL variants so the same resource is detected as a duplicate:
     * scheme, www/m prefixes, fragments, tracking parameters, parameter order, trailing slash.
     */
    static String normalize(String url) {
        try {
            URI uri = new URI(url);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            if (host.startsWith("www.")) host = host.substring(4);
            if (host.startsWith("m.")) host = host.substring(2);
            if (host.startsWith("mobile.")) host = host.substring(7);
            if (host.equals("twitter.com")) host = "x.com";
            String path = uri.getRawPath() == null ? "" : uri.getRawPath();
            String query = uri.getRawQuery();

            if (host.equals("youtu.be") && path.length() > 1) {
                String id = path.substring(1);
                int slash = id.indexOf('/');
                if (slash > 0) id = id.substring(0, slash);
                host = "youtube.com";
                path = "/watch";
                query = "v=" + id + (query == null ? "" : "&" + query);
            }
            if (host.equals("youtube.com") && path.startsWith("/shorts/")) {
                String id = path.substring(8);
                path = "/watch";
                query = "v=" + id + (query == null ? "" : "&" + query);
            }

            List<String> kept = new ArrayList<>();
            if (query != null && !query.isEmpty()) {
                for (String part : query.split("&")) {
                    if (part.isEmpty()) continue;
                    String key = part.split("=", 2)[0];
                    try {
                        key = URLDecoder.decode(key, "UTF-8");
                    } catch (Exception ignored) {
                        // keep raw key
                    }
                    if (isTrackingParam(key.toLowerCase(Locale.ROOT), host)) continue;
                    kept.add(part);
                }
            }
            Collections.sort(kept);
            while (path.length() > 1 && path.endsWith("/")) path = path.substring(0, path.length() - 1);
            if (path.equals("/")) path = "";

            StringBuilder sb = new StringBuilder(host);
            int port = uri.getPort();
            if (port > 0 && port != 80 && port != 443) sb.append(':').append(port);
            sb.append(path);
            if (!kept.isEmpty()) {
                sb.append('?');
                for (int i = 0; i < kept.size(); i++) {
                    if (i > 0) sb.append('&');
                    sb.append(kept.get(i));
                }
            }
            return sb.toString();
        } catch (Exception e) {
            return url.trim().toLowerCase(Locale.ROOT);
        }
    }

    private static boolean isTrackingParam(String key, String host) {
        if (key.startsWith("utm_")) return true;
        switch (key) {
            case "fbclid":
            case "gclid":
            case "dclid":
            case "msclkid":
            case "igshid":
            case "igsh":
            case "mc_cid":
            case "mc_eid":
            case "ref_src":
            case "ref_url":
            case "_hsenc":
            case "_hsmi":
            case "mkt_tok":
            case "trk":
            case "trackingid":
            case "lipi":
            case "rcm":
            case "feature":
            case "si":
                return true;
            case "s":
            case "t":
                return host.equals("x.com");
            case "pp":
                return host.equals("youtube.com");
            default:
                return false;
        }
    }

    /** Host without "www.", e.g. "youtube.com". */
    static String domain(String url) {
        try {
            String host = new URI(url).getHost();
            if (host == null) return url;
            host = host.toLowerCase(Locale.ROOT);
            if (host.startsWith("www.")) host = host.substring(4);
            if (host.startsWith("m.")) host = host.substring(2);
            return host;
        } catch (Exception e) {
            return url;
        }
    }

    /** Friendly site name such as "YouTube", falling back to the domain. */
    static String siteName(String domain) {
        if (domain == null) return "";
        String d = domain;
        while (true) {
            String name = SITE_NAMES.get(d);
            if (name != null) return name;
            int dot = d.indexOf('.');
            if (dot < 0 || d.indexOf('.', dot + 1) < 0) break;
            d = d.substring(dot + 1);
        }
        return domain;
    }

    /** Friendly app name for the package that shared the link, or null when unknown. */
    static String appName(String pkg) {
        if (pkg == null || pkg.isEmpty()) return null;
        return APP_NAMES.get(pkg);
    }
}
