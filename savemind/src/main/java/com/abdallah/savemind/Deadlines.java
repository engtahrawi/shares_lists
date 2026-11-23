package com.abdallah.savemind;

import java.util.Calendar;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Parses deadline strings ("YYYY-MM-DD" or "YYYY-MM-DDTHH:MM") into local epoch milliseconds. */
final class Deadlines {

    private static final Pattern FORMAT = Pattern.compile(
            "^(\\d{4})-(\\d{2})-(\\d{2})(?:[T ](\\d{2}):(\\d{2}))?$");

    /** Parsed deadline: epoch ms and whether a time of day was given. */
    static final class Value {
        final long at;
        final boolean hasTime;

        Value(long at, boolean hasTime) {
            this.at = at;
            this.hasTime = hasTime;
        }
    }

    private Deadlines() {}

    /** Returns null for anything malformed or outside 2000 to 2100. A date alone means 23:59 that day. */
    static Value parse(String text) {
        if (text == null) return null;
        Matcher m = FORMAT.matcher(text.trim());
        if (!m.matches()) return null;
        int year = Integer.parseInt(m.group(1));
        int month = Integer.parseInt(m.group(2));
        int day = Integer.parseInt(m.group(3));
        boolean hasTime = m.group(4) != null;
        int hour = hasTime ? Integer.parseInt(m.group(4)) : 23;
        int minute = hasTime ? Integer.parseInt(m.group(5)) : 59;
        if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31
                || hour > 23 || minute > 59) {
            return null;
        }
        Calendar c = Calendar.getInstance();
        c.setLenient(false);
        c.clear();
        c.set(year, month - 1, day, hour, minute, 0);
        try {
            return new Value(c.getTimeInMillis(), hasTime);
        } catch (IllegalArgumentException e) {
            return null; // e.g. 31 February
        }
    }
}
